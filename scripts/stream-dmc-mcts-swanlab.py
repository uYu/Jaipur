"""Publish verified MCTS match progress as aggregate metrics, not raw game logs."""
import json
import os
from pathlib import Path
import sys
import threading
import time

import swanlab


directory = Path(sys.argv[1])
expected = 16
checkpoint = "analysis/dmc-resume-fast-2026-09-24/model-738.pt"
run_file = directory / "swanlab-run.json"
if run_file.exists():
    raise SystemExit(f"Run already recorded in {run_file}; refusing duplicate upload")
swanlab.login(api_key=os.environ["SWANLAB_API_KEY"], save=False)
run = swanlab.init(
    project=os.environ.get("SWANLAB_PROJECT", "jaipur-dmc"),
    name=directory.name,
    public=False,
    description="1-second complete-decision DMC root-prior MCTS versus current guided search; paired full matches; no promotion.",
    config={"candidate": "dmcMcts", "baseline": "guidedBehavior",
            "checkpoint": checkpoint, "rootMix": 0.5,
            "budgetMs": 1000, "startSeed": 41001, "pairedSeeds": 8,
            "comparison": "equal-time", "promoted": False},
    log_dir=str(directory / "swanlab"),
    settings=swanlab.Settings(
        interactive=False,
        probe={"git": False, "runtime": False, "requirements": False,
               "hardware": False, "monitor": False, "swanlab": False},
        terminal={"proxy_type": "stdout"},
    ),
)
run_file.write_text(json.dumps({"url": run.url, "status": "running"}, indent=2) + "\n")
print(run.url, flush=True)


def receive_live_moves():
    """Relay the benchmark's already-running terminal output into this run."""
    with (directory / "live-moves.jsonl").open("a") as destination:
        for line in sys.stdin:
            try:
                move = json.loads(line)
                if not all(key in move for key in ("seed", "seat", "round", "turns")):
                    continue
            except json.JSONDecodeError:
                continue
            destination.write(json.dumps(move, ensure_ascii=False) + "\n")
            destination.flush()


threading.Thread(target=receive_live_moves, daemon=True).start()
seen = 0
wins = [0, 0]
last_progress = None
seen_moves = 0
step = 0
try:
    while True:
        log = directory / "matches-games.jsonl"
        if log.exists():
            contents = log.read_text()
            rows = []
            for line in contents.splitlines():
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    break  # An append may still be in progress.
            if len(rows) > expected:
                raise ValueError("More games than the preregistered 16")
            for row in rows[seen:]:
                if row["seed"] not in range(41001, 41009) or row["winner"] not in (0, 1):
                    raise ValueError("Unexpected match record")
                wins[row["winner"]] += 1
                seen += 1
                step += 1
                swanlab.log({"games/completed": seen,
                             "games/candidate_wins": wins[0],
                             "games/baseline_wins": wins[1],
                             "games/candidate_win_rate": wins[0] / seen,
                             "games/seed": row["seed"],
                             "games/candidate_seat": row["seat"]}, step=step)
                print(f"[完赛] 已完成 {seen}/{expected} 局；候选:基线胜场 {wins[0]}:{wins[1]}", flush=True)
        moves_path = directory / "live-moves.jsonl"
        if moves_path.exists():
            move_rows = []
            for line in moves_path.read_text().splitlines():
                try:
                    move_rows.append(json.loads(line))
                except json.JSONDecodeError:
                    break
            for move in move_rows[seen_moves:]:
                seen_moves += 1
                step += 1
                swanlab.log({
                    "live/current_game": move["game"],
                    "live/seed": move["seed"],
                    "live/candidate_seat": move["seat"],
                    "live/round": move["round"],
                    "live/turns": move["turns"],
                    "live/candidate_seals": move["candidate_seals"],
                    "live/baseline_seals": move["baseline_seals"],
                    "live/candidate_round_points": move["candidate_points"],
                    "live/baseline_round_points": move["baseline_points"],
                    "live/round_settled": int(move["settled"]),
                }, step=step)
                score_type = "本轮结算" if move["settled"] else "本轮已得筹码"
                print(
                    f"[进展] 第 {move['game']}/{expected} 局 种子 {move['seed']} "
                    f"候选座位 {move['seat']} 第 {move['round']} 轮 第 {move['turns']} 手"
                    f" | 印章 {move['candidate_seals']}:{move['baseline_seals']}"
                    f" | {score_type} {move['candidate_points']}:{move['baseline_points']}",
                    flush=True,
                )
        progress_path = directory / "progress.json"
        if progress_path.exists():
            try:
                progress = json.loads(progress_path.read_text())
            except json.JSONDecodeError:
                progress = None  # Writer is replacing the snapshot.
            if progress:
                key = (progress["seed"], progress["seat"], progress["round"],
                       progress["turns"], progress["phase"])
                if key != last_progress:
                    last_progress = key
                    step += 1
                    swanlab.log({
                        "live/current_game": min(expected, seen + 1),
                        "live/completed_games": seen,
                        "live/seed": progress["seed"],
                        "live/candidate_seat": progress["seat"],
                        "live/round": progress["round"],
                        "live/turns": progress["turns"],
                        "live/phase": {"playing": 0, "roundEnd": 1, "finished": 2}[progress["phase"]],
                        "live/candidate_wins": wins[0],
                        "live/baseline_wins": wins[1],
                    }, step=step)
        summary_path = directory / "evaluation-summary.json"
        if seen == expected and summary_path.exists():
            summary = json.loads(summary_path.read_text())
            result = summary["results"][0]
            if not result["verified"] or result["wins"] != wins or summary["checkpoint"] != checkpoint:
                raise ValueError("Final independent verification does not match progress")
            swanlab.log({
                "final/verified": 1,
                "final/candidate_wins": wins[0],
                "final/baseline_wins": wins[1],
                "final/candidate_mean_ms": result["meanWallMs"][0],
                "final/baseline_mean_ms": result["meanWallMs"][1],
                "selection/promoted": 0,
            }, step=step + 1)
            break
        time.sleep(2)
except Exception:
    swanlab.finish(state="crashed")
    raise
else:
    swanlab.finish(state="success")
    run_file.write_text(json.dumps({"url": run.url, "status": "verified-complete"}, indent=2) + "\n")
