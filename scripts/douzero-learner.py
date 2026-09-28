"""On-policy self-play learner for the DouZero-shaped Jaipur Q-network."""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from torch import nn

from douzero_model import JaipurDouZero

parser = argparse.ArgumentParser()
parser.add_argument("--directory", type=Path, required=True)
parser.add_argument("--checkpoint", type=Path)
parser.add_argument("--seed", type=int, default=20260928)
parser.add_argument("--device", choices=("auto", "cpu", "cuda", "mps"), default="auto")
args = parser.parse_args()
if args.device == "auto":
    selected = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
else:
    selected = args.device
if selected == "cuda" and not torch.cuda.is_available():
    parser.error("CUDA requested but PyTorch cannot access a CUDA device")
if selected == "mps" and not torch.backends.mps.is_available():
    parser.error("MPS requested but PyTorch cannot access an MPS device")
device = torch.device(selected)
# Self-play action scoring stays on CPU even when weight updates use a GPU.
torch.set_num_threads(min(4, torch.get_num_threads()))
torch.manual_seed(args.seed)
rng = np.random.default_rng(args.seed)
saved = torch.load(args.checkpoint, map_location="cpu", weights_only=True) if args.checkpoint else None
model = JaipurDouZero().to(device)
actor_model = model if selected == "cpu" else JaipurDouZero()
optimizer = torch.optim.RMSprop(model.parameters(), lr=1e-4, alpha=.99, eps=1e-5)
version = 0
if saved:
    if saved.get("architecture") != "jaipur-douzero-history-v1":
        raise ValueError("Expected a self-play DouZero checkpoint")
    model.load_state_dict(saved["model"])
    optimizer.load_state_dict(saved["optimizer"])
    torch.set_rng_state(saved["torch_rng"])
    if selected == "cuda" and saved.get("cuda_rng") is not None:
        torch.cuda.set_rng_state(saved["cuda_rng"])
    rng.bit_generator.state = saved["numpy_rng"]
    version = saved["version"]
args.directory.mkdir(parents=True, exist_ok=True)


def sync_actor():
    if actor_model is not model:
        actor_model.load_state_dict({
            name: weight.detach().cpu()
            for name, weight in model.state_dict().items()
        })
    actor_model.eval()


sync_actor()


def save():
    path = args.directory / f"model-{version:03d}.pt"
    temporary = path.with_name(f".{path.name}.tmp")
    torch.save({
        "architecture": "jaipur-douzero-history-v1",
        "model": model.state_dict(), "optimizer": optimizer.state_dict(),
        "version": version, "torch_rng": torch.get_rng_state(),
        "cuda_rng": torch.cuda.get_rng_state() if selected == "cuda" else None,
        "numpy_rng": rng.bit_generator.state,
        "state_features": 146, "action_features": 24,
        "history_length": 16, "history_features": 26,
        "target": "completed_match_actor_return",
    }, temporary)
    os.replace(temporary, path)
    return str(path)


for line in sys.stdin:
    try:
        request = json.loads(line)
        op = request["op"]
        if op == "ready":
            result = {"version": version, "device": str(device), "actor_device": "cpu"}
        elif op in ("act", "score"):
            indices, values = [], []
            histories, states, actions, lengths = [], [], [], []
            for row in request["rows"]:
                h = np.asarray(row["history"], dtype=np.float32)
                s = np.asarray(row["state"], dtype=np.float32)
                a = np.asarray(row["actions"], dtype=np.float32)
                if h.shape != (16, 26) or s.shape != (146,) or a.ndim != 2 or a.shape[1] != 24 or not len(a):
                    raise ValueError("Bad self-play inference row")
                if not np.isfinite(h).all() or not np.isfinite(s).all() or not np.isfinite(a).all():
                    raise ValueError("Nonfinite self-play inference features")
                histories.append(h)
                states.append(s)
                actions.append(a)
                lengths.append(len(a))
            with torch.inference_mode():
                all_scores = actor_model.score_rows(
                    torch.from_numpy(np.stack(histories)),
                    torch.from_numpy(np.stack(states)),
                    torch.from_numpy(np.concatenate(actions)),
                    lengths,
                ).numpy()
            if op == "act":
                epsilon = request.get("epsilon", 0)
                if not 0 <= epsilon <= 1:
                    raise ValueError("Bad epsilon")
                at = 0
                for n in lengths:
                    q = all_scores[at:at+n]
                    index = int(rng.integers(n)) if rng.random() < epsilon else int(rng.choice(np.flatnonzero(q == q.max())))
                    indices.append(index)
                    values.append(float(q[index]))
                    at += n
            result = {"scores": all_scores.tolist(), "version": version} if op == "score" else {"indices": indices, "values": values, "version": version}
        elif op == "learn":
            h = np.asarray(request["history"], dtype=np.float32)
            x = np.asarray(request["x"], dtype=np.float32)
            y = np.asarray(request["y"], dtype=np.float32)
            if h.ndim != 3 or h.shape[1:] != (16, 26) or x.shape != (len(h), 170) or y.shape != (len(h),):
                raise ValueError("Bad self-play batch shape")
            if not np.isfinite(h).all() or not np.isfinite(x).all() or not np.isin(y, [-1, 0, 1]).all():
                raise ValueError("Bad self-play batch values")
            if request.get("save_batch", False):
                np.savez_compressed(args.directory / f"batch-{version:03d}.npz",
                                    history=h.astype(np.float16), x=x, y=y)
            th, tx, ty = torch.from_numpy(h), torch.from_numpy(x), torch.from_numpy(y)
            losses = []
            model.train()
            for _ in range(request.get("epochs", 4)):
                for batch in np.array_split(rng.permutation(len(y)),
                                            max(1, (len(y) + 255) // 256)):
                    prediction = model(th[batch].to(device), tx[batch].to(device)).squeeze(1)
                    loss = nn.functional.mse_loss(prediction, ty[batch].to(device))
                    optimizer.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(model.parameters(), 40)
                    optimizer.step()
                    losses.append(float(loss.detach()))
            version += 1
            model.eval()
            sync_actor()
            result = {"version": version, "samples": len(y),
                      "mse": float(np.mean(losses))}
        elif op == "save":
            result = {"version": version, "checkpoint": save()}
        else:
            raise ValueError("Unknown operation")
        print(json.dumps(result, separators=(",", ":")), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise
