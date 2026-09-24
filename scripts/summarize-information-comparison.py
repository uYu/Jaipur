"""Inference at the paired-seed level, with both seats kept together."""

import json
import math
from pathlib import Path
import sys
import numpy as np

root = Path(sys.argv[1])
verified = json.loads((root / "verification.json").read_text())
rng = np.random.default_rng(240925)
results = {}
for row in verified:
    scores = np.array([x[1] for x in row["pairedResults"]], dtype=float) / 2
    boot = scores[rng.integers(0, len(scores), size=(20000, len(scores)))].mean(axis=1)
    wins = int((scores == 1).sum())
    losses = int((scores == 0).sum())
    n = wins + losses
    p = (
        min(1.0, 2 * sum(math.comb(n, k) for k in range(min(wins, losses) + 1)) / 2**n)
        if n
        else 1.0
    )
    results[row["name"]] = {
        "wins": row["wins"],
        "rate": float(scores.mean()),
        "seed_bootstrap_95": np.quantile(boot, [0.025, 0.975]).tolist(),
        "paired_2_0": wins,
        "paired_1_1": int((scores == 0.5).sum()),
        "paired_0_2": losses,
        "paired_sign_test_p": p,
    }
a = next(r for r in verified if r["name"] == "144-vs-normal")
b = next(r for r in verified if r["name"] == "16-vs-normal")
assert [x[0] for x in a["pairedResults"]] == [x[0] for x in b["pairedResults"]]
delta = np.array(
    [(x[1] - y[1]) / 2 for x, y in zip(a["pairedResults"], b["pairedResults"])]
)
boot = delta[rng.integers(0, len(delta), size=(20000, len(delta)))].mean(axis=1)
output = {
    "comparisons": results,
    "normal_paired_gain": {
        "gain": float(delta.mean()),
        "seed_bootstrap_95": np.quantile(boot, [0.025, 0.975]).tolist(),
    },
    "verified_games": sum(r["games"] for r in verified),
    "verified_actions": sum(r["actions"] for r in verified),
    "promoted": False,
}
(root / "summary.json").write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(output, indent=2))
