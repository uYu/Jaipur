"""Describe public action counts per completed round by train-split Elo."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import random
from statistics import mean, median

import pyarrow.compute as pc
import pyarrow.parquet as pq

ACTION_CATEGORIES = ("take_goods", "take_camels", "sell_actions", "trade")
FIELDS = ("total", *ACTION_CATEGORIES, "goods_sold", "camels_final", "camel_bonus", "score", "score_margin", "points_per_action")


def percentile(values, fraction):
    values = sorted(values)
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def band(elo):
    if elo >= 1600:
        return "1600+"
    if elo >= 1550:
        return "1550-1599"
    if elo >= 1500:
        return "1500-1549"
    return "<1500"


def action_features(turn):
    kind = turn["action_type"]
    delta = turn["action_goods"]
    if kind == "take":
        return {"take_camels" if delta[6] > 0 else "take_goods": 1}
    if kind == "sell":
        sold = -sum(min(0, count) for count in delta[:6])
        return {"sell_actions": 1, "goods_sold": sold}
    if kind == "trade":
        return {"trade": 1}
    raise ValueError(f"Unknown action type {kind}")


def group_stats(rows, players):
    if not rows:
        return None
    totals = Counter()
    for row in rows:
        totals.update({field: row[field] for field in FIELDS})
    player_means = defaultdict(list)
    for row in rows:
        player_means[row["player_id"]].append(row)
    balanced = {
        field: mean(mean(item[field] for item in items) for items in player_means.values())
        for field in FIELDS
    }
    return {
        "players": len(players),
        "player_rounds": len(rows),
        "rounds_per_player_median": median(len(items) for items in player_means.values()),
        "total_actions": totals["total"],
        "per_player_round_mean": {field: totals[field] / len(rows) for field in FIELDS},
        "per_player_round_median": {field: median(row[field] for row in rows) for field in FIELDS},
        "per_player_round_p25": {field: percentile([row[field] for row in rows], 0.25) for field in FIELDS},
        "per_player_round_p75": {field: percentile([row[field] for row in rows], 0.75) for field in FIELDS},
        "player_balanced_mean": balanced,
        "action_share": {field: totals[field] / totals["total"] for field in ACTION_CATEGORIES},
        "goods_per_sale": totals["goods_sold"] / totals["sell_actions"] if totals["sell_actions"] else None,
    }


def bootstrap_difference(a, b, field, samples=4000):
    """Player-cluster bootstrap of high-minus-low mean actions per round."""
    rng = random.Random(240929 + FIELDS.index(field))
    a_values = list(a.values())
    b_values = list(b.values())
    differences = []
    for _ in range(samples):
        high = mean(a_values[rng.randrange(len(a_values))] for _ in a_values)
        low = mean(b_values[rng.randrange(len(b_values))] for _ in b_values)
        differences.append(high - low)
    return [percentile(differences, 0.025), percentile(differences, 0.975)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=Path, default=Path("data/hf-jaipur/data/games.parquet"))
    parser.add_argument("--ratings", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--min-games", type=int, default=10)
    parser.add_argument("--min-opponents", type=int, default=5)
    parser.add_argument("--split", choices=("train", "validation"), default="train")
    args = parser.parse_args()
    with args.ratings.open(newline="") as stream:
        ratings = {
            item["player_id"]: float(item["elo_shuffle_mean"])
            for item in csv.DictReader(stream)
            if int(item["train_games"]) >= args.min_games
            and int(item["distinct_opponents"]) >= args.min_opponents
        }
    rows = []
    audit = Counter()
    parquet = pq.ParquetFile(args.games)
    for batch in parquet.iter_batches(
        batch_size=32,
        columns=["game_id", "variant", "player_0", "player_1", "winner", "round_scores", "turns"],
    ):
        batch = batch.filter(pc.equal(batch.column("variant"), "original"))
        for game in batch.to_pylist():
            if game["winner"] not in (0, 1):
                continue
            bucket = int.from_bytes(hashlib.sha256(game["game_id"].encode()).digest()[:8], "big") % 100
            if (bucket < 10) != (args.split == "validation"):
                continue
            audit[f"{args.split}_games"] += 1
            counts = defaultdict(Counter)
            last_turn = {}
            for turn in game["turns"]:
                counts[(turn["round"], turn["actor"])].update(action_features(turn))
                last_turn[(turn["round"], turn["actor"])] = turn
            for round_index, scores in enumerate(game["round_scores"]):
                if scores == [0, 0]:
                    audit["zero_score_rounds_excluded"] += 1
                    continue
                if (round_index, 0) not in counts and (round_index, 1) not in counts:
                    audit["no_turn_rounds_excluded"] += 1
                    continue
                if any((round_index, seat) not in last_turn for seat in (0, 1)):
                    audit["missing_seat_turn_rounds_excluded"] += 1
                    continue
                audit["completed_rounds"] += 1
                camels = [
                    last_turn[(round_index, seat)]["actor_hand"][6]
                    + last_turn[(round_index, seat)]["action_goods"][6]
                    for seat in (0, 1)
                ]
                for seat in (0, 1):
                    player = game[f"player_{seat}"]
                    if player not in ratings:
                        continue
                    action_counts = counts[(round_index, seat)]
                    row = {
                        "game_id": game["game_id"], "round": round_index,
                        "seat": seat, "player_id": player, "elo": ratings[player],
                        "band": band(ratings[player]),
                        "score": scores[seat],
                        "score_margin": scores[seat] - scores[1 - seat],
                        "camels_final": camels[seat],
                        "camel_bonus": 5 if camels[seat] > camels[1 - seat] else 0,
                        **{field: action_counts[field] for field in (*ACTION_CATEGORIES, "goods_sold")},
                    }
                    row["total"] = sum(row[field] for field in ACTION_CATEGORIES)
                    row["points_per_action"] = row["score"] / row["total"] if row["total"] else 0
                    rows.append(row)
    exclusive = {}
    for label in ("1600+", "1550-1599", "1500-1549", "<1500"):
        selected = [row for row in rows if row["band"] == label]
        exclusive[label] = group_stats(selected, {row["player_id"] for row in selected})
    cumulative = {}
    for label, threshold in (("1600+", 1600), ("1550+", 1550), ("1500+", 1500), ("<1500", None)):
        selected = [row for row in rows if row["elo"] >= threshold] if threshold is not None else [
            row for row in rows if row["elo"] < 1500
        ]
        cumulative[label] = group_stats(selected, {row["player_id"] for row in selected})
    player_means = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for row in rows:
        for field in FIELDS:
            player_means[row["band"]][row["player_id"]][field].append(row[field])
    comparisons = {}
    for field in FIELDS:
        a = {p: mean(v[field]) for p, v in player_means["1600+"].items()}
        b = {p: mean(v[field]) for p, v in player_means["<1500"].items()}
        comparisons[field] = {
            "high_minus_low_player_balanced": mean(a.values()) - mean(b.values()),
            "player_cluster_bootstrap_95ci": bootstrap_difference(a, b, field),
        }
    result = {
        "scope": f"original variant, known winner, SHA-256 {args.split} split only, nonzero-score recorded rounds",
        "unit": "one player's actions in one scored round record",
        "elo": "32-order shuffle mean from train-split games, initial 1500, K=24",
        "eligibility": {"min_training_games": args.min_games, "min_distinct_opponents": args.min_opponents},
        "audit": dict(audit),
        "exclusive": exclusive,
        "cumulative": cumulative,
        "high_vs_low": comparisons,
        "limitation": "Observational; player, opponent, game length and round context can confound action counts.",
    }
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
    with (args.output / "player_rounds.csv").open("w", newline="") as stream:
        writer = csv.DictWriter(
            stream, fieldnames=["game_id", "round", "seat", "player_id", "elo", "band", *FIELDS]
        )
        writer.writeheader()
        writer.writerows(rows)
    with (args.output / "count_distributions.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["elo_band", "metric", "value", "player_rounds", "fraction"])
        for label in ("1600+", "1550-1599", "1500-1549", "<1500"):
            selected = [row for row in rows if row["band"] == label]
            for field in ("total", *ACTION_CATEGORIES, "goods_sold", "camels_final", "camel_bonus", "score"):
                counts = Counter(row[field] for row in selected)
                for value, count in sorted(counts.items()):
                    writer.writerow([label, field, value, count, count / len(selected)])
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
