"""Combine fixed-teacher replay with on-policy match-labelled replay."""
import argparse
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('directory', type=Path)
p.add_argument('--base-policy', type=Path)
p.add_argument('--train', type=Path, nargs='+', required=True)
p.add_argument('--validation', type=Path, nargs='+', required=True)
p.add_argument('--new-policy-weight', type=float, default=3.0)
p.add_argument('--expected-simulations', type=int, default=1024)
a = p.parse_args()
if a.new_policy_weight <= 0 or a.expected_simulations < 1:
    raise ValueError('Invalid policy weight or simulation count')

def read(paths):
    return [json.loads(line) for path in paths for line in path.read_text().splitlines()]

base = read([a.base_policy]) if a.base_policy else []
train = read(a.train)
validation = read(a.validation)
base_seeds = {row['seed'] for row in base}
train_seeds = {row['seed'] for row in train}
validation_seeds = {row['seed'] for row in validation}
if base_seeds & train_seeds or base_seeds & validation_seeds or train_seeds & validation_seeds:
    raise ValueError('Train and validation seeds must be disjoint')
for row in train + validation:
    if len(row['features']) != 142 or len(row['valueFeatures']) != 142:
        raise ValueError('Missing match-context value features')
    expected_context = [row['round'] / 3, row['seals'][row['actor']] / 2,
                        row['seals'][1 - row['actor']] / 2]
    if row['valueFeatures'][-3:] != expected_context:
        raise ValueError('Value input has incorrect match context')
    if row['outcome'] not in (0, 1) or row['teacherSimulations'] != a.expected_simulations:
        raise ValueError('Invalid self-play label')
    if abs(sum(action['policy'] for action in row['actions']) - 1) > 1e-4:
        raise ValueError('Invalid search distribution')
    row['valueMask'] = 1
    row['policyWeight'] = a.new_policy_weight
for rows in (train, validation):
    outcomes = {}
    for row in rows:
        key = (row['seed'], row['actor'])
        if key in outcomes and outcomes[key] != row['outcome']:
            raise ValueError('One player has inconsistent match outcomes')
        outcomes[key] = row['outcome']
    for seed, actor in outcomes:
        if (seed, 1 - actor) in outcomes and outcomes[seed, actor] + outcomes[seed, 1 - actor] != 1:
            raise ValueError('Match outcomes do not have opposite labels')
for row in base:
    row['valueMask'] = 0  # Base targets are round outcomes, not match outcomes.
    row['policyWeight'] = 1
for row in validation:
    row['policyWeight'] = 1
a.directory.mkdir(parents=True, exist_ok=True)
for name, rows in [('train', base + train), ('validation', validation)]:
    with (a.directory / f'{name}.jsonl').open('w') as file:
        for row in rows:
            file.write(json.dumps(row, separators=(',', ':')) + '\n')
summary = {'basePositions': len(base), 'onPolicyTrainPositions': len(train),
           'validationPositions': len(validation), 'baseSeeds': len(base_seeds),
           'onPolicyTrainSeeds': len(train_seeds), 'validationSeeds': len(validation_seeds),
           'newPolicyWeight': a.new_policy_weight,
           'expectedSimulations': a.expected_simulations}
(a.directory / 'data-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary))
