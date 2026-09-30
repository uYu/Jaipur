"""Inspect or remove redundant belief-zero data while training is running.

Only generations already committed to run.json are eligible. The incomplete
generation and the train shards needed for the next replay window are kept.
"""

import argparse
import json
from pathlib import Path
import shutil


def disk_bytes(path):
    if path.is_file():
        return path.stat().st_size
    return sum(item.stat().st_size for item in path.rglob('*') if item.is_file())


def obsolete_paths(directory, manifest):
    completed = manifest['generations']
    if not completed:
        return []
    last = completed[-1]['generation']
    replay_generations = manifest['settings']['replay_generations']
    next_replay_from = max(1, last - replay_generations + 2)
    paths = []
    for row in completed:
        step = row['generation']
        if step > last:
            raise ValueError('run.json generations are out of order')
        prepared = directory / 'data' / f'gen-{step:03d}'
        if prepared.is_dir():
            paths.append(prepared)
        paths.extend(sorted((directory / 'selfplay').glob(
            f'gen-{step:03d}-validation.jsonl*')))
        if step < next_replay_from:
            paths.extend(sorted((directory / 'selfplay').glob(
                f'gen-{step:03d}-train-*.jsonl*')))
    return paths


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--apply', action='store_true',
                        help='Remove the listed redundant files and directories')
    args = parser.parse_args()
    directory = args.directory.resolve()
    manifest = json.loads((directory / 'run.json').read_text())
    paths = obsolete_paths(directory, manifest)
    total = sum(disk_bytes(path) for path in paths)
    print(json.dumps({'completed_generation': len(manifest['generations']),
                      'obsolete_paths': len(paths), 'reclaim_gib': round(total / 2**30, 2),
                      'apply': args.apply}))
    for path in paths:
        print(path)
        if args.apply:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
