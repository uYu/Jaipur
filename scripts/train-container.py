"""Portable CPU training entry point: random initialization on the first run."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import uuid
from datetime import datetime, timezone


def positive_int(name, default):
    value = int(os.environ.get(name, default))
    if value < 1:
        raise ValueError(f"{name} must be positive")
    return value


def main():
    games = positive_int("TRAIN_GAMES", "32768")
    positive_int("TRAIN_THREADS", "4")
    if games % 32:
        raise ValueError("TRAIN_GAMES must be a multiple of 32")
    root = Path(os.environ.get("TRAIN_OUTPUT_ROOT", "/runs")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    resume = os.environ.get("TRAIN_RESUME", "auto")
    source = None
    if resume == "auto":
        # Only completed atomic checkpoints are eligible; interrupted batches are discarded.
        for path in sorted(root.glob("run-*/model.pt"), reverse=True):
            source = path.parent
            break
    elif resume != "none":
        source = Path(resume)
        if not source.is_absolute():
            source = root / source
        source = source.resolve()
        if not (source / "model.pt").is_file():
            raise ValueError(f"No checkpoint found in {source}")
    seed_base = int(os.environ.get("TRAIN_SEED_BASE", "500000"))
    if source is not None and (source / "config.json").is_file():
        # Global iteration continues, so preserve the old base to avoid overlap.
        seed_base = json.loads((source / "config.json").read_text())["seed_base"]
    run = root / (
        datetime.now(timezone.utc).strftime("run-%Y%m%dT%H%M%S-") + uuid.uuid4().hex[:8]
    )
    run.mkdir()
    command = [
        sys.executable,
        "scripts/train-information-ppo.py",
        str(source or "-"),
        str(run),
        str(games // 32),
        "--seed-base",
        str(seed_base),
        "--random-seed",
        os.environ.get("TRAIN_RANDOM_SEED", "9241"),
    ]
    if source is None:
        command.append("--scratch")
    mode = os.environ.get("TRAIN_SWANLAB", "auto")
    if mode not in {"auto", "on", "off"}:
        raise ValueError("TRAIN_SWANLAB must be auto, on, or off")
    online = mode == "on" or (
        mode == "auto" and bool(os.environ.get("SWANLAB_API_KEY"))
    )
    if online and not os.environ.get("SWANLAB_API_KEY"):
        raise ValueError("Set SWANLAB_API_KEY for online logging, or TRAIN_SWANLAB=off")
    request = {
        "additional_games": games,
        "initialization": "checkpoint" if source else "random",
        "source": str(source) if source else None,
        "swanlab": online,
    }
    (run / "request.json").write_text(json.dumps(request, indent=2) + "\n")
    print(
        f"[训练目录] {run}\n[初始化] {'恢复 ' + str(source) if source else '随机权重，从0开始'}\n[新增对局] {games}",
        flush=True,
    )
    if online:
        command = [
            sys.executable,
            "scripts/run-information-swanlab.py",
            str(run),
            *command,
        ]
    child = None

    def stop(signum, _frame):
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGINT)
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    status = "failed"
    try:
        child = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            start_new_session=True,
        )
        # SwanLab owns console.log when enabled; keep a separate full container transcript.
        with (run / "container.log").open("a") as log:
            for line in child.stdout:
                print(line, end="", flush=True)
                log.write(line)
                log.flush()
        if child.wait():
            raise RuntimeError(f"Training exited with code {child.returncode}")
        subprocess.run(
            [
                "node",
                "--experimental-strip-types",
                "scripts/verify-information-continuation.ts",
                str(run),
            ],
            check=True,
        )
        status = "completed"
        print(f"[完成] 模型及完整回放核验已保存到 {run}", flush=True)
    except KeyboardInterrupt:
        status = "interrupted"
        raise
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGINT)
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        (run / "status.json").write_text(json.dumps({"status": status}) + "\n")


if __name__ == "__main__":
    main()
