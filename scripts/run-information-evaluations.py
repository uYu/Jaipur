"""Sequential measurements: no concurrent training competes for the 1-second budget."""

import os
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1])
out = root / "final-evaluation"
commands = [
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root),
        str(root / "policy-normal"),
        "policy",
        "normal",
        "51001",
        "32",
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root),
        str(root / "search-policy"),
        "search1",
        "policy",
        "52001",
        "2",
    ],
    [
        sys.executable,
        "scripts/export-information-fixture.py",
        str(root / "ppo"),
        str(root),
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/verify-information-model.ts",
        str(root / "ppo"),
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root / "ppo"),
        str(out / "ppo-normal"),
        "policy",
        "normal",
        "54001",
        "32",
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root),
        str(out / "bc-normal"),
        "policy",
        "normal",
        "54001",
        "32",
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root / "ppo"),
        str(out / "ppo-dmc"),
        "policy",
        "dmc",
        "55001",
        "32",
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root),
        str(out / "search-old"),
        "search1",
        "guidedBehavior",
        "53001",
        "2",
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/evaluate-information.ts",
        str(root / "ppo"),
        str(root / "ppo-search"),
        "search1",
        "policy",
        "56001",
        "2",
    ],
    [
        "node",
        "--experimental-strip-types",
        "scripts/verify-information-games.ts",
        str(root),
    ],
]
for command in commands:
    print("[实验步骤] " + " ".join(command), flush=True)
    subprocess.run(
        command, check=True, env={**os.environ, "JAIPUR_PYTHON": sys.executable}
    )
