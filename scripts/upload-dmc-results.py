"""Upload verified DMC aggregates to a private SwanLab run; never upload raw games."""
import argparse
import json
import os
from pathlib import Path

import swanlab


def read(path):
    return json.loads(path.read_text())


parser = argparse.ArgumentParser()
parser.add_argument("kind", choices=["resume", "confirm"])
parser.add_argument("directory", type=Path)
args = parser.parse_args()
directory = args.directory
run_file = directory / "swanlab-run.json"
if run_file.exists():
    raise SystemExit(f"Run already recorded in {run_file}; refusing duplicate upload")
verification = read(directory / "verification.json")
if args.kind == "resume":
    if verification["replayedEvaluationGames"] != 192:
        raise ValueError("Resume evaluation has not been verified")
    config = read(directory / "config.json")
    summary = read(directory / "evaluation-summary.json")
else:
    if not verification["verified"] or verification["games"] != 1024:
        raise ValueError("Confirmation evaluation has not been verified")
    summary = read(directory / "new-versus-old.json")
    config = {
        "candidate": summary["checkpoint"],
        "baseline": summary["opponent"],
        "startSeed": summary["start"],
        "pairedSeeds": summary["pairs"],
        "comparison": "pure DMC complete-match head-to-head",
    }

swanlab.login(api_key=os.environ["SWANLAB_API_KEY"], save=False)
run = swanlab.init(
    project=os.environ.get("SWANLAB_PROJECT", "jaipur-dmc"),
    name=directory.name,
    public=False,
    description="Verified complete-match DMC research; aggregate metrics only; no promotion.",
    config=config,
    log_dir=str(directory / "swanlab"),
    settings=swanlab.Settings(
        interactive=False,
        probe={"git": False, "runtime": False, "requirements": False,
               "hardware": False, "monitor": False, "swanlab": False},
        terminal={"proxy_type": "none"},
    ),
)
try:
    if args.kind == "resume":
        for line in (directory / "training.jsonl").read_text().splitlines():
            row = json.loads(line)
            metrics = {"train/version": row["version"]}
            for source, target in (
                ("mse", "train/mse"), ("samples", "train/batch_samples"),
                ("cumulativeSamples", "train/cumulative_samples"),
                ("completed", "selfplay/completed"),
                ("cumulativeMatches", "selfplay/cumulative_matches"),
                ("truncated", "selfplay/truncated"),
                ("elapsedSeconds", "time/iteration_seconds"),
            ):
                if source in row:
                    metrics[target] = row[source]
            if row.get("arena"):
                wins, losses = row["arena"]["wins"]
                metrics.update({"dev/wins": wins, "dev/losses": losses,
                                "dev/win_rate": wins / row["arena"]["matches"]})
            swanlab.log(metrics, step=row["iteration"])
        final = {
            "selection/selected_version": int(Path(summary["selectedCheckpoint"]).stem.split("-")[-1]),
            "selection/promoted": 0,
            "verification/replayed_evaluation_games": verification["replayedEvaluationGames"],
            "verification/replayed_evaluation_actions": verification["replayedEvaluationActions"],
            "time/controlled_speedup": read(directory / "speed-check.json")["speedup"],
        }
        for source, prefix in (
            ("selectedNormal", "heldout/selected_normal"),
            ("priorNormal", "heldout/prior_normal"),
            ("selectedPrior", "heldout/selected_prior"),
        ):
            result = summary["evaluations"][source]
            wins, losses = result["wins"]
            final.update({f"{prefix}/wins": wins, f"{prefix}/losses": losses,
                          f"{prefix}/win_rate": wins / (wins + losses),
                          f"{prefix}/candidate_mean_ms": result["meanWallMs"][0]})
        swanlab.log(final, step=129)
    else:
        wins, losses = verification["wins"]
        swanlab.log({
            "heldout/wins": wins,
            "heldout/losses": losses,
            "heldout/win_rate": verification["newModelWinRate"],
            "pairs/new_model_two": verification["pairOutcomes"]["newModelTwo"],
            "pairs/split": verification["pairOutcomes"]["split"],
            "pairs/old_model_two": verification["pairOutcomes"]["oldModelTwo"],
            "statistics/paired_two_sided_p": verification["pairedTwoSidedP"],
            "verification/replayed_actions": verification["replayedActions"],
            "selection/promoted": 0,
        }, step=0)
except Exception:
    swanlab.finish(state="crashed")
    raise
else:
    swanlab.finish(state="success")
    run_file.write_text(json.dumps({"url": run.url, "project": config.get("project", "jaipur-dmc")}, indent=2) + "\n")
    print(run.url)
