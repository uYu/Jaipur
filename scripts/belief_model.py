"""Shared checkpoint and C++ weight export for observable-belief networks."""

from pathlib import Path
from torch import nn


def networks(hidden: int):
    if hidden < 1:
        raise ValueError('hidden must be positive')
    policy = nn.Sequential(nn.Linear(166, hidden), nn.ReLU(), nn.Linear(hidden, 1))
    value = nn.Sequential(nn.Linear(142, hidden), nn.ReLU(), nn.Linear(hidden, 1))
    return policy, value


def save_weights_header(path: Path, policy: nn.Module, value: nn.Module):
    hidden = policy[0].out_features
    lines = ['// Public-belief policy and match-value network.',
             f'constexpr int BELIEF_HIDDEN = {hidden};']
    for name, model in [('POLICY', policy), ('VALUE', value)]:
        for suffix, tensor in [('W1', model[0].weight), ('B1', model[0].bias),
                               ('W2', model[2].weight), ('B2', model[2].bias)]:
            literals = []
            for v in tensor.detach().cpu().numpy().reshape(-1):
                s = f'{float(v):.9g}'
                if '.' not in s and 'e' not in s:
                    s += '.0'
                literals.append(s + 'f')
            lines.append(f'constexpr std::array<float, {len(literals)}> BELIEF_{name}_{suffix} = {{\n'
                         + ',\n'.join(literals) + '\n};')
    path.write_text('\n'.join(lines) + '\n')


def parameter_count(hidden: int):
    policy, value = networks(hidden)
    return sum(p.numel() for model in (policy, value) for p in model.parameters())
