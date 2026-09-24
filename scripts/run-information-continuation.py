"""Run the registered 4096-game continuation, then replay every match."""

import subprocess
import sys
from pathlib import Path

root = Path("analysis/information-ppo-4096-2026-09-24")
pilot = Path("analysis/information-pilot-2026-09-24")
subprocess.run(
    [
        sys.executable,
        "scripts/train-information-ppo.py",
        str(pilot / "ppo"),
        str(root),
        "128",
        "--seed-base",
        "200000",
        "--dev-directory",
        str(pilot),
    ],
    check=True,
)
subprocess.run(
    [
        "node",
        "--experimental-strip-types",
        "scripts/verify-information-continuation.ts",
        str(root),
    ],
    check=True,
)
print(
    "[完成] 新增4096场PPO训练和全量动作回放核验完成；最终模型第144轮，未替换部署模型。",
    flush=True,
)
