"""Exploratory Elo ratings from original-variant Jaipur matches.

The source has no match timestamp. Ratings are calculated on training games
only, with several shuffled orders to expose order sensitivity. Validation
games are used only to assess predictive usefulness.
"""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
import math
from pathlib import Path
import random
from statistics import mean, pstdev

import pyarrow.compute as pc
import pyarrow.parquet as pq


def games_from_parquet(path):
    parquet = pq.ParquetFile(path)
    for batch in parquet.iter_batches(
        batch_size=512,
        columns=["game_id", "variant", "player_0", "player_1", "winner"],
    ):
        batch = batch.filter(pc.equal(batch.column("variant"), "original"))
        for game in batch.to_pylist():
            if game["winner"] in (0, 1):
                yield game


def validation(game_id):
    bucket = int.from_bytes(hashlib.sha256(game_id.encode()).digest()[:8], "big") % 100
    return bucket < 10


def elo(games, k):
    rating = defaultdict(lambda: 1500.0)
    for game in games:
        p0, p1 = game["player_0"], game["player_1"]
        if p0 == p1:
            continue
        expected = 1 / (1 + 10 ** ((rating[p1] - rating[p0]) / 400))
        change = k * ((game["winner"] == 0) - expected)
        rating[p0] += change
        rating[p1] -= change
    return dict(rating)


def rank_correlation(a, b, players):
    order_a = {p: i for i, p in enumerate(sorted(players, key=lambda p: a.get(p, 1500)))}
    order_b = {p: i for i, p in enumerate(sorted(players, key=lambda p: b.get(p, 1500)))}
    n = len(players)
    if n < 2:
        return None
    d2 = sum((order_a[p] - order_b[p]) ** 2 for p in players)
    return 1 - 6 * d2 / (n * (n * n - 1))


def assess(games, ratings, trained, min_games=0):
    n = correct = logloss = 0
    for game in games:
        a, b = game["player_0"], game["player_1"]
        if trained[a] < min_games or trained[b] < min_games or a == b:
            continue
        probability = 1 / (1 + 10 ** ((ratings.get(b, 1500) - ratings.get(a, 1500)) / 400))
        target = int(game["winner"] == 0)
        correct += (probability >= 0.5) == target
        logloss += -math.log(probability if target else 1 - probability)
        n += 1
    return {"games": n, "accuracy": correct / n if n else None,
            "log_loss": logloss / n if n else None}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("data/hf-jaipur/data/games.parquet"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--k", type=float, default=24)
    parser.add_argument("--shuffles", type=int, default=32)
    args = parser.parse_args()
    if args.k <= 0 or args.shuffles < 1:
        parser.error("K and shuffles must be positive")
    train, holdout = [], []
    for game in games_from_parquet(args.input):
        (holdout if validation(game["game_id"]) else train).append(game)
    played, won, opponents = Counter(), Counter(), defaultdict(set)
    for game in train:
        a, b = game["player_0"], game["player_1"]
        if a == b:
            continue
        played[a] += 1
        played[b] += 1
        won[game[f"player_{game['winner']}"]] += 1
        opponents[a].add(b)
        opponents[b].add(a)
    file_order = elo(train, args.k)
    reverse_order = elo(reversed(train), args.k)
    rng = random.Random(240929)
    ensemble = defaultdict(list)
    for _ in range(args.shuffles):
        shuffled = train.copy()
        rng.shuffle(shuffled)
        ratings = elo(shuffled, args.k)
        for player in played:
            ensemble[player].append(ratings.get(player, 1500))
    average = {player: mean(values) for player, values in ensemble.items()}
    experienced = {player for player, count in played.items()
                   if count >= 10 and len(opponents[player]) >= 5}
    top_file = set(sorted(experienced, key=lambda p: file_order[p], reverse=True)[:20])
    top_reverse = set(sorted(experienced, key=lambda p: reverse_order[p], reverse=True)[:20])
    summary = {
        "source": "noidvan/jaipur original-variant games with known winner",
        "train_split": "same whole-game SHA-256 10% validation bucket as policy training",
        "has_match_timestamps": False,
        "initial_elo": 1500,
        "k": args.k,
        "shuffles": args.shuffles,
        "train_games": len(train),
        "validation_games": len(holdout),
        "train_players": len(played),
        "median_training_games_per_player": sorted(played.values())[len(played) // 2],
        "experienced_players_min_10_games_5_opponents": len(experienced),
        "file_vs_reverse_spearman_experienced": rank_correlation(file_order, reverse_order, experienced),
        "file_vs_reverse_top20_overlap": len(top_file & top_reverse),
        "validation_all": assess(holdout, average, played),
        "validation_both_seen": assess(holdout, average, played, min_games=1),
        "validation_both_10plus": assess(holdout, average, played, min_games=10),
        "validation_baseline_log_loss": math.log(2),
        "validation_majority_class_accuracy": max(
            sum(game["winner"] == seat for game in holdout) for seat in (0, 1)
        ) / len(holdout),
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    with (args.output / "ratings.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["player_id", "train_games", "wins", "distinct_opponents",
                         "elo_file_order", "elo_reverse_order", "elo_shuffle_mean",
                         "elo_shuffle_order_sd"])
        for player in sorted(played, key=lambda p: average[p], reverse=True):
            writer.writerow([player, played[player], won[player], len(opponents[player]),
                             round(file_order[player], 1), round(reverse_order[player], 1),
                             round(average[player], 1), round(pstdev(ensemble[player]), 1)])
    print(json.dumps(summary, indent=2))
    print("top_experienced", json.dumps([
        {"player": p, "games": played[p], "wins": won[p], "elo": round(average[p], 1),
         "order_sd": round(pstdev(ensemble[p]), 1)}
        for p in sorted(experienced, key=lambda p: average[p], reverse=True)[:10]
    ]))


if __name__ == "__main__":
    main()
