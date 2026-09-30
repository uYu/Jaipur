"""Start SwanLab before training and stream every validation epoch live."""
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
    if not command:
        raise ValueError("Training command is required")
    key = os.environ.get("SWANLAB_API_KEY")
    if not key:
        raise ValueError("SWANLAB_API_KEY is required")
    preparation = json.loads((directory / "preparation.json").read_text())
    value_coefficient = (float(command[command.index("--value-coefficient") + 1])
                         if "--value-coefficient" in command else 0.25)
    swanlab.login(api_key=key, save=False)
    del key
    run = swanlab.init(
        project=os.environ.get("JAIPUR_SWANLAB_PROJECT", "jaipur-human-replays"),
        name=directory.name,
        public=False,
        description=("Public-history Jaipur replay policy, equal-weight imitation; "
                     f"match-outcome loss coefficient {value_coefficient}."),
        config={"dataset": "noidvan/jaipur", "dataset_license": "CC-BY-NC-4.0",
                "input_sha256": preparation["input_sha256"],
                "selected_games": preparation["selected_games"],
                "train_games": preparation["stats"]["train_games"],
                "validation_games": preparation["stats"]["validation_games"],
                "train_positions": preparation["stats"]["train"],
                "validation_positions": preparation["stats"]["validation"],
                "selection_rule": preparation.get("selection_rule", "all observed actions"),
                "state_features": 154, "action_features": 12,
                "value_coefficient": value_coefficient,
                "split": preparation["split"], "class_weights": "none",
                "validation_has_full_legal_action_set": True,
                "match_evaluation": "user-run"},
        log_dir=str(directory / "swanlab"),
        settings=swanlab.Settings(
            interactive=False,
            probe={"git": False, "runtime": False, "requirements": False,
                   "hardware": False, "monitor": False, "swanlab": False},
            terminal={"proxy_type": "none"}),
    )
    (directory / "swanlab-run.json").write_text(json.dumps({"url": run.url, "status": "running"}) + "\n")
    print(json.dumps({"url": run.url, "status": "running"}), flush=True)
    try:
        child = subprocess.Popen(command, stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, text=True, bufsize=1)
        for line in child.stdout:
            print(line, end="", flush=True)
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if not isinstance(row, dict) or "epoch" not in row:
                continue
            metrics = {"validation/nll": row["nll"], "validation/top1": row["top1"],
                       "validation/value_bce": row["value_bce"],
                       "validation/selection": row["selection"]}
            for category, accuracy in row["category_top1"].items():
                metrics[f"validation/top1_{category}"] = accuracy
            for key in ("train_loss", "train_policy_nll", "train_value_bce"):
                if key in row:
                    metrics[f"train/{key}"] = row[key]
            swanlab.log(metrics, step=row["epoch"])
        if child.wait():
            raise RuntimeError(f"Training exited {child.returncode}")
        training = json.loads((directory / "training.json").read_text())
        best = training["history"][training["best_epoch"]]
        swanlab.log({"summary/best_epoch": training["best_epoch"],
                     "summary/best_nll": best["nll"], "summary/best_top1": best["top1"]},
                    step=training["history"][-1]["epoch"] + 1)
        for name in ("model.pt", "model.json", "preparation.json", "training.json"):
            swanlab.save(str(directory / name), base_path=str(directory), policy="now")
        (directory / "swanlab-run.json").write_text(json.dumps({"url": run.url, "status": "completed"}) + "\n")
    except Exception:
        swanlab.finish(state="crashed")
        raise
    else:
        swanlab.finish()
        print(json.dumps({"url": run.url, "status": "completed"}), flush=True)


if __name__ == "__main__":
    main()
