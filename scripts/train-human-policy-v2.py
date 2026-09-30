"""Equal-weight imitation training with a public-state outcome head."""
import argparse
from collections import Counter
import json
import math
from pathlib import Path
import random

import numpy as np
import torch
from torch import nn


def convert(row):
    state = np.asarray(row["state"], dtype=np.float32)
    actions = np.asarray(row["actions"], dtype=np.float32)
    chosen = row["chosen"]
    outcome = row["outcome"]
    if state.shape != (154,) or actions.ndim != 2 or actions.shape[1] != 12:
        raise ValueError("Unexpected feature dimensions")
    if not 0 <= chosen < len(actions) or outcome not in (0, 1):
        raise ValueError("Invalid replay example")
    if not np.isfinite(state).all() or not np.isfinite(actions).all():
        raise ValueError("Non-finite replay feature")
    selected = actions[chosen]
    kind = ("take", "sell", "trade")[int(selected[:3].argmax())]
    category = "sell_one" if kind == "sell" and round(-selected[3:9].sum() * 7) == 1 else kind
    return state, actions, chosen, outcome, category


def scan(path):
    count, random_top1, games, categories = 0, 0.0, set(), Counter()
    with path.open() as stream:
        for line in stream:
            row = json.loads(line)
            count += 1
            games.add(row["game_id"])
            random_top1 += 1 / len(row["actions"])
            categories[convert(row)[4]] += 1
    if not count:
        raise ValueError(f"No examples in {path}")
    return count, games, random_top1 / count, dict(categories)


def rows(path, shuffle):
    with path.open() as stream:
        if not shuffle:
            for line in stream:
                yield convert(json.loads(line))
        else:
            while True:
                lines = [stream.readline() for _ in range(4096)]
                lines = [line for line in lines if line]
                if not lines:
                    break
                random.shuffle(lines)
                for line in lines:
                    yield convert(json.loads(line))


def batches(source, size):
    selected = []
    for row in source:
        selected.append(row)
        if len(selected) == size:
            yield pack(selected)
            selected = []
    if selected:
        yield pack(selected)


def pack(selected):
    width = max(len(row[1]) for row in selected)
    states = np.stack([row[0] for row in selected])
    actions = np.zeros((len(selected), width, 12), dtype=np.float32)
    mask = np.zeros((len(selected), width), dtype=bool)
    for i, row in enumerate(selected):
        actions[i, :len(row[1])] = row[1]
        mask[i, :len(row[1])] = True
    target = np.asarray([row[2] for row in selected], dtype=np.int64)
    outcome = np.asarray([row[3] for row in selected], dtype=np.float32)
    return (torch.from_numpy(states), torch.from_numpy(actions), torch.from_numpy(mask),
            torch.from_numpy(target), torch.from_numpy(outcome), [row[4] for row in selected])


class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(nn.Linear(154, 128), nn.ReLU(), nn.Linear(128, 64), nn.ReLU())
        self.policy = nn.Sequential(nn.Linear(76, 64), nn.ReLU(), nn.Linear(64, 1))
        self.value = nn.Linear(64, 1)

    def forward(self, states, actions):
        context = self.encoder(states)
        candidates = torch.cat((context[:, None, :].expand(-1, actions.size(1), -1), actions), -1)
        return self.policy(candidates).squeeze(-1), self.value(context).squeeze(-1)


def evaluate(model, path, size):
    model.eval()
    nll = bce = correct = total = 0.0
    category_total, category_correct = Counter(), Counter()
    with torch.no_grad():
        for states, actions, mask, target, outcome, categories in batches(rows(path, False), size):
            logits, value = model(states, actions)
            logits = logits.masked_fill(~mask, -1e9)
            predicted = logits.argmax(1)
            nll += nn.functional.cross_entropy(logits, target, reduction="sum").item()
            bce += nn.functional.binary_cross_entropy_with_logits(value, outcome, reduction="sum").item()
            correct += (predicted == target).sum().item()
            total += len(target)
            for i, category in enumerate(categories):
                category_total[category] += 1
                category_correct[category] += int(predicted[i] == target[i])
    return {"nll": nll / total, "top1": correct / total, "value_bce": bce / total,
            "category_top1": {k: category_correct[k] / count for k, count in category_total.items()}}


def export(model, epoch, directory):
    def linear(layer):
        return {"weight": layer.weight.detach().tolist(), "bias": layer.bias.detach().tolist()}
    data = {"format": "jaipur-human-policy-v2", "state_features": 154,
            "action_features": 12, "best_epoch": epoch,
            "encoder1": linear(model.encoder[0]), "encoder2": linear(model.encoder[2]),
            "policy1": linear(model.policy[0]), "policy2": linear(model.policy[2]),
            "value": linear(model.value)}
    (directory / "model.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--epochs", type=int, default=24)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--learning-rate", type=float, default=0.001)
    parser.add_argument("--value-coefficient", type=float, default=0.25)
    parser.add_argument("--patience", type=int, default=5)
    args = parser.parse_args()
    if min(args.epochs, args.batch_size, args.patience) < 1 or args.learning_rate <= 0 or args.value_coefficient < 0:
        parser.error("Invalid training argument")
    torch.manual_seed(240929)
    torch.set_num_threads(4)
    random.seed(240929)
    train_path = args.directory / "train.jsonl"
    validation_path = args.directory / "validation.jsonl"
    train_count, train_games, _, train_categories = scan(train_path)
    validation_count, validation_games, random_top1, validation_categories = scan(validation_path)
    if train_games & validation_games:
        raise ValueError("Train/validation games overlap")
    model = Model()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=0.001)
    history, best, best_epoch = [], math.inf, 0
    for epoch in range(args.epochs + 1):
        if epoch:
            model.train()
            train_loss = train_policy = train_value = steps = 0.0
            for states, actions, mask, target, outcome, _ in batches(rows(train_path, True), args.batch_size):
                logits, value = model(states, actions)
                logits = logits.masked_fill(~mask, -1e9)
                policy_loss = nn.functional.cross_entropy(logits, target)
                value_loss = nn.functional.binary_cross_entropy_with_logits(value, outcome)
                loss = policy_loss + args.value_coefficient * value_loss
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                train_loss += loss.item()
                train_policy += policy_loss.item()
                train_value += value_loss.item()
                steps += 1
        metrics = evaluate(model, validation_path, args.batch_size)
        record = {"epoch": epoch, **metrics,
                  "selection": metrics["nll"] + args.value_coefficient * metrics["value_bce"]}
        if epoch:
            record.update({"train_loss": train_loss / steps,
                           "train_policy_nll": train_policy / steps, "train_value_bce": train_value / steps})
        history.append(record)
        print(json.dumps(record), flush=True)
        if epoch and record["selection"] < best:
            best, best_epoch = record["selection"], epoch
            torch.save({"state_dict": model.state_dict(), "epoch": epoch}, args.directory / "model.pt")
        if epoch and epoch - best_epoch >= args.patience:
            break
    summary = {"train_positions": train_count, "train_games": len(train_games),
               "validation_positions": validation_count, "validation_games": len(validation_games),
               "train_categories": train_categories, "validation_categories": validation_categories,
               "validation_random_top1": random_top1, "value_coefficient": args.value_coefficient,
               "class_weights": None, "history": history, "best_epoch": best_epoch,
               "use": ("Offline imitation plus outcome prediction" if args.value_coefficient
                       else "Offline imitation only") + "; match evaluation is separate"}
    (args.directory / "training.json").write_text(json.dumps(summary, indent=2) + "\n")
    checkpoint = torch.load(args.directory / "model.pt", weights_only=True)
    model.load_state_dict(checkpoint["state_dict"])
    export(model, checkpoint["epoch"], args.directory)
    print(json.dumps({k: v for k, v in summary.items() if k != "history"}), flush=True)


if __name__ == "__main__":
    main()
