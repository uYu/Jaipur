"""Convert Yucata Jaipur replays into observable, legal-action ranking examples.

The source is noidvan/jaipur (CC-BY-NC-4.0). Only the original, hidden-hand
variant is selected by default. Opponent hand contents, opponent score, and
hidden bonus values never enter model features. Public action and market history
is replayed to retain cards an attentive player could remember.
"""

import argparse
from collections import Counter
import hashlib
from itertools import product
import json
from pathlib import Path
import random

import pyarrow.parquet as pq


def legal_actions(turn):
    hand = turn["actor_hand"]
    market = turn["market"]
    hand_size = sum(hand[:6])
    actions = set()
    if hand_size < 7:
        for good in range(6):
            if market[good]:
                delta = [0] * 7
                delta[good] = 1
                actions.add(("take", *delta))
    if market[6]:
        actions.add(("take", 0, 0, 0, 0, 0, 0, market[6]))
    for good in range(6):
        minimum = 2 if good < 3 else 1
        for count in range(minimum, hand[good] + 1):
            delta = [0] * 7
            delta[good] = -count
            actions.add(("sell", *delta))
    # Enumerate card-count-equivalent exchanges, matching the local engine's
    # deduplication of equal cards at different market/hand indices.
    for taken in product(*(range(n + 1) for n in market[:6])):
        count = sum(taken)
        if count < 2:
            continue
        for given in product(*(range(n + 1) if not taken[i] else (0,) for i, n in enumerate(hand[:6]))):
            given_count = sum(given)
            camels = count - given_count
            if camels < 0 or camels > hand[6] or hand_size - given_count + count > 7:
                continue
            delta = tuple(taken[i] - given[i] for i in range(6)) + (-camels,)
            actions.add(("trade", *delta))
    return actions


class PublicHistory:
    def __init__(self):
        self.round = None
        self.known_hands = [[0] * 7 for _ in range(2)]
        self.revealed = [0] * 7
        self.discard = [0] * 6

    def before(self, turn):
        if turn["round"] != self.round:
            self.round = turn["round"]
            self.known_hands = [[0] * 7 for _ in range(2)]
            self.revealed = turn["market"].copy()
            self.discard = [0] * 6
        # The source's private hands are used only for this audit, never as
        # identity features. Publicly known cards must be a subset of reality.
        for seat in (0, 1):
            actual = turn["actor_hand"] if seat == turn["actor"] else turn["opponent_hand"]
            if any(known > held for known, held in zip(self.known_hands[seat], actual)):
                raise ValueError("Public hand reconstruction exceeds true hand")

    def after(self, turn, following):
        actor = turn["actor"]
        delta = turn["action_goods"]
        for good in range(7):
            if delta[good] < 0:
                self.known_hands[actor][good] = max(0, self.known_hands[actor][good] + delta[good])
            else:
                self.known_hands[actor][good] += delta[good]
        if turn["action_type"] == "sell":
            for good in range(6):
                self.discard[good] += -min(0, delta[good])
        if following is None or following["round"] != turn["round"]:
            return
        expected = turn["market"].copy()
        if turn["action_type"] in ("take", "trade"):
            for good in range(7):
                expected[good] -= max(0, delta[good])
                if turn["action_type"] == "trade":
                    expected[good] += -min(0, delta[good])
        draws = [now - old for now, old in zip(following["market"], expected)]
        if any(count < 0 for count in draws) or (turn["action_type"] != "take" and any(draws)):
            raise ValueError("Public market transition cannot be reconstructed")
        self.revealed = [old + count for old, count in zip(self.revealed, draws)]


def state_features(turn, history):
    hand = turn["actor_hand"]
    market = turn["market"]
    stacks = turn["coin_stacks"]
    return (
        [n / 7 for n in hand]
        + [n / 5 for n in market]
        + [len(s) / 9 for s in stacks]
        + [(s[0] if s else 0) / 7 for s in stacks]
        + [len(s) / 10 for s in turn["bonus_stacks"]]
        + [turn["deck_size"] / 40, turn["actor_score"] / 100,
           sum(turn["opponent_hand"][:6]) / 7, turn["round"] / 5,
           turn["actor"]]
        + [n / 7 for n in history.known_hands[1 - turn["actor"]]]
        + [n / 12 for n in history.revealed]
        + [n / 12 for n in history.discard]
    )


def action_features(action):
    kind, *delta = action
    return ([int(kind == name) for name in ("take", "sell", "trade")]
            + [n / 7 for n in delta]
            + [sum(max(n, 0) for n in delta) / 7,
               sum(max(-n, 0) for n in delta) / 7])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("data/hf-jaipur/data/games.parquet"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--variant", choices=("original", "open_info"), default="original")
    parser.add_argument("--max-games", type=int, default=0, help="0 means all selected games")
    parser.add_argument("--stride", type=int, default=1)
    parser.add_argument("--train-negatives", type=int, default=15)
    parser.add_argument("--validation-games", type=int, default=0,
                        help="Use the first N games for validation; 0 uses a hash split")
    parser.add_argument("--validation-percent", type=int, default=10)
    args = parser.parse_args()
    if args.max_games < 0 or args.validation_games < 0 or args.stride < 1 or args.train_negatives < 1:
        parser.error("Invalid numeric argument")
    if args.validation_games and args.max_games and args.validation_games >= args.max_games:
        parser.error("--validation-games must be smaller than --max-games")
    if not 1 <= args.validation_percent <= 50:
        parser.error("--validation-percent must be between 1 and 50")
    rng = random.Random(240929)
    args.output.mkdir(parents=True, exist_ok=True)
    paths = {name: args.output / f"{name}.jsonl" for name in ("train", "validation")}
    stats = Counter()
    rejected = []
    games = 0
    with paths["train"].open("w") as train_file, paths["validation"].open("w") as validation_file:
        parquet = pq.ParquetFile(args.input)
        for batch in parquet.iter_batches(batch_size=16, columns=["game_id", "variant", "turns"]):
            for game in batch.to_pylist():
                if game["variant"] != args.variant:
                    continue
                games += 1
                if args.validation_games:
                    validation = games <= args.validation_games
                else:
                    bucket = int.from_bytes(hashlib.sha256(game["game_id"].encode()).digest()[:8], "big") % 100
                    validation = bucket < args.validation_percent
                split = "validation" if validation else "train"
                output = validation_file if split == "validation" else train_file
                history = PublicHistory()
                turns = game["turns"]
                records = []
                game_stats = Counter()
                try:
                    for index, turn in enumerate(turns):
                        history.before(turn)
                        if index % args.stride == 0:
                            chosen = (turn["action_type"], *turn["action_goods"])
                            legal = legal_actions(turn)
                            if chosen not in legal:
                                raise ValueError(f"Recorded {turn['action_type']} is not legal")
                            alternatives = sorted(legal - {chosen})
                            if split == "train" and len(alternatives) > args.train_negatives:
                                alternatives = rng.sample(alternatives, args.train_negatives)
                            candidates = [chosen] + alternatives
                            rng.shuffle(candidates)
                            record = {
                                "game_id": game["game_id"],
                                "state": state_features(turn, history),
                                "actions": [action_features(action) for action in candidates],
                                "chosen": candidates.index(chosen),
                            }
                            records.append(json.dumps(record, separators=(",", ":")) + "\n")
                            game_stats[split] += 1
                            game_stats[f"{split}_{turn['action_type']}"] += 1
                            game_stats[f"{split}_candidates"] += len(candidates)
                        history.after(turn, turns[index + 1] if index + 1 < len(turns) else None)
                except ValueError as error:
                    stats["rejected_games"] += 1
                    if len(rejected) < 10:
                        rejected.append({"game_id": game["game_id"], "turn": index, "reason": str(error)})
                    continue
                output.writelines(records)
                stats.update(game_stats)
                stats[f"{split}_games"] += 1
                if args.max_games and games >= args.max_games:
                    break
            if args.max_games and games >= args.max_games:
                break
    metadata = {"source": "noidvan/jaipur", "license": "CC-BY-NC-4.0",
                "input_sha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
                "variant": args.variant, "selected_games": games, "stride": args.stride,
                "validation_games_requested": args.validation_games,
                "validation_percent": args.validation_percent if not args.validation_games else None,
                "split": "whole-game SHA-256 bucket" if not args.validation_games else "first N games",
                "stats": dict(stats),
                "rejected_examples": rejected,
                "state_features": 54, "action_features": 12,
                "privacy": "Only publicly inferred opponent cards; no private card identities, opponent score, or hidden bonus values in features"}
    (args.output / "preparation.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
