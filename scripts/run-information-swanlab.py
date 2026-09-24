"""Capture the child process stdout directly in SwanLab's terminal log tab."""

import getpass
import json
import os
import signal
import subprocess
import sys
from pathlib import Path
import swanlab

directory = Path(sys.argv[1])
directory.mkdir(parents=True, exist_ok=True)
key = os.environ.get("SWANLAB_API_KEY") or getpass.getpass("SwanLab API key: ")
swanlab.login(api_key=key, save=False)
del key
run = swanlab.init(
    project="jaipur-dmc",
    name=directory.name,
    public=False,
    log_dir=str(directory / "swanlab"),
    config={
        "algorithm": "public-history policy/value + root sampling",
        "stage": "training-or-evaluation",
        **(
            json.loads((directory / "request.json").read_text())
            if (directory / "request.json").exists()
            else {}
        ),
    },
    settings=swanlab.Settings(
        interactive=False,
        probe={
            "git": False,
            "runtime": False,
            "requirements": False,
            "hardware": False,
            "monitor": False,
            "swanlab": False,
        },
        terminal={"proxy_type": "stdout"},
    ),
)
(directory / "swanlab-run.json").write_text(
    json.dumps({"url": run.url, "status": "running"}) + "\n"
)
print(run.url, flush=True)
status = "failed"
child = None
try:
    child = subprocess.Popen(
        sys.argv[2:],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    with (directory / "console.log").open("a") as log:
        for line in child.stdout:
            print(line, end="", flush=True)
            log.write(line)
            log.flush()
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if not isinstance(row, dict):
                continue
            metrics = {
                row.get("type", "progress") + "/" + k: v
                for k, v in row.items()
                if isinstance(v, (float, int))
            }
            if metrics:
                swanlab.log(metrics)
    code = child.wait()
    status = "completed" if code == 0 else "failed"
finally:
    if child is not None and child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
    (directory / "swanlab-run.json").write_text(
        json.dumps({"url": run.url, "status": status}) + "\n"
    )
    swanlab.finish()
sys.exit(code)
