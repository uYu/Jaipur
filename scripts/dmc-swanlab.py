"""SwanLab tracking for DMC: JSON-lines live protocol or historical backfill.

Only explicit config and aggregate metrics are uploaded. Credentials come from
SWANLAB_API_KEY; SDK console output is redirected off the JSON protocol.
"""
import argparse
import contextlib
import json
import os
from pathlib import Path
import sys
import time

ROUND_CATEGORIES = ('take_goods', 'take_camels', 'trade', 'sell_actions')
BASELINE_PATH = Path(__file__).resolve().parents[1] / 'data/human-elo1600-action-baseline.json'
ACTION_CHART_NAMES = {
    'take_goods_share': 'action_take_rate',
    'take_camels_share': 'action_camels_rate',
    'trade_share': 'action_exchange_rate',
    'sell_actions_share': 'action_sell_rate',
}


class Tracker:
    def __init__(self, directory):
        # SwanLab's SDK also reads SWANLAB_PROJECT as a structured setting.
        # Consume our legacy scalar option before the SDK initializes settings.
        legacy_project = os.environ.pop('SWANLAB_PROJECT', None)
        project = os.environ.pop('JAIPUR_SWANLAB_PROJECT', None) or legacy_project or 'jaipur-dmc'
        legacy_name = os.environ.pop('SWANLAB_EXPERIMENT_NAME', None)
        experiment_name = os.environ.pop('JAIPUR_SWANLAB_EXPERIMENT_NAME', None) or legacy_name
        import swanlab
        self.sdk = swanlab
        self.directory = Path(directory)
        self.games = self.samples = self.seconds = 0
        self.best = float('-inf')
        self.best_version = 0
        self.baseline = json.loads(BASELINE_PATH.read_text())
        self.comparison_series = {}
        self.last_step = self.last_chart_step = 0
        self.chart_every = int(os.environ.get('JAIPUR_SWANLAB_CHART_EVERY', '25'))
        if self.chart_every < 1:
            raise ValueError('JAIPUR_SWANLAB_CHART_EVERY must be positive')
        mode = os.environ.get('SWANLAB_MODE', 'online')
        if mode == 'cloud':
            mode = 'online'
        if mode == 'online':
            key = os.environ.get('SWANLAB_API_KEY')
            if not key:
                raise ValueError('SWANLAB_API_KEY is required for cloud tracking')
            swanlab.login(api_key=key, save=False)
        config = json.loads((self.directory / 'config.json').read_text())
        self.hierarchical = config.get('actionSpace', '').startswith(
            'full-set sales; choose kind')
        self.run = swanlab.init(
            project=project,
            name=experiment_name or self.directory.name,
            public=False,
            config=config,
            description='DouZero-inspired DMC; complete match returns; public observations only. Model selection uses paired development matches, not training MSE.',
            mode=mode,
            log_dir=str(self.directory / 'swanlab'),
            settings=swanlab.Settings(
                interactive=False,
                probe={'git': False, 'runtime': False, 'requirements': False,
                       'hardware': False, 'monitor': False, 'swanlab': False},
                terminal={'proxy_type': 'none'},
            ),
        )
        self.info = {'project': project,
                     'url': self.run.url if mode == 'online' else None, 'mode': mode}
        (self.directory / 'swanlab-run.json').write_text(json.dumps(self.info, indent=2) + '\n')
        # New project Views show the two-series comparison charts in selfplay.
        # Scalar values remain available for exports without duplicate charts.
        self.sdk.define_metric('human1600_comparison/*', section_name='selfplay')
        for name in self.comparison_references():
            self.sdk.define_metric(f'selfplay/{name}', hidden=True)
        for name in ACTION_CHART_NAMES.values():
            self.sdk.define_metric(f'selfplay/{name}', hidden=True)

    def record(self, row):
        step = row['iteration']
        self.last_step = step
        metrics = {'train/version': row['version']}
        for source, target in [('epsilon', 'train/epsilon'),
                               ('samples', 'train/batch_samples'),
                               ('elapsedSeconds', 'time/iteration_seconds')]:
            if source in row:
                metrics[target] = row[source]
        if 'mse' in row:
            metrics['train/loss' if self.hierarchical else 'train/mse'] = row['mse']
        for source, target in [('loss', 'train/loss'),
                               ('kindMse', 'train/kind_mse'),
                               ('targetMse', 'train/exchange_target_mse'),
                               ('actionMse', 'train/action_mse')]:
            if row.get(source) is not None:
                metrics[target] = row[source]
        # Completed matches provide both the action samples and the number of
        # finished rounds; truncated matches contribute to neither quantity.
        if row.get('rounds') and 'samples' in row:
            metrics['selfplay/avg_round_turns'] = row['samples'] / row['rounds']
        self.games += row.get('completed', 0)
        self.samples += row.get('samples', 0)
        self.seconds += row.get('elapsedSeconds', 0)
        metrics.update({'selfplay/cumulative_matches': self.games,
                        'train/cumulative_samples': self.samples,
                        'time/cumulative_iteration_seconds': self.seconds})
        if 'actionCounts' in row and row.get('samples'):
            for action, count in row['actionCounts'].items():
                metrics[f'selfplay/action_{action}_rate'] = count / row['samples']
        round_metrics = row.get('roundMetrics')
        if round_metrics:
            player_rounds = round_metrics['playerRounds']
            counts = round_metrics['actionCounts']
            total_actions = sum(counts[name] for name in ROUND_CATEGORIES)
            if (player_rounds != 2 * row['rounds'] or
                    total_actions != row['samples'] or player_rounds <= 0):
                raise ValueError('Completed-round statistics disagree with training batch')
            values = {
                **{f'{name}_per_player_round': counts[name] / player_rounds
                   for name in ROUND_CATEGORIES},
                **{f'{name}_share': counts[name] / total_actions
                   for name in ROUND_CATEGORIES},
                'goods_sold_per_player_round': round_metrics['goodsSold'] / player_rounds,
                'all_actions_per_player_round': total_actions / player_rounds,
                'round_score_mean': round_metrics['scoreSum'] / player_rounds,
            }
            if counts['sell_actions']:
                values['goods_per_sale'] = round_metrics['goodsSold'] / counts['sell_actions']
            for name, value in values.items():
                metrics[f'selfplay/{name}'] = value
                series = self.comparison_series.setdefault(name, [])
                series.append((step, value))
                if len(series) > 500:
                    del series[:-500]
        if 'arena' in row and row['arena'] is not None:
            arena = row['arena']
            wins, losses = arena['wins']
            truncated = arena['truncated']
            metrics.update({'dev/wins': wins, 'dev/losses': losses,
                            'dev/truncated': truncated,
                            'dev/win_rate': wins / arena['matches']})
            score = wins - losses - truncated
            if score > self.best:
                self.best, self.best_version = score, row['version']
        metrics['selection/best_version'] = self.best_version
        if row.get('mcts'):
            result = row['mcts']
            wins, losses = result['wins']
            metrics.update({
                'mcts/model_wins': wins,
                'mcts/baseline_wins': losses,
                'mcts/matches': result['matches'],
                'mcts/model_win_rate': wins / result['matches'],
                'mcts/model_version': result['version'],
                'mcts/simulations_per_tree': result['fixedIterationsPerTree'],
                'time/mcts_seconds': result['elapsedSeconds'],
            })
        if 'mcts' in row or 'mctsError' in row:
            metrics['mcts/evaluation_failed'] = int('mctsError' in row)
        metrics['selection/promoted'] = 0
        self.sdk.log(metrics, step=step)
        if round_metrics and step > 0 and (step == 1 or step % self.chart_every == 0):
            self.comparison_charts(step)

    def comparison_references(self):
        return {
            **{f'{name}_per_player_round': self.baseline['per_player_round_mean'][name]
               for name in ROUND_CATEGORIES},
            **{f'{name}_share': self.baseline['action_share'][name]
               for name in ROUND_CATEGORIES},
            'goods_sold_per_player_round': self.baseline['per_player_round_mean']['goods_sold'],
            'goods_per_sale': self.baseline['goods_per_sale'],
            'all_actions_per_player_round': self.baseline['per_player_round_mean']['total'],
            'round_score_mean': self.baseline['per_player_round_mean']['score'],
        }
    def comparison_charts(self, step):
        """Two series in each chart make the expert reference a horizontal line."""
        import pyecharts.options as opts
        charts = {}
        references = self.comparison_references()
        for name, reference in references.items():
            if name not in self.comparison_series:
                continue
            points = self.comparison_series[name]
            chart = self.sdk.echarts.Line()
            chart.add_xaxis([str(iteration) for iteration, _ in points])
            chart.add_yaxis('AI self-play', [value for _, value in points],
                            is_symbol_show=False)
            chart.add_yaxis('Human Elo 1600+', [reference] * len(points),
                            is_symbol_show=False,
                            linestyle_opts=opts.LineStyleOpts(type_='dashed', width=2))
            chart.set_global_opts(
                title_opts=opts.TitleOpts(title=name.replace('_', ' ')),
                xaxis_opts=opts.AxisOpts(name='iteration'),
                yaxis_opts=opts.AxisOpts(name=(
                    'proportion' if name.endswith('_share') else
                    'score' if name == 'round_score_mean' else
                    'cards per sale' if name == 'goods_per_sale' else
                    'cards per player-round' if name == 'goods_sold_per_player_round' else
                    'actions per player-round')),
            )
            display_name = ACTION_CHART_NAMES.get(name, name)
            charts[f'human1600_comparison/{display_name}'] = chart
        self.sdk.log(charts, step=step)
        self.last_chart_step = step

    def evaluations(self):
        metrics = {}
        files = [('heldout-normal.json', 'heldout/normal'),
                 ('initial-normal.json', 'initial/normal'),
                 ('versus-initial.json', 'heldout/initial'),
                 ('versus-guided-1s-result.json', 'heldout/guided_1s'),
                 ('versus-guided-2s-result.json', 'heldout/guided_2s')]
        summaries = {}
        for filename, prefix in files:
            path = self.directory / filename
            if not path.exists():
                continue
            # Native benchmark emits per-match objects followed by its summary.
            remaining = path.read_text().strip()
            rows = []
            while remaining:
                row, end = json.JSONDecoder().raw_decode(remaining)
                rows.append(row)
                remaining = remaining[end:].lstrip()
            result = rows[-1]
            if 'wins' not in result:
                continue  # A still-running benchmark has no summary yet.
            summaries[prefix] = result
            wins, losses = result['wins']
            truncated = result.get('truncated', 0)
            metrics.update({f'{prefix}/wins': wins, f'{prefix}/losses': losses,
                            f'{prefix}/truncated': truncated,
                            f'{prefix}/matches': wins + losses + truncated,
                            f'{prefix}/win_rate': wins / max(1, wins + losses + truncated)})
            for key in ('meanWallMs', 'maxWallMs'):
                if key in result:
                    metrics[f'{prefix}/candidate_{key}'] = result[key][0]
                    metrics[f'{prefix}/opponent_{key}'] = result[key][1]
        if metrics:
            self.sdk.log(metrics)
        (self.directory / 'evaluation-summary.json').write_text(
            json.dumps({'evaluations': summaries, 'promoted': False}, indent=2) + '\n')

    def finish(self, failed=False):
        if self.comparison_series and self.last_step != self.last_chart_step:
            self.comparison_charts(self.last_step)
        self.sdk.finish(state='crashed' if failed else 'success')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory')
    parser.add_argument('--backfill', action='store_true')
    parser.add_argument('--follow', action='store_true',
                        help='Backfill training.jsonl, then stream new rows until completion.json exists')
    args = parser.parse_args()
    if args.backfill and args.follow:
        parser.error('--backfill and --follow are mutually exclusive')
    tracker = None
    failed = False
    try:
        with contextlib.redirect_stdout(sys.stderr):
            tracker = Tracker(args.directory)
        print(json.dumps({'ready': True, **tracker.info}), flush=True)
        if args.backfill or args.follow:
            directory = Path(args.directory)
            with (directory / 'training.jsonl').open() as source:
                while True:
                    line = source.readline()
                    if line:
                        with contextlib.redirect_stdout(sys.stderr):
                            tracker.record(json.loads(line))
                        continue
                    if not args.follow or (directory / 'completion.json').exists():
                        break
                    time.sleep(2)
            with contextlib.redirect_stdout(sys.stderr):
                tracker.evaluations()
        else:
            for line in sys.stdin:
                request = json.loads(line)
                if request.get('op') == 'evaluate':
                    with contextlib.redirect_stdout(sys.stderr):
                        tracker.evaluations()
                    print(json.dumps({'evaluated': True}), flush=True)
                    continue
                if request.get('op') == 'finish':
                    failed = request.get('failed', False)
                    print(json.dumps({'finished': True}), flush=True)
                    break
                with contextlib.redirect_stdout(sys.stderr):
                    tracker.record(request)
                print(json.dumps({'logged': request['iteration']}), flush=True)
    except Exception:
        if tracker:
            with contextlib.redirect_stdout(sys.stderr):
                tracker.finish(failed=True)
        raise
    else:
        with contextlib.redirect_stdout(sys.stderr):
            tracker.finish(failed=failed)


if __name__ == '__main__':
    main()
