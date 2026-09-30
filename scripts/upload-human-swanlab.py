"""Upload aggregate human-replay training metrics and the selected checkpoint."""

import json
import os
from pathlib import Path
import subprocess
import sys

import swanlab


def main():
    directory = Path(sys.argv[1])
    command = sys.argv[2:]
    if command[:1] == ["--"]:
        command = command[1:]
    preparation = json.loads((directory / "preparation.json").read_text())
    training = json.loads((directory / "training.json").read_text())
    if not (directory / "model.pt").is_file() or not (directory / "model.json").is_file():
        raise FileNotFoundError("Selected model files are missing")
    key = os.environ.get("SWANLAB_API_KEY")
    if not key:
        raise ValueError("SWANLAB_API_KEY is required")
    swanlab.login(api_key=key, save=False)
    del key
    run = swanlab.init(
        project=os.environ.get("JAIPUR_SWANLAB_PROJECT", "jaipur-human-replays"),
        name=directory.name,
        public=False,
        description="Original-variant human replay behavior cloning with public card memory; validation by game; match evaluation reserved for user.",
        config={
            "dataset": "noidvan/jaipur",
            "dataset_license": "CC-BY-NC-4.0",
            "input_sha256": preparation["input_sha256"],
            "variant": preparation["variant"],
            "selected_games": preparation["selected_games"],
            "train_games": training["train_games"],
            "validation_games": training["validation_games"],
            "train_positions": training["train_positions"],
            "validation_positions": training["validation_positions"],
            "split": preparation["split"],
            "validation_percent": preparation["validation_percent"],
            "stride": preparation["stride"],
            "state_features": preparation["state_features"],
            "action_features": preparation["action_features"],
            "rejected_games": preparation["stats"].get("rejected_games", 0),
            "validation_has_full_legal_action_set": True,
            "match_evaluation": "user-run, not included in this experiment",
            "live_training": bool(command),
            "prior_epochs_backfilled": len(training["history"]) if command else 0,
        },
        log_dir=str(directory / "swanlab"),
        settings=swanlab.Settings(
            interactive=False,
            probe={"git": False, "runtime": False, "requirements": False,
                   "hardware": False, "monitor": False, "swanlab": False},
            terminal={"proxy_type": "none"},
        ),
    )
    try:
        (directory / "swanlab-run.json").write_text(json.dumps({"url": run.url, "status": "running"}, indent=2) + "\n")
        print(json.dumps({"url": run.url, "status": "running"}), flush=True)
        seen_epochs = set()

        def log_epoch(row):
            if row["epoch"] in seen_epochs:
                return
            swanlab.log({"validation/nll": row["nll"],
                         "validation/top1": row["top1"],
                         "validation/random_top1": training["validation_random_top1"]},
                        step=row["epoch"])
            seen_epochs.add(row["epoch"])

        for row in training["history"]:
            log_epoch(row)
        if command:
            child = subprocess.Popen(command, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, text=True, bufsize=1)
            for line in child.stdout:
                print(line, end="", flush=True)
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if isinstance(row, dict) and all(k in row for k in ("epoch", "nll", "top1")):
                    log_epoch(row)
            if child.wait():
                raise RuntimeError(f"Training exited {child.returncode}")
            training = json.loads((directory / "training.json").read_text())
        best = next(row for row in training["history"] if row["epoch"] == training["best_epoch"])
        swanlab.log({"summary/best_epoch": training["best_epoch"],
                     "summary/best_validation_nll": best["nll"],
                     "summary/best_validation_top1": best["top1"],
                     "summary/train_positions": training["train_positions"],
                     "summary/validation_positions": training["validation_positions"],
                     "summary/rejected_games": preparation["stats"].get("rejected_games", 0)},
                    step=training["history"][-1]["epoch"] + 1)
        for name in ("model.pt", "model.json", "preparation.json", "training.json"):
            swanlab.save(str(directory / name), base_path=str(directory), policy="now")
        (directory / "swanlab-run.json").write_text(json.dumps({"url": run.url, "status": "completed"}, indent=2) + "\n")
    except Exception:
        swanlab.finish(state="crashed")
        raise
    else:
        swanlab.finish()
        print(json.dumps({"url": run.url, "status": "completed"}))


if __name__ == "__main__":
    main()
