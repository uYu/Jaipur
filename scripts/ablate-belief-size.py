"""Fast fixed-data width comparison; no self-play or MCTS arena is run."""

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
import numpy as np
import torch
from belief_model import networks, parameter_count

ROOT = Path(__file__).resolve().parents[1]

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--train-data', type=Path, required=True)
p.add_argument('--validation-data', type=Path, required=True)
p.add_argument('--directory', type=Path, required=True)
p.add_argument('--widths', type=int, nargs='+', default=[16, 64, 256])
p.add_argument('--epochs', type=int, default=12)
p.add_argument('--learning-rate', type=float, default=0.0002)
p.add_argument('--select-objective', choices=('policy', 'combined'), default='policy')
a = p.parse_args()
if (len(set(a.widths)) != len(a.widths) or any(width < 1 for width in a.widths)
        or a.epochs < 1 or a.learning_rate <= 0):
    p.error('Invalid widths, epochs or learning rate')
for path in (a.train_data, a.validation_data):
    if not path.is_file():
        p.error(f'Missing data: {path}')
directory = a.directory.resolve()
directory.mkdir(parents=True, exist_ok=False)
(directory / 'settings.json').write_text(json.dumps({
    'trainData': str(a.train_data.resolve()),
    'validationData': str(a.validation_data.resolve()),
    'widths': a.widths, 'epochs': a.epochs,
    'learningRate': a.learning_rate,
    'selectObjective': a.select_objective}, indent=2) + '\n')

# Every width sees the same held-out search targets. Pure network timing
# excludes Python JSON parsing and feature construction.
torch.set_num_threads(1)
rng = np.random.default_rng(240930)
input_batch = torch.from_numpy(rng.standard_normal((4096, 166)).astype('float32'))
results = []
for width in a.widths:
    model_dir = directory / f'width-{width}'
    log = directory / f'width-{width}-train.log'
    started = time.monotonic()
    with log.open('w') as output:
        subprocess.run([sys.executable, str(ROOT / 'scripts/train-belief-policy.py'),
                        str(a.train_data), str(a.validation_data), str(model_dir),
                        '--hidden', str(width), '--epochs', str(a.epochs),
                        '--learning-rate', str(a.learning_rate), '--value-weight', '0.5',
                        '--select-objective', a.select_objective],
                       cwd=ROOT, stdout=output, stderr=subprocess.STDOUT, check=True)
    train_seconds = time.monotonic() - started
    evaluation = subprocess.run(
        [sys.executable, str(ROOT / 'scripts/evaluate-belief-policy.py'),
         str(model_dir / 'model.pt'), str(a.validation_data),
         '--exclude', str(a.train_data)],
        cwd=ROOT, text=True, capture_output=True, check=True)
    metrics = json.loads(evaluation.stdout)
    policy, _ = networks(width)
    checkpoint = torch.load(model_dir / 'model.pt', weights_only=True)
    policy.load_state_dict(checkpoint['policy'])
    with torch.no_grad():
        for _ in range(3):
            policy(input_batch)
        timings = []
        for _ in range(10):
            start = time.perf_counter()
            policy(input_batch)
            timings.append((time.perf_counter() - start) * 1000 / 4096)
    result = {'hidden': width, 'parameters': parameter_count(width),
              'trainingSeconds': train_seconds,
              'validationPositions': metrics['positions'],
              'policyCrossEntropy': metrics['policy_cross_entropy'],
              'uniformCrossEntropy': metrics['uniform_cross_entropy'],
              'valueBce': metrics['value_bce'],
              'topActionAgreement': metrics['teacher_top_agreement'],
              'medianForwardMsPerAction': float(np.median(timings)),
              'checkpointBytes': (model_dir / 'model.pt').stat().st_size,
              'bestEpoch': json.loads((model_dir / 'metadata.json').read_text())['best_epoch']}
    results.append(result)
    (directory / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(result), flush=True)
