"""Train public-belief action preferences against grouped search visit targets."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from torch import nn
from belief_model import networks, save_weights_header

p = argparse.ArgumentParser()
p.add_argument('train', type=Path)
p.add_argument('validation', type=Path)
p.add_argument('directory', type=Path)
p.add_argument('--train-extra', type=Path, nargs='*', default=[],
               help='Additional on-policy replay shards; avoids a merged training file')
p.add_argument('--expected-simulations', type=int,
               help='Validate search targets in on-policy replay shards')
p.add_argument('--epochs', type=int, default=40)
p.add_argument('--hidden', type=int, default=32)
p.add_argument('--value-weight', type=float, default=0.25)
p.add_argument('--init', type=Path)
p.add_argument('--learning-rate', type=float, default=0.002)
p.add_argument('--select-objective', choices=('policy', 'combined'), default='policy')
a = p.parse_args()
if a.hidden < 1 or a.value_weight < 0 or a.learning_rate <= 0:
    raise ValueError('Invalid model configuration')
torch.manual_seed(240924)
torch.set_num_threads(4)
rng = np.random.default_rng(240924)

def read(paths):
    groups = []
    seeds = set()
    outcomes = {}
    for path in paths:
        opener = gzip.open if path.suffix == '.gz' else open
        with opener(path, 'rt') as source:
            for line in source:
                r = json.loads(line)
                seeds.add(r['seed'])
                state = np.asarray(r['features'], dtype=np.float32)
                value_state = np.asarray(r.get('valueFeatures', r['features']), dtype=np.float32)
                actions = np.asarray([x['features'] for x in r['actions']], dtype=np.float32)
                policy = np.asarray([x['policy'] for x in r['actions']], dtype=np.float32)
                if state.shape != (142,) or value_state.shape != (142,) or actions.shape[1] != 24 or policy.sum() <= 0:
                    raise ValueError('Invalid feature dimensions or policy mass')
                if not np.isfinite(state).all() or not np.isfinite(value_state).all() or not np.isfinite(actions).all():
                    raise ValueError('Nonfinite features')
                if not np.allclose(state[90:138].reshape(6, 8).sum(axis=1), 1, atol=1e-5):
                    raise ValueError('Opponent marginals are not normalized')
                value_mask = float(r.get('valueMask', 1))
                policy_weight = float(r.get('policyWeight', 1))
                if value_mask not in (0, 1) or not np.isfinite(policy_weight) or policy_weight <= 0:
                    raise ValueError('Invalid training weights')
                if a.expected_simulations is not None:
                    expected_context = [r['round'] / 3, r['seals'][r['actor']] / 2,
                                        r['seals'][1 - r['actor']] / 2]
                    if (r['valueFeatures'][-3:] != expected_context or
                            r['outcome'] not in (0, 1) or
                            r['teacherSimulations'] != a.expected_simulations or
                            abs(sum(action['policy'] for action in r['actions']) - 1) > 1e-4):
                        raise ValueError('Invalid on-policy replay target')
                    key = (r['seed'], r['actor'])
                    if key in outcomes and outcomes[key] != r['outcome']:
                        raise ValueError('One player has inconsistent match outcomes')
                    outcomes[key] = r['outcome']
                x = np.concatenate([np.tile(state, (len(actions), 1)), actions], axis=1)
                groups.append((torch.from_numpy(x), torch.from_numpy(policy / policy.sum()),
                               torch.from_numpy(value_state), float(r['outcome']),
                               value_mask, policy_weight))
    if a.expected_simulations is not None:
        for seed, actor in outcomes:
            if ((seed, 1 - actor) in outcomes and
                    outcomes[seed, actor] + outcomes[seed, 1 - actor] != 1):
                raise ValueError('Match outcomes do not have opposite labels')
    return seeds, groups

train_paths = [a.train, *a.train_extra]
train_seeds, train = read(train_paths)
val_seeds, val = read([a.validation])
if train_seeds & val_seeds:
    raise ValueError('Train and validation seeds overlap')
policy, value = networks(a.hidden)
if a.init:
    initial = torch.load(a.init, weights_only=True)
    policy.load_state_dict(initial['policy'])
    value.load_state_dict(initial['value'])
optimizer = torch.optim.AdamW(list(policy.parameters()) + list(value.parameters()),
                              lr=a.learning_rate, weight_decay=0.001)

def batch(groups, ids, optimize=False):
    selected = [groups[int(i)] for i in ids]
    x = torch.cat([r[0] for r in selected])
    target = torch.cat([r[1] for r in selected])
    index = torch.repeat_interleave(torch.arange(len(selected)), torch.tensor([len(r[1]) for r in selected]))
    logits = policy(x).squeeze(-1)
    maximum = torch.full((len(selected),), -float('inf')).scatter_reduce(0, index, logits, reduce='amax')
    sums = torch.zeros(len(selected)).scatter_add(0, index, torch.exp(logits - maximum[index]))
    logp = logits - maximum[index] - torch.log(sums[index])
    group_ce = torch.zeros(len(selected)).scatter_add(0, index, -(target * logp))
    policy_weights = torch.tensor([r[5] for r in selected])
    ce = (group_ce * policy_weights).sum() / policy_weights.sum()
    states = torch.stack([r[2] for r in selected])
    outcomes = torch.tensor([r[3] for r in selected])
    value_masks = torch.tensor([r[4] for r in selected])
    prediction = value(states).squeeze(-1)
    value_errors = nn.functional.binary_cross_entropy_with_logits(prediction, outcomes, reduction='none')
    bce = (value_errors * value_masks).sum() / value_masks.sum().clamp(min=1)
    if optimize:
        optimizer.zero_grad(); (ce + a.value_weight * bce).backward(); optimizer.step()
    # Teacher visit mass captured by the model's top action is a ranking metric.
    captured = []; at = 0
    for r in selected:
        n = len(r[1]); captured.append(float(r[1][int(logits[at:at+n].argmax())])); at += n
    return float(ce.detach()), float(bce.detach()), float(np.mean(captured))

def evaluate(groups):
    result = np.zeros(3); count = 0
    with torch.no_grad():
        for at in range(0, len(groups), 32):
            ids = np.arange(at, min(at+32, len(groups)))
            result += np.asarray(batch(groups, ids)) * len(ids); count += len(ids)
    return (result / count).tolist()

a.directory.mkdir(parents=True, exist_ok=True)
best = float('inf'); best_epoch = 0; best_train = None
for epoch in range(a.epochs):
    ids = rng.permutation(len(train))
    train_sums = np.zeros(2)
    for at in range(0, len(ids), 32):
        selected = ids[at:at+32]
        ce, bce, _ = batch(train, selected, True)
        train_sums += np.asarray([ce, bce]) * len(selected)
    train_metrics = (train_sums / len(ids)).tolist()
    metrics = evaluate(val)
    selection = metrics[0] + (a.value_weight * metrics[1] if a.select_objective == 'combined' else 0)
    if selection < best:
        best = selection; best_epoch = epoch + 1; best_train = train_metrics
        torch.save({'policy': policy.state_dict(), 'value': value.state_dict()}, a.directory / 'model.pt')
    if (epoch+1) % 5 == 0: print(json.dumps({'epoch': epoch+1, 'validation': metrics}), flush=True)
checkpoint = torch.load(a.directory / 'model.pt', weights_only=True)
policy.load_state_dict(checkpoint['policy']); value.load_state_dict(checkpoint['value'])
save_weights_header(a.directory / 'weights.hpp', policy, value)
validation_metrics = evaluate(val)
def sha256_files(paths):
    digest = hashlib.sha256()
    for path in paths:
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
    return digest.hexdigest()

meta = {'train_positions': len(train), 'validation_positions': len(val), 'best_epoch': best_epoch,
        'training_batch_policy_ce_value_bce': best_train,
        'training_batch_loss': best_train[0] + a.value_weight * best_train[1],
        'validation_loss': validation_metrics[0] + a.value_weight * validation_metrics[1],
        'validation_cross_entropy_value_bce_top_visit_mass': validation_metrics,
        'train_sha256': sha256_files(train_paths),
        'validation_sha256': sha256_files([a.validation]),
        'features': {'state': 142, 'action': 24}, 'hidden': a.hidden,
        'value_weight': a.value_weight, 'init_checkpoint': str(a.init) if a.init else None,
        'learning_rate': a.learning_rate, 'select_objective': a.select_objective,
        'promotion': 'Requires paired full matches at equal search count; validation CE is diagnostic only.'}
(a.directory / 'metadata.json').write_text(json.dumps(meta, indent=2) + '\n')
print(json.dumps(meta), flush=True)
