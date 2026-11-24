"""Export a legacy-round checkpoint as FP32 weights for browser inference."""
import argparse
from pathlib import Path
import struct

import numpy as np
import torch



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    if saved["architecture"] != "jaipur-douzero-round-v1" or saved.get("full_sale_only"):
        raise ValueError("Browser policy requires the full-action legacy-round model")
    spec = saved.get("model_spec", {})
    encoder = spec.get("history_encoder", "lstm")
    if (spec.get("width", 512) != 512 or spec.get("depth", 5) != 5 or
            spec.get("history_length", 16) != 16 or encoder not in ("lstm", "transformer256")):
        raise ValueError("Unsupported browser architecture")
    # Explicit inference layout; auxiliary training heads are intentionally excluded.
    shapes = []
    def linear(prefix, rows, width):
        shapes.extend([(prefix + ".weight", (rows, width)), (prefix + ".bias", (rows,))])
    if encoder == "lstm":
        shapes.extend([("lstm.weight_ih_l0", (512, 26)), ("lstm.weight_hh_l0", (512, 128)),
                       ("lstm.bias_ih_l0", (512,)), ("lstm.bias_hh_l0", (512,))])
    else:
        shapes.extend([("transformer.summary", (1, 1, 256)), ("transformer.positions", (1, 17, 256))])
        linear("transformer.input", 256, 26)
        for i in range(2):
            prefix = f"transformer.layers.{i}"
            shapes.extend([(prefix + ".self_attn.in_proj_weight", (768, 256)),
                           (prefix + ".self_attn.in_proj_bias", (768,))])
            linear(prefix + ".self_attn.out_proj", 256, 256)
            linear(prefix + ".linear1", 512, 256)
            linear(prefix + ".linear2", 256, 512)
            for norm in ("norm1", "norm2"):
                shapes.extend([(prefix + "." + norm + ".weight", (256,)),
                               (prefix + "." + norm + ".bias", (256,))])
        linear("transformer.output", 128, 256)
    for i in range(6):
        linear(f"mlp.{2*i}", 1 if i == 5 else 512, 298 if i == 0 else 512)
    tensors = saved["model"]
    for key, shape in shapes:
        if tuple(tensors[key].shape) != shape:
            raise ValueError(f"Unexpected shape: {key}")
    if set(tensors) - {key for key, _ in shapes} - {"auxiliary_head.weight", "auxiliary_head.bias"}:
        raise ValueError("Unexpected checkpoint tensors")
    weights = np.concatenate([tensors[key].detach().numpy().ravel() for key, _ in shapes]).astype("<f4")
    format_version = 2 if encoder == "transformer256" else 1
    if not np.isfinite(weights).all():
        raise ValueError("Checkpoint contains nonfinite weights")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    header = struct.pack("<4I", 0x4A445A52, format_version, saved["version"], len(weights))
    args.output.write_bytes(header + weights.tobytes())
    print(f"Exported version {saved['version']}, {len(weights)} parameters")


if __name__ == "__main__":
    main()
