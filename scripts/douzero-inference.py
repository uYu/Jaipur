"""Read-only legal-action scorer for a trained Jaipur DouZero candidate."""
import argparse
import json
import sys

import numpy as np
import torch

from douzero_model import JaipurDouZero

parser = argparse.ArgumentParser()
parser.add_argument("checkpoint")
args = parser.parse_args()
torch.set_num_threads(1)
saved = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
model = JaipurDouZero()
model.load_state_dict(saved["model"])
model.eval()
rng = np.random.default_rng(20260928)

for line in sys.stdin:
    try:
        request = json.loads(line)
        if request["op"] == "ready":
            result = {"architecture": saved.get("architecture") or saved["metadata"]["architecture"]}
        elif request["op"] in ("act", "score"):
            scores = []
            indices = []
            with torch.inference_mode():
                for row in request["rows"]:
                    history = np.asarray(row["history"], dtype=np.float32)
                    state = np.asarray(row["state"], dtype=np.float32)
                    actions = np.asarray(row["actions"], dtype=np.float32)
                    if history.shape != (16, 26) or state.shape != (146,) or actions.ndim != 2 or actions.shape[1] != 24 or not len(actions):
                        raise ValueError("Bad DouZero inference row")
                    if not np.isfinite(history).all() or not np.isfinite(state).all() or not np.isfinite(actions).all():
                        raise ValueError("Nonfinite DouZero inference input")
                    values = model.score_actions(
                        torch.from_numpy(history[None]),
                        torch.from_numpy(state),
                        torch.from_numpy(actions),
                    ).numpy()
                    scores.extend(values.tolist())
                    if request["op"] == "act":
                        epsilon = request.get("epsilon", 0)
                        if not 0 <= epsilon <= 1:
                            raise ValueError("Bad epsilon")
                        choice = int(rng.integers(len(values))) if rng.random() < epsilon else int(rng.choice(np.flatnonzero(values == values.max())))
                        indices.append(choice)
            result = {"scores": scores} if request["op"] == "score" else {"indices": indices}
        else:
            raise ValueError("Unknown operation")
        print(json.dumps(result, separators=(",", ":")), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise
