"""Behavior cloning from observable Jaipur replay positions."""

import argparse
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
    if state.shape != (54,) or actions.ndim != 2 or actions.shape[1] != 12:
        raise ValueError("Unexpected feature dimensions")
    if not 0 <= chosen < len(actions) or not np.isfinite(state).all() or not np.isfinite(actions).all():
        raise ValueError("Invalid replay example")
    return state, actions, chosen


def scan(path):
    count = 0
    random_top1 = 0.0
    game_ids = set()
    with path.open() as stream:
        for line in stream:
            row = json.loads(line)
            count += 1
            game_ids.add(row["game_id"])
            random_top1 += 1 / len(row["actions"])
    if not count:
        raise ValueError(f"No training examples in {path}")
    return count, game_ids, random_top1 / count


def read_rows(path, shuffle):
    if not shuffle:
        with path.open() as stream:
            for line in stream:
                yield convert(json.loads(line))
    else:
        # Bounded shuffle keeps the full-data run below a modest memory limit.
        with path.open() as stream:
            while True:
                lines = [stream.readline() for _ in range(4096)]
                lines = [line for line in lines if line]
                if not lines:
                    break
                random.shuffle(lines)
                for line in lines:
                    yield convert(json.loads(line))


def batches(rows, batch_size):
    selected = []
    for row in rows:
        selected.append(row)
        if len(selected) == batch_size:
            yield make_batch(selected)
            selected = []
    if selected:
        yield make_batch(selected)


def make_batch(selected):
    width = max(len(row[1]) for row in selected)
    data = np.zeros((len(selected), width, 66), dtype=np.float32)
    target = np.empty(len(selected), dtype=np.int64)
    mask = np.zeros((len(selected), width), dtype=bool)
    for i, (state, actions, chosen) in enumerate(selected):
        count = len(actions)
        data[i, :count, :54] = state
        data[i, :count, 54:] = actions
        target[i] = chosen
        mask[i, :count] = True
    return torch.from_numpy(data), torch.from_numpy(target), torch.from_numpy(mask)


def evaluate(model, path, batch_size):
    model.eval()
    loss_sum = correct = total = 0
    with torch.no_grad():
        for inputs, target, mask in batches(read_rows(path, False), batch_size):
            logits = model(inputs).squeeze(-1).masked_fill(~mask, -1e9)
            loss_sum += nn.functional.cross_entropy(logits, target, reduction="sum").item()
            correct += (logits.argmax(1) == target).sum().item()
            total += len(target)
    return {"nll": loss_sum / total, "top1": correct / total}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--epochs", type=int, default=8, help="Total epoch limit")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=0.002)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 1 or args.patience < 1 or args.learning_rate <= 0:
        parser.error("Epochs, batch size, patience, and learning rate must be positive")
    torch.manual_seed(240929)
    torch.set_num_threads(4)
    random.seed(240929)
    train_path = args.directory / "train.jsonl"
    validation_path = args.directory / "validation.jsonl"
    train_count, train_games, _ = scan(train_path)
    validation_count, validation_games, random_top1 = scan(validation_path)
    if train_games & validation_games:
        raise ValueError("Train/validation games overlap")
    model = nn.Sequential(nn.Linear(66, 64), nn.ReLU(), nn.Linear(64, 1))
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate, weight_decay=0.001)
    history = []
    best = math.inf
    first_epoch = 0
    if args.resume:
        old = json.loads((args.directory / "training.json").read_text())
        checkpoint = torch.load(args.directory / "model.pt", weights_only=True)
        model.load_state_dict(checkpoint["state_dict"])
        history = old["history"]
        best = min(row["nll"] for row in history[1:])
        first_epoch = history[-1]["epoch"] + 1
    for epoch in range(first_epoch, args.epochs + 1):
        if epoch:
            model.train()
            for inputs, target, mask in batches(read_rows(train_path, True), args.batch_size):
                logits = model(inputs).squeeze(-1).masked_fill(~mask, -1e9)
                loss = nn.functional.cross_entropy(logits, target)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
        metrics = evaluate(model, validation_path, args.batch_size)
        record = {"epoch": epoch, **metrics}
        history.append(record)
        print(json.dumps(record), flush=True)
        if epoch and metrics["nll"] < best:
            best = metrics["nll"]
            torch.save({"state_dict": model.state_dict(), "epoch": epoch}, args.directory / "model.pt")
        if epoch and epoch - min(history[1:], key=lambda row: row["nll"])["epoch"] >= args.patience:
            break
    summary = {
        "train_positions": train_count, "train_games": len(train_games),
        "validation_positions": validation_count, "validation_games": len(validation_games),
        "validation_random_top1": random_top1,
        "history": history, "best_epoch": min(history[1:], key=lambda r: r["nll"])["epoch"],
        "use": "Offline behavior cloning; match evaluation is left to the user",
    }
    (args.directory / "training.json").write_text(json.dumps(summary, indent=2) + "\n")
    checkpoint = torch.load(args.directory / "model.pt", weights_only=True)
    model.load_state_dict(checkpoint["state_dict"])
    export = {"format": "jaipur-human-policy-v1", "state_features": 54,
              "action_features": 12, "hidden": 64, "best_epoch": checkpoint["epoch"],
              "w1": model[0].weight.detach().tolist(), "b1": model[0].bias.detach().tolist(),
              "w2": model[2].weight.detach().flatten().tolist(),
              "b2": float(model[2].bias.detach()[0])}
    (args.directory / "model.json").write_text(json.dumps(export, separators=(",", ":")) + "\n")
    print(json.dumps({k: v for k, v in summary.items() if k != "history"}), flush=True)


if __name__ == "__main__":
    main()
