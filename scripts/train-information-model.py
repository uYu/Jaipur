"""Offline initialization. Actor never receives private labels; not PPO."""

import json
import math
import os
import random
import sys
import time
from pathlib import Path
import torch
from torch import nn
from torch.nn.utils.rnn import pad_sequence, pack_padded_sequence

torch.set_num_threads(int(os.environ.get("TRAIN_THREADS", "4")))
torch.manual_seed(7241)
random.seed(7241)


class InformationModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.history = nn.GRU(32, 64, batch_first=True)
        self.state = nn.Linear(109 + 64, 128)
        self.action = nn.Linear(24, 32)
        self.policy = nn.Sequential(nn.Linear(160, 64), nn.ReLU(), nn.Linear(64, 1))
        self.opponent = nn.Sequential(nn.Linear(160, 64), nn.ReLU(), nn.Linear(64, 1))
        self.value = nn.Sequential(
            nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 1), nn.Tanh()
        )
        self.belief = nn.Linear(128, 48)
        self.critic = nn.Sequential(
            nn.Linear(109 + 64 + 7, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Tanh(),
        )

    def forward(self, b):
        state, history, lengths, actions, owners, private = b
        _, h = self.history(
            pack_padded_sequence(
                history,
                lengths.clamp(min=1).cpu(),
                batch_first=True,
                enforce_sorted=False,
            )
        )
        h = h[0] * (lengths > 0).unsqueeze(1)
        context = torch.relu(self.state(torch.cat([state, h], 1)))
        a = torch.cat([context[owners], torch.relu(self.action(actions))], 1)
        # Critic is isolated from actor representation gradients.
        return (
            self.policy(a).flatten(),
            self.opponent(a).flatten(),
            self.value(context).flatten(),
            self.belief(context).reshape(-1, 6, 8),
            self.critic(torch.cat([state, h.detach(), private], 1)).flatten(),
        )


def tensor_row(r):
    for key in ["state", "history", "actions", "private", "hand"]:
        r[key] = torch.tensor(
            r[key], dtype=torch.long if key == "hand" else torch.float32
        )
    if not len(r["history"]):
        r["history"] = torch.empty(0, 32)
    return r


def batch(rows):
    lengths = torch.tensor([len(r["history"]) for r in rows])
    counts = torch.tensor([len(r["actions"]) for r in rows])
    starts = torch.cat([torch.zeros(1, dtype=torch.long), counts.cumsum(0)])
    h = pad_sequence(
        [r["history"] if len(r["history"]) else torch.zeros(1, 32) for r in rows],
        batch_first=True,
    )
    b = (
        torch.stack([r["state"] for r in rows]),
        h,
        lengths,
        torch.cat([r["actions"] for r in rows]),
        torch.repeat_interleave(torch.arange(len(rows)), counts),
        torch.stack([r["private"] for r in rows]),
    )
    return (
        b,
        starts,
        torch.tensor([r["chosen"] for r in rows]) + starts[:-1],
        torch.tensor([r["z"] for r in rows], dtype=torch.float32),
        torch.stack([r["hand"] for r in rows]),
    )


def loss(model, rows):
    b, starts, chosen, z, hand = batch(rows)
    pi, mu, v, belief, critic = model(b)

    def ce(logits):
        return torch.stack(
            [
                torch.logsumexp(logits[starts[i] : starts[i + 1]], 0)
                - logits[chosen[i]]
                for i in range(len(rows))
            ]
        ).mean()

    lp, lm = ce(pi), ce(mu)
    lv = (v - z).square().mean()
    lb = nn.functional.cross_entropy(belief.reshape(-1, 8), hand.flatten())
    lc = (critic - z).square().mean()
    total = lp + 0.5 * lm + lv + 0.2 * lb + lc
    metrics = {
        "policy_nll": lp.item(),
        "opponent_nll": lm.item(),
        "value_mse": lv.item(),
        "belief_ce": lb.item(),
        "critic_mse": lc.item(),
        "selection": (lp + lv).item(),
    }
    return total, metrics


def main():
    directory = Path(sys.argv[1])
    epochs = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    train = [
        tensor_row(json.loads(line)) for line in (directory / "train.jsonl").open()
    ]
    dev = [tensor_row(json.loads(line)) for line in (directory / "dev.jsonl").open()]
    model = InformationModel()
    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    best = math.inf
    records = []
    started = time.time()
    for epoch in range(epochs + 1):
        model.train()
        random.shuffle(train)
        if epoch:
            for i in range(0, len(train), 64):
                optimizer.zero_grad()
                batch_loss, _ = loss(model, train[i : i + 64])
                batch_loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), 5)
                optimizer.step()
        model.eval()
        metrics = {}
        with torch.no_grad():
            for i in range(0, len(dev), 64):
                rows = dev[i : i + 64]
                _, m = loss(model, rows)
                for k, v in m.items():
                    metrics[k] = metrics.get(k, 0) + v * len(rows) / len(dev)
        record = {"epoch": epoch, "elapsed_s": time.time() - started, **metrics}
        records.append(record)
        print(json.dumps({"type": "training", **record}), flush=True)
        if epoch and metrics["selection"] < best:
            best = metrics["selection"]
            torch.save(
                {"state_dict": model.state_dict(), "epoch": epoch, "metrics": metrics},
                directory / "model.pt",
            )
        (directory / "training.json").write_text(json.dumps(records, indent=2) + "\n")
    saved = torch.load(directory / "model.pt", weights_only=True)
    model.load_state_dict(saved["state_dict"])
    model.eval()
    export = {
        "format": "jaipur-information-v1",
        "gruSize": 64,
        "epoch": saved["epoch"],
        "metrics": saved["metrics"],
        "weights": {
            k: v.tolist()
            for k, v in model.state_dict().items()
            if not k.startswith(("critic.", "belief."))
        },
    }
    (directory / "model.json").write_text(
        json.dumps(export, separators=(",", ":")) + "\n"
    )
    # Cross-language inference fixture, including nonempty history and variable actions.
    row = next(r for r in dev if len(r["history"]) > 10)
    b, *_ = batch([row])
    with torch.no_grad():
        pi, mu, v, _, _ = model(b)
    fixture = {
        k: (x.tolist() if isinstance(x, torch.Tensor) else x) for k, x in row.items()
    }
    fixture.update(logits=pi.tolist(), opponent_logits=mu.tolist(), value=v.item())
    (directory / "parity.json").write_text(json.dumps(fixture) + "\n")
    print(
        json.dumps(
            {"type": "selected", "epoch": saved["epoch"], "metrics": saved["metrics"]}
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
