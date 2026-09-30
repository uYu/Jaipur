"""Create a reproducible, randomly initialized policy/value checkpoint."""

import argparse
import json
from pathlib import Path
import torch
from belief_model import networks, parameter_count, save_weights_header

p = argparse.ArgumentParser()
p.add_argument('directory', type=Path)
p.add_argument('--hidden', type=int, required=True)
p.add_argument('--seed', type=int, default=240930)
a = p.parse_args()
torch.manual_seed(a.seed)
policy, value = networks(a.hidden)
a.directory.mkdir(parents=True, exist_ok=False)
torch.save({'policy': policy.state_dict(), 'value': value.state_dict()}, a.directory / 'model.pt')
save_weights_header(a.directory / 'weights.hpp', policy, value)
metadata = {'initialization': 'random', 'seed': a.seed, 'hidden': a.hidden,
            'parameters': parameter_count(a.hidden), 'training_positions': 0}
(a.directory / 'metadata.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(metadata), flush=True)
