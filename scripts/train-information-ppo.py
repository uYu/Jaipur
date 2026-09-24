"""Fresh on-policy PPO with an isolated privileged critic and a public MC value."""

import argparse
import hashlib
import os
import importlib.util
import json
import random
import subprocess
import time
import shutil
from pathlib import Path
import torch
from torch import nn

spec = importlib.util.spec_from_file_location(
    "information", Path(__file__).with_name("train-information-model.py")
)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("directory", type=Path)
parser.add_argument("iterations", type=int, nargs="?", default=16)
parser.add_argument("--seed-base", type=int, default=60000)
parser.add_argument("--dev-directory", type=Path)
parser.add_argument(
    "--scratch",
    action="store_true",
    help="Random initialization; source argument is ignored",
)
parser.add_argument("--random-seed", type=int, default=9241)
args = parser.parse_args()
source, directory, iterations = args.source, args.directory, args.iterations
if iterations < 1:
    raise ValueError("iterations must be positive")
directory.mkdir(parents=True, exist_ok=True)
if (directory / "training.json").exists() or (
    directory / "selfplay-games.jsonl"
).exists():
    raise RuntimeError(
        "Refusing to overwrite an existing PPO experiment; choose a fresh directory"
    )
checkpoint = (
    {}
    if args.scratch
    else torch.load(source / "model.pt", map_location="cpu", weights_only=True)
)
initial_iteration = checkpoint.get("iteration", 0)
if (
    args.seed_base < 0
    or args.seed_base + (initial_iteration + iterations) * 100 + 31 > 0xFFFFFFFF
):
    raise ValueError("Invalid seed range")
if args.scratch:
    torch.manual_seed(args.random_seed)
    random.seed(args.random_seed)
model = m.InformationModel()
if checkpoint:
    model.load_state_dict(checkpoint["state_dict"])
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4, weight_decay=1e-4)
if "optimizer" in checkpoint:
    optimizer.load_state_dict(checkpoint["optimizer"])
elif checkpoint:
    print(
        "[续训说明] 源检查点只有模型权重，AdamW状态重新初始化；其余PPO超参数保持一致。",
        flush=True,
    )
torch.manual_seed(args.random_seed)
random.seed(args.random_seed)
if "torch_rng" in checkpoint:
    torch.set_rng_state(checkpoint["torch_rng"])
if "python_rng" in checkpoint:
    random.setstate(checkpoint["python_rng"])
dev_directory = args.dev_directory
if dev_directory is None and not args.scratch and (source / "dev.jsonl").is_file():
    dev_directory = source
if dev_directory is not None and not (dev_directory / "dev.jsonl").is_file():
    raise FileNotFoundError("Specified dev.jsonl does not exist")
config = {
    "source": None if args.scratch else str(source),
    "initialization": "random" if args.scratch else "checkpoint",
    "random_seed": args.random_seed,
    "balanced_seats": os.environ.get("INFORMATION_BALANCED_SEATS", "0") == "1",
    "source_sha256": (
        None
        if args.scratch
        else hashlib.sha256((source / "model.pt").read_bytes()).hexdigest()
    ),
    "initial_iteration": initial_iteration,
    "additional_iterations": iterations,
    "additional_games": iterations * 32,
    "seed_base": args.seed_base,
    "first_seed": args.seed_base + (initial_iteration + 1) * 100,
    "last_seed": args.seed_base + (initial_iteration + iterations) * 100 + 31,
    "optimizer_restored": "optimizer" in checkpoint,
    "dev_directory": str(dev_directory) if dev_directory else None,
    "lr": 1e-4,
    "batch_size": 64,
    "epochs": 3,
    "clip": 0.2,
    "gamma": 1,
    "gae_lambda": 0.95,
    "entropy_weight": 0.01,
    "max_kl": 0.02,
    "torch_version": str(torch.__version__),
}
(directory / "config.json").write_text(json.dumps(config, indent=2) + "\n")
print(json.dumps({"type": "plan", **config}), flush=True)


def export(path):
    path.write_text(
        json.dumps(
            {
                "format": "jaipur-information-v1",
                "gruSize": 64,
                "weights": {
                    k: v.tolist()
                    for k, v in model.state_dict().items()
                    if not k.startswith(("critic.", "belief."))
                },
            },
            separators=(",", ":"),
        )
        + "\n"
    )


def policy_terms(logits, starts, chosen):
    logp = []
    entropy = []
    for i in range(len(chosen)):
        log_probabilities = torch.log_softmax(logits[starts[i] : starts[i + 1]], 0)
        logp.append(log_probabilities[chosen[i] - starts[i]])
        entropy.append(-(log_probabilities.exp() * log_probabilities).sum())
    return torch.stack(logp), torch.stack(entropy)


export(directory / "model.json")
if "past_weights" in checkpoint:
    (directory / "past.json").write_text(json.dumps(checkpoint["past_weights"]) + "\n")
else:
    shutil.copyfile(
        (
            source / "past.json"
            if not args.scratch and (source / "past.json").exists()
            else directory / "model.json"
        ),
        directory / "past.json",
    )
records = []
started = time.time()
for iteration in range(initial_iteration + 1, initial_iteration + iterations + 1):
    rollout = directory / "fresh.jsonl"
    subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "scripts/collect-information.ts",
            str(directory / "model.json"),
            str(directory / "past.json"),
            str(rollout),
            str(args.seed_base + iteration * 100),
            "32",
        ],
        check=True,
    )
    with (directory / "selfplay-games.jsonl").open("a") as out:
        out.write(Path(str(rollout) + ".games").read_text())
    rows = [m.tensor_row(json.loads(line)) for line in rollout.open()]
    model.eval()
    max_parity = 0
    with torch.no_grad():
        for i in range(0, len(rows), 64):
            part = rows[i : i + 64]
            b, starts, chosen, *_ = m.batch(part)
            pi, _, _, _, critic = model(b)
            logp, _ = policy_terms(pi, starts, chosen)
            max_parity = max(
                max_parity,
                max(abs(logp[j].item() - r["old_logp"]) for j, r in enumerate(part)),
            )
            for r, c in zip(part, critic):
                r["old_value"] = c.item()
    if max_parity > 1e-4:
        raise RuntimeError(f"On-policy log probability mismatch {max_parity}")
    trajectories = {}
    for row in rows:
        trajectories.setdefault(row["trajectory"], []).append(row)
    for trajectory in trajectories.values():
        advantage = 0.0
        next_value = 0.0
        for i in range(len(trajectory) - 1, -1, -1):
            r = trajectory[i]
            reward = r["z"] if i == len(trajectory) - 1 else 0.0
            delta = reward + next_value - r["old_value"]
            advantage = delta + 0.95 * advantage
            r["advantage"] = advantage
            r["return"] = advantage + r["old_value"]
            next_value = r["old_value"]
    advantages = torch.tensor([r["advantage"] for r in rows])
    mean = advantages.mean().item()
    std = advantages.std().clamp(min=1e-6).item()
    for r in rows:
        r["advantage"] = (r["advantage"] - mean) / std
    model.train()
    metrics = []
    stopped = False
    for epoch in range(3):
        random.shuffle(rows)
        for i in range(0, len(rows), 64):
            part = rows[i : i + 64]
            b, starts, chosen, z, hand = m.batch(part)
            pi, mu, v, belief, critic = model(b)
            logp, entropy = policy_terms(pi, starts, chosen)
            mu_logp, _ = policy_terms(mu, starts, chosen)
            old = torch.tensor([r["old_logp"] for r in part])
            adv = torch.tensor([r["advantage"] for r in part])
            ret = torch.tensor([r["return"] for r in part])
            old_value = torch.tensor([r["old_value"] for r in part])
            ratio = (logp - old).exp()
            kl = ((ratio - 1) - (logp - old)).mean()
            if kl.item() > 0.02:
                stopped = True
                break
            policy = -torch.minimum(ratio * adv, ratio.clamp(0.8, 1.2) * adv).mean()
            clipped = old_value + (critic - old_value).clamp(-0.2, 0.2)
            critic_loss = torch.maximum(
                (critic - ret).square(), (clipped - ret).square()
            ).mean()
            value_loss = (v - z).square().mean()
            belief_loss = nn.functional.cross_entropy(
                belief.reshape(-1, 8), hand.flatten()
            )
            loss = (
                policy
                + 0.5 * critic_loss
                + 0.5 * value_loss
                - 0.01 * entropy.mean()
                - 0.1 * mu_logp.mean()
                + 0.05 * belief_loss
            )
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 0.5)
            optimizer.step()
            metrics.append(
                {
                    "policy_loss": policy.item(),
                    "critic_mse": critic_loss.item(),
                    "public_value_mse": value_loss.item(),
                    "entropy": entropy.mean().item(),
                    "kl": kl.item(),
                }
            )
        if stopped:
            break
    if iteration % 4 == 0:
        shutil.copyfile(directory / "model.json", directory / "past.json")
    export(directory / "model.json")
    torch.save(
        {
            "state_dict": model.state_dict(),
            "iteration": iteration,
            "optimizer": optimizer.state_dict(),
            "torch_rng": torch.get_rng_state(),
            "python_rng": random.getstate(),
            "past_weights": json.loads((directory / "past.json").read_text()),
        },
        directory / "model.pt.tmp",
    )
    (directory / "model.pt.tmp").replace(directory / "model.pt")
    if iteration % 16 == 0 or iteration == initial_iteration + iterations:
        shutil.copyfile(directory / "model.pt", directory / f"model-{iteration:03d}.pt")
        shutil.copyfile(
            directory / "model.json", directory / f"model-{iteration:03d}.json"
        )
    record = {
        "type": "ppo",
        "iteration": iteration,
        "additional_games": (iteration - initial_iteration) * 32,
        "total_games": iteration * 32,
        "samples": len(rows),
        "trajectories": len(trajectories),
        "elapsed_s": time.time() - started,
        "old_logp_max_error": max_parity,
        "kl_early_stop": stopped,
        **{k: sum(x[k] for x in metrics) / max(1, len(metrics)) for k in metrics[0]},
    }
    records.append(record)
    print(json.dumps(record), flush=True)
    (directory / "training.json").write_text(json.dumps(records, indent=2) + "\n")
    rollout.unlink()
    Path(str(rollout) + ".games").unlink()
# Optional external diagnostic data; scratch training has no dataset dependency.
if dev_directory is not None:
    model.eval()
    dev = [
        m.tensor_row(json.loads(line)) for line in (dev_directory / "dev.jsonl").open()
    ]
    metrics = {}
    with torch.no_grad():
        for i in range(0, len(dev), 64):
            part = dev[i : i + 64]
            _, result = m.loss(model, part)
            for k, v in result.items():
                metrics[k] = metrics.get(k, 0) + v * len(part) / len(dev)
    (directory / "dev.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps({"type": "ppo_dev", **metrics}), flush=True)
