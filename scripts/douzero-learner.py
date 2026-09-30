"""On-policy self-play learner for the DouZero-shaped Jaipur Q-network."""
import argparse
import json
import os
import sys
from pathlib import Path

try:
    import orjson
except ImportError:
    orjson = None

import numpy as np
import torch
from torch import nn

from douzero_model import JaipurDouZero, JaipurHierarchical

parser = argparse.ArgumentParser()
parser.add_argument("--directory", type=Path, required=True)
parser.add_argument("--checkpoint", type=Path)
parser.add_argument("--seed", type=int, default=20260928)
parser.add_argument("--device", choices=("auto", "cpu", "cuda", "mps"), default="auto")
parser.add_argument("--actor-device", choices=("cpu", "cuda", "mps"), default="cpu")
parser.add_argument("--architecture", choices=("flat", "hierarchical"), default="flat")
parser.add_argument("--full-sale-only", action="store_true")
parser.add_argument("--scorer-only", action="store_true")
args = parser.parse_args()
if args.device == "auto":
    selected = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
else:
    selected = args.device
if selected == "cuda" and not torch.cuda.is_available():
    parser.error("CUDA requested but PyTorch cannot access a CUDA device")
if selected == "mps" and not torch.backends.mps.is_available():
    parser.error("MPS requested but PyTorch cannot access an MPS device")
if args.actor_device == "cuda" and not torch.cuda.is_available():
    parser.error("CUDA actor requested but PyTorch cannot access a CUDA device")
if args.actor_device == "mps" and not torch.backends.mps.is_available():
    parser.error("MPS actor requested but PyTorch cannot access an MPS device")
if args.architecture == "hierarchical" and args.actor_device != "cpu":
    parser.error("Hierarchical actor currently requires CPU scoring")
device = torch.device(selected)
actor_device = torch.device(args.actor_device)
torch.set_num_threads(min(4, torch.get_num_threads()))
torch.manual_seed(args.seed)
rng = np.random.default_rng(args.seed)
saved = torch.load(args.checkpoint, map_location="cpu", weights_only=True) if args.checkpoint else None
architecture = ("jaipur-hierarchical-history-v1" if args.architecture == "hierarchical"
                else "jaipur-douzero-history-v1")
model_type = JaipurHierarchical if args.architecture == "hierarchical" else JaipurDouZero
model = model_type().to(device)
actor_model = model if args.actor_device == selected else model_type().to(actor_device)
optimizer = None if args.scorer_only else torch.optim.RMSprop(model.parameters(), lr=1e-4, alpha=.99, eps=1e-5)
version = 0
if saved:
    if saved.get("architecture") != architecture:
        raise ValueError(f"Expected a {architecture} checkpoint")
    if saved.get("full_sale_only", False) != args.full_sale_only:
        raise ValueError("Checkpoint sale-action policy differs from this run")
    model.load_state_dict(saved["model"])
    if not args.scorer_only:
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
        "architecture": architecture,
        "full_sale_only": args.full_sale_only,
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
        request = orjson.loads(line) if orjson is not None else json.loads(line)
        op = request["op"]
        if op == "ready":
            result = {"version": version, "device": str(device), "actor_device": str(actor_device),
                      "full_sale_only": args.full_sale_only}
        elif op == "export_actor":
            if args.scorer_only:
                raise ValueError("Scorer cannot export actor weights")
            path = args.directory / ".actor-sync.pt"
            temporary = path.with_name(f".{path.name}.tmp")
            torch.save({"model": actor_model.state_dict(), "version": version}, temporary)
            os.replace(temporary, path)
            result = {"path": str(path), "version": version}
        elif op == "load_actor":
            if not args.scorer_only:
                raise ValueError("Only a scorer can load actor weights")
            snapshot = torch.load(request["path"], map_location="cpu", weights_only=True)
            model.load_state_dict(snapshot["model"])
            version = snapshot["version"]
            sync_actor()
            result = {"version": version}
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
            if args.architecture == "hierarchical" and op == "act":
                epsilon = request.get("epsilon", 0)
                if not 0 <= epsilon <= 1:
                    raise ValueError("Bad epsilon")
                indices, values = actor_model.choose_rows(
                    np.stack(histories), np.stack(states), actions, epsilon, rng)
                result = {"indices": indices, "values": values, "version": version}
                print(json.dumps(result, separators=(",", ":")), flush=True)
                continue
            with torch.inference_mode():
                if args.architecture == "hierarchical":
                    all_scores = np.concatenate([
                        actor_model.score_actions(
                            torch.from_numpy(h[None]), torch.from_numpy(s),
                            torch.from_numpy(a)).numpy()
                        for h, s, a in zip(histories, states, actions)
                    ])
                else:
                    all_scores = actor_model.score_rows(
                        torch.from_numpy(np.stack(histories)).to(actor_device),
                        torch.from_numpy(np.stack(states)).to(actor_device),
                        torch.from_numpy(np.concatenate(actions)).to(actor_device),
                        lengths,
                    ).cpu().numpy()
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
            if args.scorer_only:
                raise ValueError("Scorer cannot train")
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
            kind_losses, target_losses, action_losses = [], [], []
            model.train()
            for _ in range(request.get("epochs", 4)):
                for batch in np.array_split(rng.permutation(len(y)),
                                            max(1, (len(y) + 255) // 256)):
                    if args.architecture == "hierarchical":
                        kind_q, target_q, action_q, kind = model.training_scores(
                            th[batch].to(device), tx[batch].to(device))
                        label = ty[batch].to(device)
                        kind_loss = nn.functional.mse_loss(kind_q, label)
                        action_loss = nn.functional.mse_loss(action_q, label)
                        loss = kind_loss + action_loss
                        kind_losses.append(float(kind_loss.detach()))
                        action_losses.append(float(action_loss.detach()))
                        exchange = kind == 3
                        if exchange.any():
                            target_loss = nn.functional.mse_loss(
                                target_q[exchange], label[exchange])
                            loss = loss + target_loss
                            target_losses.append(float(target_loss.detach()))
                    else:
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
            result = {"version": version, "samples": len(y)}
            if args.architecture == "hierarchical":
                result.update({"loss": float(np.mean(losses)),
                               "kindMse": float(np.mean(kind_losses)),
                               "targetMse": float(np.mean(target_losses)) if target_losses else None,
                               "actionMse": float(np.mean(action_losses))})
            else:
                result["mse"] = float(np.mean(losses))
        elif op == "save":
            if args.scorer_only:
                raise ValueError("Scorer cannot save checkpoints")
            result = {"version": version, "checkpoint": save()}
        else:
            raise ValueError("Unknown operation")
        print(json.dumps(result, separators=(",", ":")), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise
