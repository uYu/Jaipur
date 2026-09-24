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


class Tracker:
    def __init__(self, directory):
        import swanlab
        self.sdk = swanlab
        self.directory = Path(directory)
        self.games = self.samples = self.seconds = 0
        self.best = float('-inf')
        self.best_version = 0
        mode = os.environ.get('SWANLAB_MODE', 'online')
        if mode == 'cloud':
            mode = 'online'
        if mode == 'online':
            key = os.environ.get('SWANLAB_API_KEY')
            if not key:
                raise ValueError('SWANLAB_API_KEY is required for cloud tracking')
            swanlab.login(api_key=key, save=False)
        self.run = swanlab.init(
            project=os.environ.get('SWANLAB_PROJECT', 'jaipur-dmc'),
            name=os.environ.get('SWANLAB_EXPERIMENT_NAME', self.directory.name),
            public=False,
            config=json.loads((self.directory / 'config.json').read_text()),
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
        self.info = {'project': os.environ.get('SWANLAB_PROJECT', 'jaipur-dmc'),
                     'url': self.run.url if mode == 'online' else None, 'mode': mode}
        (self.directory / 'swanlab-run.json').write_text(json.dumps(self.info, indent=2) + '\n')

    def record(self, row):
        step = row['iteration']
        metrics = {'train/version': row['version']}
        for source, target in [('mse', 'train/mse'), ('epsilon', 'train/epsilon'),
                               ('samples', 'train/batch_samples'), ('completed', 'selfplay/completed'),
                               ('truncated', 'selfplay/truncated'), ('totalTurns', 'selfplay/turns'),
                               ('elapsedSeconds', 'time/iteration_seconds')]:
            if source in row:
                metrics[target] = row[source]
        self.games += row.get('completed', 0)
        self.samples += row.get('samples', 0)
        self.seconds += row.get('elapsedSeconds', 0)
        metrics.update({'selfplay/cumulative_matches': self.games,
                        'train/cumulative_samples': self.samples,
                        'time/cumulative_iteration_seconds': self.seconds})
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
        metrics['selection/promoted'] = 0
        self.sdk.log(metrics, step=step)

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
        self.sdk.finish(state='crashed' if failed else 'success')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory')
    parser.add_argument('--backfill', action='store_true')
    args = parser.parse_args()
    tracker = None
    failed = False
    try:
        with contextlib.redirect_stdout(sys.stderr):
            tracker = Tracker(args.directory)
        print(json.dumps({'ready': True, **tracker.info}), flush=True)
        if args.backfill:
            with contextlib.redirect_stdout(sys.stderr):
                for line in (Path(args.directory) / 'training.jsonl').read_text().splitlines():
                    tracker.record(json.loads(line))
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
