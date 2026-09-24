"""Retrospective learning-curve diagnostic; not checkpoint selection."""

import json
import os
from pathlib import Path
import subprocess
import sys

root = Path("analysis/information-ppo-4096-2026-09-24")
out = root / "diagnosis"
plan = {
    "purpose": "retrospective diagnosis, not model selection",
    "iterations": [16, 48, 80, 112, 144],
    "seeds": [310001, 310032],
    "games_per_checkpoint": 64,
    "opponent": "normal",
    "acting": "greedy pure policy",
}
(out / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
for iteration in plan["iterations"]:
    alias = out / f"model-{iteration:03d}"
    alias.mkdir(exist_ok=True)
    source = (
        Path("analysis/information-pilot-2026-09-24/ppo/model.json")
        if iteration == 16
        else root / f"model-{iteration:03d}.json"
    )
    (alias / "model.json").symlink_to(source.resolve())
    print(f"[学习曲线] 固定第{iteration}轮，32组新种子换座位", flush=True)
    subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "scripts/evaluate-information.ts",
            str(alias),
            str(alias),
            "policy",
            "normal",
            "310001",
            "32",
        ],
        check=True,
        env={**os.environ, "JAIPUR_PYTHON": sys.executable},
    )
