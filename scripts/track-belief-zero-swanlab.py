"""Backfill and follow aggregate belief-zero generations in SwanLab.

Training writes run.json atomically. This separate process can be restarted
without interrupting self-play and does not upload game records or checkpoints.
"""

import argparse
import json
import os
from pathlib import Path
import time


def read_manifest(path):
    return json.loads(path.read_text()) if path.is_file() else None


def model_generation(name):
    return int(name.rsplit('-', 1)[1])


def generation_metrics(directory, row):
    generation = row['generation']
    validation = row['validation']
    train = [item for item in row['selfplay'] if item['output'] != validation]
    heldout = [item for item in row['selfplay'] if item['output'] == validation]
    if len(heldout) != 1:
        raise ValueError(f'Generation {generation} has no unique validation shard')
    meta = json.loads((directory / row['candidate'] / 'metadata.json').read_text())
    ce, bce, top_mass = meta['validation_cross_entropy_value_bce_top_visit_mass']
    metrics = {
        'train/generation': generation,
        'train/positions': meta['train_positions'],
        'train/validation_positions': meta['validation_positions'],
        'train/best_epoch': meta['best_epoch'],
        'validation/policy_cross_entropy': ce,
        'validation/value_bce': bce,
        'validation/top_action_visit_mass': top_mass,
        'selfplay/train_games': sum(item['completed'] for item in train),
        'selfplay/validation_games': heldout[0]['completed'],
        'selfplay/train_positions': sum(item['positions'] for item in train),
        'selfplay/validation_positions': heldout[0]['positions'],
        'selfplay/truncated': sum(item['truncated'] for item in row['selfplay']),
        'selection/actor_generation': model_generation(row['actor']),
        'selection/learner_init_generation': model_generation(
            row.get('learnerInit', row['actor'])),
        'selection/learner_generation': model_generation(row['candidate']),
        'selection/champion_generation': model_generation(row['champion']),
        'gate/evaluated': int(row.get('gate') is not None),
        'gate/promoted': int(row['promoted']),
    }
    for name, seconds in row.get('timings', {}).items():
        metrics[f'time/{name}'] = seconds
    if row.get('gate'):
        gate = row['gate']
        matches = gate['candidateWins'] + gate['baselineWins']
        metrics.update({
            'gate/candidate_wins': gate['candidateWins'],
            'gate/champion_wins': gate['baselineWins'],
            'gate/candidate_win_rate': gate['candidateWins'] / matches,
            'gate/matches': matches,
        })
    if row.get('originalMcts'):
        arena = row['originalMcts']
        matches = arena['candidateWins'] + arena['baselineWins']
        metrics.update({
            'mcts/champion_wins': arena['candidateWins'],
            'mcts/baseline_wins': arena['baselineWins'],
            'mcts/champion_win_rate': arena['candidateWins'] / matches,
            'mcts/matches': matches,
        })
    return metrics


def save_state(path, state):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--follow', action='store_true',
                        help='Wait for new generations until the configured target is reached')
    parser.add_argument('--poll-seconds', type=float, default=5)
    parser.add_argument('--mode', choices=('online', 'offline'), default='online')
    args = parser.parse_args()
    if args.poll_seconds <= 0:
        parser.error('--poll-seconds must be positive')
    directory = args.directory.resolve()
    manifest_path = directory / 'run.json'
    while not manifest_path.is_file():
        if not args.follow:
            parser.error(f'No run.json in {directory}')
        time.sleep(args.poll_seconds)
    manifest = read_manifest(manifest_path)
    state_path = directory / 'swanlab-run.json'
    state = json.loads(state_path.read_text()) if state_path.is_file() else None

    # The SwanLab SDK treats SWANLAB_PROJECT as a structured setting. Consume
    # the legacy scalar alias before it creates its Pydantic settings object.
    legacy_project = os.environ.pop('SWANLAB_PROJECT', None)
    project = os.environ.pop('JAIPUR_SWANLAB_PROJECT', None) or legacy_project or 'jaipur-belief-zero'
    if state and state['project'] != project:
        parser.error(f'Existing SwanLab run uses project {state["project"]}')
    if args.mode == 'online':
        key = os.environ.get('SWANLAB_API_KEY')
        if not key:
            parser.error('SWANLAB_API_KEY is required in online mode')
    import swanlab
    if args.mode == 'online':
        swanlab.login(api_key=key, save=False)
        del key
    run = swanlab.init(
        project=project,
        name=directory.name,
        public=False,
        description='From-random public-belief MCTS self-play; search-policy and match-value training; periodic incumbent and original-MCTS evaluation.',
        config=manifest['settings'],
        mode=args.mode,
        id=state['id'] if state else None,
        resume='must' if state else 'never',
        log_dir=str(directory / 'swanlab'),
        settings=swanlab.Settings(
            interactive=False,
            probe={'git': False, 'runtime': False, 'requirements': False,
                   'hardware': False, 'monitor': False, 'swanlab': False},
            terminal={'proxy_type': 'none'},
        ),
    )
    state = {'id': run.id, 'url': run.url if args.mode == 'online' else None,
             'project': project,
             'last_generation': state['last_generation'] if state else 0,
             'status': 'running'}
    save_state(state_path, state)
    print(json.dumps({'url': state['url'], 'last_generation': state['last_generation']}), flush=True)
    try:
        while True:
            manifest = read_manifest(manifest_path)
            generations = manifest['generations']
            if state['last_generation'] > len(generations):
                raise ValueError('SwanLab cursor is ahead of run.json')
            for row in generations[state['last_generation']:]:
                expected = state['last_generation'] + 1
                if row['generation'] != expected:
                    raise ValueError(f'Expected generation {expected}, found {row["generation"]}')
                swanlab.log(generation_metrics(directory, row), step=expected)
                state['last_generation'] = expected
                save_state(state_path, state)
                print(json.dumps({'uploaded_generation': expected}), flush=True)
            if len(generations) >= manifest['settings']['generations']:
                state['status'] = 'complete'
                break
            if not args.follow:
                state['status'] = 'paused'
                break
            time.sleep(args.poll_seconds)
    except Exception:
        state['status'] = 'crashed'
        save_state(state_path, state)
        swanlab.finish(state='crashed')
        raise
    else:
        swanlab.finish()
        save_state(state_path, state)


if __name__ == '__main__':
    main()
