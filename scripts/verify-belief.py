import argparse
import json
import subprocess
from pathlib import Path
import numpy as np
import torch
from torch import nn

p = argparse.ArgumentParser()
p.add_argument('model', type=Path)
p.add_argument('data', type=Path)
p.add_argument('binary', type=Path)
a = p.parse_args()
checkpoint = torch.load(a.model, weights_only=True)
hidden = checkpoint['policy']['0.weight'].shape[0]
policy = nn.Sequential(nn.Linear(166, hidden), nn.ReLU(), nn.Linear(hidden, 1))
value = nn.Sequential(nn.Linear(142, hidden), nn.ReLU(), nn.Linear(hidden, 1))
policy.load_state_dict(checkpoint['policy']); value.load_state_dict(checkpoint['value'])
rows = []
for line in a.data.read_text().splitlines()[:200]:
    record = json.loads(line)
    for action in record['actions'][:3]: rows.append(record['features'] + action['features'])
x = np.asarray(rows, dtype=np.float32)
with torch.no_grad():
    expected = np.column_stack([policy(torch.from_numpy(x)).numpy().ravel(),
                                value(torch.from_numpy(x[:, :142])).numpy().ravel()])
text = '\n'.join(' '.join(f'{float(v):.9g}' for v in row) for row in x) + '\n'
actual = np.loadtxt(subprocess.run([str(a.binary)], input=text, text=True, capture_output=True, check=True).stdout.splitlines())
error = float(np.max(np.abs(expected-actual)))
assert error < 1e-5, error
print(json.dumps({'rows': len(rows), 'max_absolute_error': error}))
