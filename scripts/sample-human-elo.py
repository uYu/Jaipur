"""Sample training decisions using uncertainty-shrunk train-split Elo."""
import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path
import random

import pyarrow.compute as pc
import pyarrow.parquet as pq


def train_bucket(game_id):
    return int.from_bytes(hashlib.sha256(game_id.encode()).digest()[:8], "big") % 100 >= 10


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--ratings", type=Path, required=True)
    parser.add_argument("--parquet", type=Path, default=Path("data/hf-jaipur/data/games.parquet"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--exclude-below-elo", type=float)
    parser.add_argument("--min-weak-games", type=int, default=10)
    parser.add_argument("--min-weak-opponents", type=int, default=5)
    parser.add_argument("--base-probability", type=float, default=0.5)
    parser.add_argument("--min-probability", type=float, default=0.2)
    parser.add_argument("--max-probability", type=float, default=0.8)
    args = parser.parse_args()
    if not 0 <= args.min_probability <= args.base_probability <= args.max_probability <= 1:
        parser.error("Sampling probabilities must increase from min to base to max")
    ratings = {}
    with args.ratings.open(newline="") as stream:
        for row in csv.DictReader(stream):
            ratings[row["player_id"]] = (
                int(row["train_games"]), float(row["elo_shuffle_mean"]),
                int(row["distinct_opponents"]))
    weak = {
        player for player, (count, elo, opponents) in ratings.items()
        if args.exclude_below_elo is not None
        and count >= args.min_weak_games
        and opponents >= args.min_weak_opponents
        and elo <= args.exclude_below_elo
    }
    games = {}
    for batch in pq.ParquetFile(args.parquet).iter_batches(
        batch_size=512, columns=["game_id", "variant", "player_0", "player_1", "winner"]
    ):
        batch = batch.filter(pc.equal(batch.column("variant"), "original"))
        for game in batch.to_pylist():
            if game["winner"] in (0, 1) and train_bucket(game["game_id"]):
                games[game["game_id"]] = game
    args.output.mkdir(parents=True, exist_ok=True)
    validation = args.output / "validation.jsonl"
    if not validation.exists():
        validation.symlink_to(args.prepared.resolve() / "validation.jsonl")
    rng = random.Random(240929)
    stats = Counter()
    selected_games = set()
    excluded_games = set()
    probability_sum = 0.0
    with (args.prepared / "train.jsonl").open() as incoming, (args.output / "train.jsonl").open("w") as outgoing:
        for line in incoming:
            row = json.loads(line)
            game = games[row["game_id"]]
            stats["source_positions"] += 1
            if game["player_0"] in weak or game["player_1"] in weak:
                excluded_games.add(row["game_id"])
                stats["excluded_positions"] += 1
                continue
            actor = game["winner"] if row["outcome"] else 1 - game["winner"]
            if round(row["state"][33]) != actor:
                raise ValueError("Actor and winner label disagree")
            player = game[f"player_{actor}"]
            count, elo, _ = ratings[player]
            reliability = count / (count + 20)
            probability = max(args.min_probability, min(
                args.max_probability,
                args.base_probability + (elo - 1500) / 400 * reliability))
            probability_sum += probability
            stats["eligible_positions"] += 1
            if rng.random() >= probability:
                continue
            outgoing.write(line)
            selected_games.add(row["game_id"])
            stats["selected_positions"] += 1
            stats["selected_winner_positions"] += row["outcome"]
            kind = ["take", "sell", "trade"][row["actions"][row["chosen"]][:3].index(1)]
            stats[f"selected_{kind}"] += 1
            stats["selected_candidates"] += len(row["actions"])
    prep = json.loads((args.prepared / "preparation.json").read_text())
    prep["selection_rule"] = (
        f"Exclude matches involving players with >= {args.min_weak_games} training games, "
        f">= {args.min_weak_opponents} opponents and mean Elo <= {args.exclude_below_elo}; "
        f"then p=clip({args.base_probability}+(Elo-1500)/400 * games/(games+20),"
        f"{args.min_probability},{args.max_probability}); ratings use train-split matches only"
    )
    prep["elo_ratings_file"] = str(args.ratings)
    prep["stats"].update({
        "train": stats["selected_positions"], "train_games": len(selected_games),
        "train_take": stats["selected_take"], "train_sell": stats["selected_sell"],
        "train_trade": stats["selected_trade"],
        "train_candidates": stats["selected_candidates"],
    })
    (args.output / "preparation.json").write_text(json.dumps(prep, indent=2) + "\n")
    audit = {
        "source_positions": stats["source_positions"],
        "weak_players": len(weak),
        "excluded_games": len(excluded_games),
        "excluded_positions": stats["excluded_positions"],
        "eligible_positions": stats["eligible_positions"],
        "selected_positions": stats["selected_positions"],
        "selected_games": len(selected_games),
        "selected_winner_positions": stats["selected_winner_positions"],
        "mean_sampling_probability": probability_sum / stats["eligible_positions"],
        "formula": prep["selection_rule"],
    }
    (args.output / "sampling.json").write_text(json.dumps(audit, indent=2) + "\n")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
