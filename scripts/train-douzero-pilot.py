"""Small offline pipeline check for the DouZero-shaped Jaipur candidate."""
import argparse
import copy
import json
from pathlib import Path

import numpy as np
import torch
from torch import nn

from douzero_model import JaipurDouZero


def load(path):
    histories, inputs, targets, seeds = [], [], [], set()
    with path.open() as source:
        for line in source:
            row = json.loads(line)
            histories.append(row["history"])
            inputs.append(row["stateAction"])
            targets.append(row["target"])
            seeds.add(row["seed"])
    h = np.asarray(histories, dtype=np.float32)
    x = np.asarray(inputs, dtype=np.float32)
    y = np.asarray(targets, dtype=np.float32)
    if h.ndim != 3 or h.shape[1:] != (16, 26) or x.shape != (len(h), 170):
        raise ValueError(f"Bad input dimensions in {path}")
    if not np.isfinite(h).all() or not np.isfinite(x).all() or not np.isin(y, [-1, 1]).all():
        raise ValueError(f"Bad sample values in {path}")
    return torch.from_numpy(h), torch.from_numpy(x), torch.from_numpy(y), seeds


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=2)
    args = parser.parse_args()
    if args.epochs < 1:
        parser.error("epochs must be positive")
    torch.manual_seed(20260928)
    torch.set_num_threads(min(4, torch.get_num_threads()))
    train_h, train_x, train_y, train_seeds = load(args.train)
    val_h, val_x, val_y, val_seeds = load(args.validation)
    if train_seeds & val_seeds:
        raise ValueError("Train and validation game seeds overlap")
    model = JaipurDouZero()
    optimizer = torch.optim.RMSprop(model.parameters(), lr=1e-4, alpha=.99, eps=1e-5)
    baseline = float(((val_y - train_y.mean()) ** 2).mean())
    losses = []
    best_loss = float("inf")
    best_state = None
    best_epoch = 0
    for epoch in range(args.epochs):
        model.train()
        for batch in torch.randperm(len(train_y)).split(128):
            prediction = model(train_h[batch], train_x[batch]).squeeze(1)
            loss = nn.functional.mse_loss(prediction, train_y[batch])
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 40)
            optimizer.step()
        model.eval()
        with torch.inference_mode():
            prediction = torch.cat([
                model(val_h[batch], val_x[batch]).squeeze(1)
                for batch in torch.arange(len(val_y)).split(128)
            ])
            losses.append(float(nn.functional.mse_loss(prediction, val_y)))
        if losses[-1] < best_loss:
            best_loss = losses[-1]
            best_state = copy.deepcopy(model.state_dict())
            best_epoch = epoch + 1
    model.load_state_dict(best_state)
    with torch.inference_mode():
        row = val_x[0]
        batched = model(val_h[:1], row[None]).item()
        actions = row[146:][None]
        direct = model.score_actions(val_h[:1], row[:146], actions).item()
        if abs(batched - direct) > 1e-5:
            raise AssertionError("Batched and legal-action inference disagree")
    result = {
        "architecture": "LSTM(26,128) + six-layer MLP(298,512,512,512,512,512,1)",
        "parameters": sum(p.numel() for p in model.parameters()),
        "train_examples": len(train_y),
        "validation_examples": len(val_y),
        "train_games": len(train_seeds),
        "validation_games": len(val_seeds),
        "constant_validation_mse": baseline,
        "validation_mse_by_epoch": losses,
        "best_epoch": best_epoch,
        "seed": 20260928,
        "promotion": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "metadata": result}, args.output)
    args.output.with_suffix(".json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
