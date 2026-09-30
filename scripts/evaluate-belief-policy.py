"""Held-out grouped policy diagnostics; no fitting or checkpoint selection."""
import argparse
import gzip
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn

p = argparse.ArgumentParser()
p.add_argument('model', type=Path)
p.add_argument('data', type=Path)
p.add_argument('--exclude', type=Path, action='append', default=[])
a = p.parse_args()
def records(path):
    text = gzip.decompress(path.read_bytes()).decode() if path.suffix == '.gz' else path.read_text()
    return [json.loads(line) for line in text.splitlines()]
rows = records(a.data)
if not rows: raise ValueError('Empty evaluation set')
seeds = {r['seed'] for r in rows}
for excluded in a.exclude:
    if seeds & {r['seed'] for r in records(excluded)}: raise ValueError('Evaluation seeds overlap excluded data')
torch.set_num_threads(1)
checkpoint = torch.load(a.model, weights_only=True)
hidden = checkpoint['policy']['0.weight'].shape[0]
policy = nn.Sequential(nn.Linear(166, hidden), nn.ReLU(), nn.Linear(hidden, 1))
value = nn.Sequential(nn.Linear(142, hidden), nn.ReLU(), nn.Linear(hidden, 1))
policy.load_state_dict(checkpoint['policy']); value.load_state_dict(checkpoint['value'])
results = []
with torch.no_grad():
    for r in rows:
        state = torch.tensor(r['features'], dtype=torch.float32)
        value_state = torch.tensor(r.get('valueFeatures', r['features']), dtype=torch.float32)
        actions = torch.tensor([x['features'] for x in r['actions']], dtype=torch.float32)
        targets = torch.tensor([x['policy'] for x in r['actions']], dtype=torch.float32); targets /= targets.sum()
        x = torch.cat([state.repeat(len(actions), 1), actions], dim=1)
        logits = policy(x).flatten()
        ce = -(targets * torch.log_softmax(logits, dim=0)).sum().item()
        bce = nn.functional.binary_cross_entropy_with_logits(value(value_state).flatten(), torch.tensor([float(r['outcome'])])).item()
        chosen = int(logits.argmax()); teacher = int(targets.argmax())
        results.append([ce, np.log(len(actions)), bce, float(targets[chosen]), float(targets[teacher]), float(chosen==teacher), float(actions[chosen, 2])])
metrics = np.mean(results, axis=0)
print(json.dumps(dict(zip(['policy_cross_entropy','uniform_cross_entropy','value_bce','model_top_teacher_mass','teacher_top_mass','teacher_top_agreement','model_sell_fraction'], metrics.tolist())) | {'positions':len(rows),'seeds':sorted(seeds)}, indent=2))
