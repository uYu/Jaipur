"""Paired-seed bootstrap, preserving both seats and both models in each draw."""

import json
import sys
from pathlib import Path
import numpy as np

root = Path(sys.argv[1])
rng = np.random.default_rng(240924)


def records(path):
    return [json.loads(line) for line in path.open()]


def scores(rows):
    output = {}
    for row in rows:
        output[row["seed"]] = output.get(row["seed"], 0) + (row["winner"] == 0) / 2
    return output


bc = scores(records(root / "final-evaluation/bc-normal/policy-normal-games.jsonl"))
ppo = scores(records(root / "final-evaluation/ppo-normal/policy-normal-games.jsonl"))
assert bc.keys() == ppo.keys()
delta = np.array([ppo[s] - bc[s] for s in sorted(bc)])
boot = delta[rng.integers(0, len(delta), size=(20000, len(delta)))].mean(axis=1)
training = json.loads((root / "ppo/training.json").read_text())
result = {
    "ppo_games": 512,
    "ppo_samples": sum(r["samples"] for r in training),
    "ppo_seconds": training[-1]["elapsed_s"],
    "paired_normal_comparison": {
        "seeds": len(delta),
        "bc_rate": sum(bc.values()) / len(bc),
        "ppo_rate": sum(ppo.values()) / len(ppo),
        "gain": float(delta.mean()),
        "seed_bootstrap_95_percent_interval": np.quantile(
            boot, [0.025, 0.975]
        ).tolist(),
        "seed_differences": delta.tolist(),
    },
    "promoted": False,
}
verification = root / "game-verification.json"
if verification.exists():
    verified = json.loads(verification.read_text())
    result["verified_matches"] = sum(row["games"] for row in verified)
    result["verified_actions"] = sum(row["actions"] for row in verified)
result["search_results"] = {}
for name, relative in [
    ("bc_vs_policy", "search-policy/search1-policy-summary.json"),
    (
        "bc_vs_old_search",
        "final-evaluation/search-old/search1-guidedBehavior-summary.json",
    ),
    ("ppo_vs_policy", "ppo-search/search1-policy-summary.json"),
]:
    path = root / relative
    if path.exists():
        result["search_results"][name] = json.loads(path.read_text())
(root / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
