"""Keep training matches where both players have established high Elo."""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--ratings", type=Path, required=True)
    parser.add_argument("--parquet", type=Path, default=Path("data/hf-jaipur/data/games.parquet"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--min-elo", type=float, default=1525)
    parser.add_argument("--min-games", type=int, default=10)
    parser.add_argument("--min-opponents", type=int, default=5)
    parser.add_argument("--actor-only", action="store_true",
                        help="Keep high-rated actors' actions even when their opponent is not high-rated")
    args = parser.parse_args()
    with args.ratings.open(newline="") as stream:
        high = {
            row["player_id"] for row in csv.DictReader(stream)
            if int(row["train_games"]) >= args.min_games
            and int(row["distinct_opponents"]) >= args.min_opponents
            and float(row["elo_shuffle_mean"]) >= args.min_elo
        }
    included = set()
    game_details = {}
    for batch in pq.ParquetFile(args.parquet).iter_batches(
        batch_size=512, columns=["game_id", "variant", "player_0", "player_1", "winner"]
    ):
        batch = batch.filter(pc.equal(batch.column("variant"), "original"))
        for game in batch.to_pylist():
            if game["winner"] not in (0, 1):
                continue
            bucket = int.from_bytes(hashlib.sha256(game["game_id"].encode()).digest()[:8], "big") % 100
            if bucket >= 10:
                game_details[game["game_id"]] = game
                if ((game["player_0"] in high or game["player_1"] in high)
                        if args.actor_only else
                        (game["player_0"] in high and game["player_1"] in high)):
                    included.add(game["game_id"])
    args.output.mkdir(parents=True, exist_ok=True)
    validation = args.output / "validation.jsonl"
    if not validation.exists():
        validation.symlink_to(args.prepared.resolve() / "validation.jsonl")
    stats = Counter()
    selected_games = set()
    with (args.prepared / "train.jsonl").open() as source, (args.output / "train.jsonl").open("w") as target:
        for line in source:
            row = json.loads(line)
            stats["source_positions"] += 1
            if row["game_id"] not in included:
                continue
            if args.actor_only:
                game = game_details[row["game_id"]]
                actor = game["winner"] if row["outcome"] else 1 - game["winner"]
                if round(row["state"][33]) != actor:
                    raise ValueError("Actor and winner label disagree")
                if game[f"player_{actor}"] not in high:
                    continue
            target.write(line)
            selected_games.add(row["game_id"])
            stats["train"] += 1
            stats["train_candidates"] += len(row["actions"])
            kind = ["take", "sell", "trade"][row["actions"][row["chosen"]][:3].index(1)]
            stats[f"train_{kind}"] += 1
    prep = json.loads((args.prepared / "preparation.json").read_text())
    whom = "Acting player" if args.actor_only else "Both players"
    prep["selection_rule"] = (
        f"{whom} have >= {args.min_games} train-split games, >= {args.min_opponents} "
        f"distinct opponents, and shuffle-mean Elo >= {args.min_elo}; both wins and losses kept"
    )
    prep["stats"].update({key: value for key, value in stats.items() if key.startswith("train")})
    prep["stats"]["train_games"] = len(selected_games)
    (args.output / "preparation.json").write_text(json.dumps(prep, indent=2) + "\n")
    audit = {"eligible_source_games": len(included), "selected_games": len(selected_games),
             "selected_positions": stats["train"], "high_players": len(high),
             "selection_rule": prep["selection_rule"]}
    (args.output / "selection.json").write_text(json.dumps(audit, indent=2) + "\n")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
