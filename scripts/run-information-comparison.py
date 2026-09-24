"""Fixed-checkpoint comparison following comparison/PLAN.md."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

current = Path("analysis/information-ppo-4096-2026-09-24")
previous = Path("analysis/information-pilot-2026-09-24/ppo")
out = current / "comparison"
cases = [
    ("144-vs-16", current, "referencePolicy", 300001),
    ("144-vs-normal", current, "normal", 301001),
    ("16-vs-normal", previous, "normal", 301001),
    ("144-vs-dmc", current, "dmc", 302001),
]
models = [
    current / "model.json",
    previous / "model.json",
    Path("analysis/dmc-resume-fast-2026-09-24/model-738.pt"),
]
(out / "manifest.json").write_text(
    json.dumps(
        {
            "models": {
                str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in models
            },
            "cases": [
                {
                    "name": name,
                    "model": str(model),
                    "baseline": baseline,
                    "start": seed,
                    "pairs": 64,
                }
                for name, model, baseline, seed in cases
            ],
        },
        indent=2,
    )
    + "\n"
)
subprocess.run(
    [
        sys.executable,
        "scripts/export-information-fixture.py",
        str(current),
        "analysis/information-pilot-2026-09-24",
    ],
    check=True,
)
subprocess.run(
    [
        "node",
        "--experimental-strip-types",
        "scripts/verify-information-model.ts",
        str(current),
    ],
    check=True,
)
for name, model, baseline, seed in cases:
    print("[对照组] " + name, flush=True)
    subprocess.run(
        [
            "node",
            "--experimental-strip-types",
            "scripts/evaluate-information.ts",
            str(model),
            str(out / name),
            "policy",
            baseline,
            str(seed),
            "64",
        ],
        check=True,
        env={
            **os.environ,
            "JAIPUR_PYTHON": sys.executable,
            "JAIPUR_REFERENCE_MODEL": str(previous / "model.json"),
        },
    )
subprocess.run(
    [
        "node",
        "--experimental-strip-types",
        "scripts/verify-information-comparison.ts",
        str(out),
    ],
    check=True,
)
