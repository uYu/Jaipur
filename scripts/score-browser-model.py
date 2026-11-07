"""Read-only NumPy scorer for exported browser weights, matching FP32 layer boundaries.

Uses FP64 dot products as the JS implementation does, then stores each linear
layer, cell and hidden state in FP32. No training or checkpoint conversion.
"""
import argparse
import json
import struct
import sys

import numpy as np


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("model")
args = parser.parse_args()
with open(args.model, "rb") as source:
    magic, format_version, version, parameters = struct.unpack("<4I", source.read(16))
    weights = np.frombuffer(source.read(), dtype="<f4").astype(np.float64)
if (magic, format_version, parameters) != (0x4A445A52, 1, 1284097) or len(weights) != parameters:
    raise ValueError("Unsupported browser model")
at = 0


def take(shape):
    global at
    size = int(np.prod(shape))
    result = weights[at:at + size].reshape(shape)
    at += size
    return result


input_weight = take((512, 26))
recurrent_weight = take((512, 128))
input_bias = take((512,))
recurrent_bias = take((512,))
layers = []
for i, width in enumerate([298, 512, 512, 512, 512, 512]):
    height = 1 if i == 5 else 512
    layers.append((take((height, width)), take((height,))))
assert at == parameters


def rounded(value):
    return value.astype(np.float32).astype(np.float64)


def score(rows):
    history = np.asarray([r["history"] for r in rows], dtype=np.float32).astype(np.float64)
    states = np.asarray([r["state"] for r in rows], dtype=np.float32).astype(np.float64)
    action_rows = [np.asarray(r["actions"], dtype=np.float32).astype(np.float64) for r in rows]
    if history.shape != (len(rows), 16, 26) or states.shape != (len(rows), 146):
        raise ValueError("Bad state/history shape")
    if any(a.ndim != 2 or a.shape[1] != 24 or len(a) == 0 for a in action_rows):
        raise ValueError("Bad action shape")
    hidden = np.zeros((len(rows), 128))
    cell = np.zeros_like(hidden)
    for t in range(16):
        gates = rounded(history[:, t] @ input_weight.T + input_bias)
        recurrent = rounded(hidden @ recurrent_weight.T + recurrent_bias)
        gates += recurrent
        i, f, g, o = np.split(gates, 4, axis=1)
        cell = rounded((1 / (1 + np.exp(-f))) * cell + (1 / (1 + np.exp(-i))) * np.tanh(g))
        hidden = rounded((1 / (1 + np.exp(-o))) * np.tanh(cell))
    lengths = [len(a) for a in action_rows]
    context = np.concatenate((hidden, states), axis=1)
    weight, bias = layers[0]
    common = rounded(context @ weight[:, :274].T + bias)
    actions = np.concatenate(action_rows)
    x = rounded(np.repeat(common, lengths, axis=0) + actions @ weight[:, 274:].T)
    np.maximum(x, 0, out=x)
    for weight, bias in layers[1:]:
        x = rounded(x @ weight.T + bias)
        if weight.shape[0] != 1:
            np.maximum(x, 0, out=x)
    values = x[:, 0]
    ends = np.cumsum(lengths)[:-1]
    return [v.tolist() for v in np.split(values, ends)]


for line in sys.stdin:
    try:
        request = json.loads(line)
        if request["op"] == "ready":
            answer = {"version": version, "parameters": parameters, "backend": "numpy-fp64-dots-fp32-layers"}
        elif request["op"] == "score":
            answer = {"scores": score(request["rows"]), "version": version}
        else:
            raise ValueError("Unknown operation")
        print(json.dumps(answer, separators=(",", ":")), flush=True)
    except Exception as error:
        print(json.dumps({"error": str(error)}), flush=True)
        raise
