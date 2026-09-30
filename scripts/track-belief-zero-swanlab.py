"""Backfill and follow aggregate belief-zero generations in SwanLab.

Training writes run.json atomically. This separate process can be restarted
without interrupting self-play and does not upload game records or checkpoints.
"""

import argparse
import json
import os
from pathlib import Path
import time

ROUND_CATEGORIES = ('take_goods', 'take_camels', 'trade', 'sell_actions')
BASELINE_PATH = Path(__file__).resolve().parents[1] / 'data/human-elo1600-action-baseline.json'


def round_values(row):
    """Aggregate completed training matches into one-player, one-round means."""
    train = [item for item in row['selfplay'] if item['output'] != row['validation']]
    if not train or any('roundMetrics' not in item for item in train):
        return None  # Older shards have no scores and may already be pruned.
    player_rounds = sum(item['roundMetrics']['playerRounds'] for item in train)
    score_sum = sum(item['roundMetrics']['scoreSum'] for item in train)
    goods_sold = sum(item['roundMetrics']['goodsSold'] for item in train)
    counts = {name: sum(item['roundMetrics']['actionCounts'][name] for item in train)
              for name in ROUND_CATEGORIES}
    total_actions = sum(counts.values())
    completed = sum(item['completed'] for item in train)
    if (player_rounds < 2 * completed or player_rounds > 6 * completed or
            player_rounds % 2 or total_actions <= 0 or
            total_actions != sum(item['positions'] for item in train)):
        raise ValueError(f'Generation {row["generation"]} has inconsistent round metrics')
    values = {
        **{f'{name}_per_player_round': counts[name] / player_rounds
           for name in ROUND_CATEGORIES},
        **{f'{name}_share': counts[name] / total_actions
           for name in ROUND_CATEGORIES},
        'goods_sold_per_player_round': goods_sold / player_rounds,
        'all_actions_per_player_round': total_actions / player_rounds,
        'round_score_mean': score_sum / player_rounds,
    }
    if counts['sell_actions']:
        values['goods_per_sale'] = goods_sold / counts['sell_actions']
    return values


def human_references(baseline):
    return {
        **{f'{name}_per_player_round': baseline['per_player_round_mean'][name]
           for name in ROUND_CATEGORIES},
        **{f'{name}_share': baseline['action_share'][name]
           for name in ROUND_CATEGORIES},
        'goods_sold_per_player_round': baseline['per_player_round_mean']['goods_sold'],
        'goods_per_sale': baseline['goods_per_sale'],
        'all_actions_per_player_round': baseline['per_player_round_mean']['total'],
        'round_score_mean': baseline['per_player_round_mean']['score'],
    }


def comparison_charts(swanlab, baseline, generations):
    """Plot recent AI generations against flat 1600+ human reference lines."""
    import pyecharts.options as opts
    points = [(row['generation'], values) for row in generations[-500:]
              if (values := round_values(row)) is not None]
    charts = {}
    for name, reference in human_references(baseline).items():
        series = [(generation, values[name]) for generation, values in points
                  if name in values]
        if not series:
            continue
        chart = swanlab.echarts.Line()
        chart.add_xaxis([str(generation) for generation, _ in series])
        chart.add_yaxis('AI self-play', [value for _, value in series],
                        is_symbol_show=False)
        chart.add_yaxis('Human Elo 1600+', [reference] * len(series),
                        is_symbol_show=False,
                        linestyle_opts=opts.LineStyleOpts(type_='dashed', width=2))
        chart.set_global_opts(
            title_opts=opts.TitleOpts(title=name.replace('_', ' ')),
            xaxis_opts=opts.AxisOpts(name='generation'),
            yaxis_opts=opts.AxisOpts(name=(
                'proportion' if name.endswith('_share') else
                'score' if name == 'round_score_mean' else
                'cards per sale' if name == 'goods_per_sale' else
                'cards per player-round' if name == 'goods_sold_per_player_round' else
                'actions per player-round')),
        )
        charts[f'human1600_comparison/{name}'] = chart
    return charts


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
    meta = row.get('training') or json.loads(
        (directory / row['candidate'] / 'metadata.json').read_text())
    ce, bce, top_mass = meta['validation_cross_entropy_value_bce_top_visit_mass']
    metrics = {
        'train/positions': meta['train_positions'],
        'train/best_epoch': meta['best_epoch'],
        'validation/loss': meta.get('validation_loss', ce + meta['value_weight'] * bce),
        'validation/policy_cross_entropy': ce,
        'validation/value_bce': bce,
        'validation/top_action_visit_mass': top_mass,
        'selfplay/train_positions': sum(item['positions'] for item in train),
        'selfplay/validation_positions': heldout[0]['positions'],
        'selection/champion_generation': model_generation(row['champion']),
    }
    if meta.get('training_batch_policy_ce_value_bce'):
        train_ce, train_bce = meta['training_batch_policy_ce_value_bce']
        metrics.update({
            'train/loss': meta['training_batch_loss'],
            'train/policy_cross_entropy': train_ce,
            'train/value_bce': train_bce,
        })
    values = round_values(row)
    if values:
        metrics.update({f'selfplay/{name}': value for name, value in values.items()})
    truncated = sum(item['truncated'] for item in row['selfplay'])
    if truncated:
        metrics['selfplay/truncated'] = truncated
    for name, seconds in row.get('timings', {}).items():
        metrics[f'time/{name}'] = seconds
    if row.get('gate'):
        gate = row['gate']
        matches = gate['candidateWins'] + gate['baselineWins']
        metrics.update({
            'gate/promoted': int(row['promoted']),
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
    parser.add_argument('--heartbeat-seconds', type=float, default=300,
                        help='Upload a heartbeat while waiting for a generation (default: 5 minutes)')
    parser.add_argument('--mode', choices=('online', 'offline'), default='online')
    parser.add_argument('--chart-every', type=int, default=10,
                        help='Update 1600+ human comparison charts every N generations')
    args = parser.parse_args()
    if args.poll_seconds <= 0:
        parser.error('--poll-seconds must be positive')
    if args.heartbeat_seconds <= 0:
        parser.error('--heartbeat-seconds must be positive')
    if args.chart_every <= 0:
        parser.error('--chart-every must be positive')
    directory = args.directory.resolve()
    manifest_path = directory / 'run.json'
    while not manifest_path.is_file():
        if not args.follow:
            parser.error(f'No run.json in {directory}')
        time.sleep(args.poll_seconds)
    manifest = read_manifest(manifest_path)
    baseline = json.loads(BASELINE_PATH.read_text())
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
        last_upload = time.monotonic()
        if args.follow:
            # SwanLab marks a run interrupted after 30 minutes without uploads.
            # This metric has its own automatic step, independent of generations.
            swanlab.log({'monitor/heartbeat_unix': time.time()})
            last_upload = time.monotonic()
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
                if round_values(row) and (expected % args.chart_every == 0 or
                        not any(round_values(previous) for previous in generations[:expected - 1])):
                    swanlab.log(comparison_charts(swanlab, baseline, generations[:expected]),
                                step=expected)
                state['last_generation'] = expected
                save_state(state_path, state)
                print(json.dumps({'uploaded_generation': expected}), flush=True)
                last_upload = time.monotonic()
            if len(generations) >= manifest['settings']['generations']:
                state['status'] = 'complete'
                break
            if not args.follow:
                state['status'] = 'paused'
                break
            if time.monotonic() - last_upload >= args.heartbeat_seconds:
                swanlab.log({'monitor/heartbeat_unix': time.time()})
                last_upload = time.monotonic()
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
