"""Evaluate Jaipur DMC checkpoints on held-out moves by inferred 1600+ players.

Ratings are derived from training-split matches, never from the games evaluated
here. All model inputs are reconstructed from the acting player's information;
the source's opponent hand and score are used only for public hand-size checks.
"""
import argparse
from collections import Counter
import csv
import hashlib
import importlib.util
from itertools import product
import json
import math
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq
import torch

from douzero_model import JaipurDouZero


SPEC = importlib.util.spec_from_file_location("human_replays", Path(__file__).with_name("prepare-human-replays-v2.py"))
HUMAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HUMAN)
TOTALS = (6, 6, 6, 8, 8, 10, 11)


def chosen_action(turn):
    kind, delta = turn["action_type"], turn["action_goods"]
    if kind == "take" and delta[6] > 0:
        return ("camels",)
    return (kind, *delta)


def action_features(action):
    kind = action[0]
    x = [0.0] * 24
    x[{"take": 0, "camels": 1, "sell": 2, "trade": 3}[kind]] = 1.0
    if kind == "trade":
        delta = action[1:]
        for i in range(6):
            x[4 + i] = max(0, delta[i]) / 7
            x[10 + i] = max(0, -delta[i]) / 7
        x[23] = max(0, -delta[6]) / 7
    elif kind in ("take", "sell"):
        delta = action[1:]
        good = next(i for i, n in enumerate(delta[:6]) if n)
        x[17 + good] = 1.0
        if kind == "sell":
            x[16] = -delta[good] / 7
    return x


def legal_actions(turn, full_sale_only):
    result = set()
    for action in HUMAN.legal_actions(turn):
        kind, *delta = action
        if kind == "take" and delta[6] > 0:
            result.add(("camels",))
        elif (not full_sale_only or kind != "sell" or
              all(delta[i] == 0 or -delta[i] == turn["actor_hand"][i] for i in range(6))):
            # Only the complete hand count of the sold good is legal.
            result.add(action)
    return sorted(result)


def initial_worlds(turn, observer, discard=None):
    own = (turn["actor_hand"] if turn["actor"] == observer else turn["opponent_hand"])
    discard = discard or [0] * 7
    pool = [TOTALS[i] - own[i] - turn["market"][i] - discard[i] for i in range(7)]
    visible = sum((turn["opponent_hand"] if turn["actor"] == observer else turn["actor_hand"])[:6])
    # Some source replays begin after an unrecorded opening move. Infer the
    # current opponent total from public deck/market/card conservation.
    opponent_total = sum(TOTALS) - sum(own) - sum(turn["market"]) - sum(discard) - turn["deck_size"]
    worlds = []
    for hand in product(*(range(min(opponent_total, n) + 1) for n in pool)):
        if sum(hand) == opponent_total and sum(hand[:6]) == visible:
            worlds.append((hand, math.prod(math.comb(pool[i], hand[i]) for i in range(7))))
    mass = sum(weight for _, weight in worlds)
    if not mass:
        raise ValueError("Empty initial public-hand posterior")
    return {hand: weight / mass for hand, weight in worlds}


def update_worlds(worlds, turn, following, observer, discard):
    if following is None or following["round"] != turn["round"]:
        return worlds
    kind, delta = turn["action_type"], turn["action_goods"]
    old_market = turn["market"]
    expected = old_market.copy()
    if kind in ("take", "trade"):
        for good in range(7):
            expected[good] -= max(0, delta[good])
            if kind == "trade":
                expected[good] += max(0, -delta[good])
    revealed = [following["market"][i] - expected[i] for i in range(7)]
    if any(n < 0 for n in revealed):
        raise ValueError("Bad public market transition")
    own = turn["actor_hand"] if turn["actor"] == observer else turn["opponent_hand"]
    result = {}
    for old_hand, old_weight in worlds.items():
        hand = list(old_hand)
        weight = old_weight
        if turn["actor"] != observer:
            if kind == "take" and delta[6] == 0:
                good = next(i for i, n in enumerate(delta[:6]) if n)
                denominator = sum(old_market[i] * math.exp(.75 * old_hand[i]) for i in range(6))
                weight *= math.exp(.75 * old_hand[good]) / denominator
            if kind == "sell":
                for i in range(6):
                    hand[i] += delta[i]
            elif kind == "trade":
                for i in range(7):
                    hand[i] += delta[i]
            elif kind == "take":
                for i in range(7):
                    hand[i] += delta[i]
            if any(n < 0 for n in hand):
                continue
        # Mirror hand-belief.ts: pre-action public pool with the updated world.
        deck = [TOTALS[i] - own[i] - old_market[i] - discard[i] - hand[i] for i in range(7)]
        remaining = sum(deck)
        for i, count in enumerate(revealed):
            for _ in range(count):
                if remaining <= 0 or deck[i] <= 0:
                    weight = 0
                    break
                weight *= deck[i] / remaining
                deck[i] -= 1
                remaining -= 1
        if weight:
            key = tuple(hand)
            result[key] = result.get(key, 0) + weight
    visible = sum((following["opponent_hand"] if following["actor"] == observer else following["actor_hand"])[:6])
    result = {hand: weight for hand, weight in result.items() if sum(hand[:6]) == visible}
    mass = sum(result.values())
    if not mass:
        raise ValueError("Empty updated public-hand posterior")
    return {hand: weight / mass for hand, weight in result.items()}


def state_features(turn, history, worlds, turn_number):
    actor = turn["actor"]
    hand = turn["actor_hand"]
    market = turn["market"]
    stacks = turn["coin_stacks"]
    x = [n / 7 for n in hand[:6]]
    x += [history.public_goods[actor] / 100, history.public_goods[1 - actor] / 100,
          sum(turn["actor_bonuses"]) / 50, sum(hand[:6]) / 7,
          sum(turn["opponent_hand"][:6]) / 7, hand[6] / 11,
          turn["deck_size"] / 40, turn_number / 100]
    x += [n / 5 for n in market[:6]] + [market[6] / 5]
    x += [len(stack) / 9 for stack in stacks]
    x += [(stack[i] if i < len(stack) else 0) / 7 for stack in stacks for i in range(9)]
    x += [len(stack) / 7 for stack in turn["bonus_stacks"]]
    x += [n / 10 for n in history.discard]
    marginals = [0.0] * 48
    for world, weight in worlds.items():
        for good in range(6):
            marginals[good * 8 + world[good]] += weight
    x += marginals
    empty = sum(not stack for stack in stacks)
    close = (sum(weight for world, weight in worlds.items() if any(
        len(stacks[i]) > 0 and world[i] >= max(len(stacks[i]), 2 if i < 3 else 1)
        for i in range(6))) if empty >= 2 else 0)
    x += [close, len(turn["actor_bonuses"]) / 18,
          history.public_goods_counts[actor] / 38,
          history.public_goods_counts[1 - actor] / 38]
    unknown_goods = sum(TOTALS[i] - hand[i] - market[i] - history.discard[i] for i in range(6))
    unknown_camels = 11 - hand[6] - market[6]
    opponent_camels = unknown_goods + unknown_camels - sum(turn["opponent_hand"][:6]) - turn["deck_size"]
    x += [history.seals[actor] / 2, history.seals[1 - actor] / 2,
          (turn["round"] + 1) / 3, opponent_camels / 11]
    if len(x) != 146 or not np.isfinite(x).all():
        raise ValueError("Bad DMC state")
    return x


def history_features(moves, actor):
    result = [[0.0] * 26 for _ in range(16 - len(moves[-16:]))]
    result += [[float(seat == actor), float(seat != actor), *features]
               for seat, features in moves[-16:]]
    return result


def selected_games(parquet, players):
    source = pq.ParquetFile(parquet)
    selected = set()
    for batch in source.iter_batches(batch_size=512, columns=[
        "game_id", "variant", "player_0", "player_1", "winner"]):
        for game in batch.to_pylist():
            bucket = int.from_bytes(hashlib.sha256(game["game_id"].encode()).digest()[:8], "big") % 100
            if (game["variant"] == "original" and game["winner"] in (0, 1)
                    and bucket < 10 and (game["player_0"] in players or game["player_1"] in players)):
                selected.add(game["game_id"])
    ids = pa.array(sorted(selected))
    for batch in source.iter_batches(batch_size=512, columns=[
        "game_id", "variant", "player_0", "player_1", "winner", "round_scores", "turns"]):
        for game in batch.filter(pc.is_in(batch.column("game_id"), value_set=ids)).to_pylist():
                yield game


def prepare(game, players, stats):
    history = HUMAN.PublicHistory()
    worlds = None
    moves = []
    round_turn = 0
    for index, turn in enumerate(game["turns"]):
        new_round = turn["round"] != history.round
        history.before(turn, game["round_scores"])
        if new_round:
            worlds = [initial_worlds(turn, seat) for seat in (0, 1)]
            moves = []
            round_turn = 0
        actor = turn["actor"]
        chosen = chosen_action(turn)
        legal = legal_actions(turn, True)
        # An impossible human move is counted as zero agreement, not silently dropped.
        record = None
        if game[f"player_{actor}"] in players:
            record = {"game_id": game["game_id"], "player_id": game[f"player_{actor}"],
                      "round": turn["round"], "turn": round_turn, "kind": chosen[0],
                      "chosen": chosen, "covered": chosen in legal,
                      "state": state_features(turn, history, worlds[actor], round_turn),
                      "history": history_features(moves, actor),
                      "actions": legal, "action_features": [action_features(a) for a in legal]}
        following = game["turns"][index + 1] if index + 1 < len(game["turns"]) else None
        for seat in (0, 1):
            try:
                worlds[seat] = update_worlds(worlds[seat], turn, following, seat, [*history.discard, 0])
            except ValueError as error:
                if str(error) != "Empty updated public-hand posterior" or following is None or following["round"] != turn["round"]:
                    raise ValueError(f"turn {index}, seat {seat}, {turn['action_type']} {turn['action_goods']}: {error}") from error
                next_discard = history.discard.copy()
                if turn["action_type"] == "sell":
                    next_discard = [next_discard[i] - min(0, turn["action_goods"][i]) for i in range(6)]
                worlds[seat] = initial_worlds(following, seat, [*next_discard, 0])
                stats["belief_resets"] += 1
        history.after(turn, following)
        moves.append((actor, action_features(chosen)))
        round_turn += 1
        if record:
            yield record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ratings", type=Path, default=Path("output/jaipur-human-elo-20260929/ratings.csv"))
    parser.add_argument("--parquet", type=Path, default=Path("data/hf-jaipur/data/games.parquet"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, action="append", default=[])
    parser.add_argument("--min-elo", type=float, default=1600)
    args = parser.parse_args()
    with args.ratings.open(newline="") as stream:
        players = {row["player_id"] for row in csv.DictReader(stream)
                   if float(row["elo_shuffle_mean"]) >= args.min_elo
                   and int(row["train_games"]) >= 10
                   and int(row["distinct_opponents"]) >= 5}
    if not players:
        parser.error("No eligible rated players")
    args.output.mkdir(parents=True, exist_ok=True)
    records = []
    rejected = []
    stats = Counter()
    for game in selected_games(args.parquet, players):
        try:
            game_stats = Counter()
            game_records = list(prepare(game, players, game_stats))
            records.extend(game_records)
            stats.update(game_stats)
        except ValueError as error:
            rejected.append({"game_id": game["game_id"], "error": str(error)})
    with (args.output / "validation.jsonl").open("w") as stream:
        for record in records:
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")
    summary = {"min_elo": args.min_elo, "players": len(players),
               "games": len({r["game_id"] for r in records}), "actions": len(records),
               "covered": sum(r["covered"] for r in records),
               "uncovered": Counter(r["kind"] for r in records if not r["covered"]),
               "belief_resets": stats["belief_resets"],
               "rejected_games": rejected}
    torch.set_num_threads(1)
    for checkpoint in args.checkpoint:
        saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
        if saved.get("architecture") != "jaipur-douzero-history-v1" or not saved.get("full_sale_only"):
            raise ValueError(f"Expected a full-sale flat checkpoint: {checkpoint}")
        model = JaipurDouZero()
        model.load_state_dict(saved["model"])
        model.eval()
        counts = Counter()
        by_kind = {}
        with torch.inference_mode():
            for record in records:
                actions = record["actions"]
                scores = model.score_actions(
                    torch.tensor([record["history"]], dtype=torch.float32),
                    torch.tensor(record["state"], dtype=torch.float32),
                    torch.tensor(record["action_features"], dtype=torch.float32)).numpy()
                predicted = actions[int(np.argmax(scores))]
                hit = int(predicted == record["chosen"])
                category_hit = int(predicted[0] == record["kind"])
                for bucket in (counts, by_kind.setdefault(record["kind"], Counter())):
                    bucket["n"] += 1
                    bucket["top1"] += hit
                    bucket["kind"] += category_hit
                    bucket["covered"] += int(record["covered"])
                    bucket["uniform_expected"] += (1 / len(actions) if record["covered"] else 0)
        summary[str(checkpoint)] = {"overall": dict(counts),
                                     "by_kind": {k: dict(v) for k, v in by_kind.items()}}
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2, default=dict) + "\n")
    print(json.dumps(summary, indent=2, default=dict))


if __name__ == "__main__":
    main()
