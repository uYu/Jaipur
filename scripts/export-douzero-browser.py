"""Export a legacy-round checkpoint as FP32 weights for browser inference."""
import argparse
from pathlib import Path
import struct

import numpy as np
import torch

from douzero_model import JaipurDouZero


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    if saved["architecture"] != "jaipur-douzero-round-v1" or saved.get("full_sale_only"):
        raise ValueError("Browser policy requires the full-action legacy-round model")
    model = JaipurDouZero().eval()
    model.load_state_dict(saved["model"])
    weights = np.concatenate([
        value.detach().numpy().ravel() for value in model.state_dict().values()
    ]).astype("<f4")
    if not np.isfinite(weights).all():
        raise ValueError("Checkpoint contains nonfinite weights")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    header = struct.pack("<4I", 0x4A445A52, 1, saved["version"], len(weights))
    args.output.write_bytes(header + weights.tobytes())
    print(f"Exported version {saved['version']}, {len(weights)} parameters")


if __name__ == "__main__":
    main()
