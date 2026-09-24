"""Upload verified hybrid ablations; credentials are read only from the environment."""
import json
import os
from pathlib import Path
import sys
import swanlab

directory = Path(sys.argv[1])
data = json.loads((directory / 'evaluation-summary.json').read_text())
swanlab.login(api_key=os.environ['SWANLAB_API_KEY'], save=False)
run = swanlab.init(
    project='jaipur-dmc', name=directory.name, public=False,
    description='Frozen DMC root priors in existing MCTS. Paired complete-match ablations; no training and no promotion.',
    config={**{key: value for key, value in data.items() if key != 'results'},
            'comparison': data['results'][0].get('comparison', 'equal-time'),
            'simulations_per_decision': {r['name']: r.get('simulationsPerDecision') for r in data['results']}},
    log_dir=str(directory / 'swanlab'),
    settings=swanlab.Settings(interactive=False,
        probe={'git': False, 'runtime': False, 'requirements': False,
               'hardware': False, 'monitor': False, 'swanlab': False},
        terminal={'proxy_type': 'none'}),
)
try:
    metrics = {}
    for result in data['results']:
        prefix = result['name']
        wins, losses = result['wins']
        metrics.update({f'{prefix}/wins': wins, f'{prefix}/losses': losses,
                        f'{prefix}/matches': wins + losses,
                        f'{prefix}/win_rate': wins / (wins + losses),
                        f'{prefix}/candidate_ms': result['meanWallMs'][0],
                        f'{prefix}/baseline_ms': result['meanWallMs'][1],
                        f'{prefix}/candidate_max_ms': result['maxWallMs'][0],
                        f'{prefix}/baseline_max_ms': result['maxWallMs'][1],
                        f'{prefix}/verified': int(result['verified'])})
    swanlab.log(metrics, step=0)
    (directory / 'swanlab-run.json').write_text(json.dumps({'url': run.url}, indent=2) + '\n')
except Exception:
    swanlab.finish(state='crashed')
    raise
else:
    swanlab.finish()
