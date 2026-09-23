"""Compare exported FP32 weights against the actual C++ inference path."""
import argparse
from pathlib import Path
import re
import subprocess

import numpy as np


def weights(text, name):
    match = re.search(rf"\b{name}\s*=\s*\{{([^}}]+)\}}", text)
    if not match:
        raise ValueError(f"Missing {name}")
    return np.fromstring(match.group(1).replace("f", ""), sep=",", dtype=np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--header", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    args = parser.parse_args()
    text = args.header.read_text()
    base = weights(text, "NN_BASELINE")
    hidden = int(re.search(r"NN_HIDDEN\s*=\s*(\d+)", text).group(1))
    symmetric = "#define NN_SYMMETRIC 1" in text
    w2 = weights(text, "NN_W2")
    rows = np.fromfile(args.validation, dtype="<f4").reshape(-1, 162)
    x = rows[:512, :160].copy()
    if symmetric:
        signed = np.concatenate((x[:, :140], x[:, 157:158]), axis=1)
        public = np.concatenate((x[:, 140:157], x[:, 158:159] + x[:, 159:160]), axis=1)
        if "#define NN_TRANSPOSED 1" in text:
            difference = signed @ weights(text, "NN_W_DIFF").reshape(141, hidden)
            context = public @ weights(text, "NN_W_PUBLIC").reshape(18, hidden)
        else:
            difference = signed @ weights(text, "NN_W_DIFF").reshape(hidden, 141).T
            context = public @ weights(text, "NN_W_PUBLIC").reshape(hidden, 18).T
        context += weights(text, "NN_B_PUBLIC")
        correction = (np.maximum(context + difference, 0) -
                      np.maximum(context - difference, 0)) @ w2
        expected = np.tanh(x @ base + correction)
    else:
        w1 = weights(text, "NN_W1").reshape(hidden, 160)
        b1 = weights(text, "NN_B1")
        b2 = weights(text, "NN_B2")[0]
        expected = np.tanh(x @ base + np.maximum(x @ w1.T + b1, 0) @ w2 + b2)
    result = subprocess.run([str(args.binary)], input=x.tobytes(),
                            capture_output=True, check=True)
    actual = np.fromstring(result.stdout.decode(), sep=" ")
    if len(actual) != len(expected):
        raise ValueError("C++ inference returned the wrong number of values")
    error = float(np.max(np.abs(actual - expected)))
    print(f"C++/NumPy FP32 max absolute difference: {error:.9g}")
    if error > 1e-5:
        raise ValueError("Neural export and C++ inference disagree")
    if symmetric:
        swapped = x.copy()
        swapped[:, :140] *= -1
        swapped[:, 157] *= -1
        swapped[:, [158, 159]] = swapped[:, [159, 158]]
        reverse = subprocess.run([str(args.binary)], input=swapped.tobytes(),
                                 capture_output=True, check=True)
        opposite = np.fromstring(reverse.stdout.decode(), sep=" ")
        symmetry_error = float(np.max(np.abs(actual + opposite)))
        print(f"Player-swap antisymmetry max absolute difference: {symmetry_error:.9g}")
        if symmetry_error > 1e-5:
            raise ValueError("Symmetric network changed value after player swap")


if __name__ == "__main__":
    main()
