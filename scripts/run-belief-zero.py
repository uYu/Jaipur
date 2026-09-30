"""From-random self-play loop with an incumbent gate and periodic MCTS arena.

The policy guides the public-belief root of determinized MCTS. The value head
is trained on match outcomes but is not passed a determinized private hand.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
NODE = os.environ.get('JAIPUR_NODE', 'node')


def command(args, log=None, env=None):
    args = [str(x) for x in args]
    if log:
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open('w') as output:
            result = subprocess.run(args, cwd=ROOT, env=env, stdout=output,
                                    stderr=subprocess.STDOUT)
        if result.returncode:
            tail = '\n'.join(log.read_text().splitlines()[-20:])
            raise RuntimeError(f'Command failed ({result.returncode}): {args}\n{tail}')
    else:
        subprocess.run(args, cwd=ROOT, env=env, check=True)


def save_manifest(path, manifest):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(manifest, indent=2) + '\n')
    temporary.replace(path)


def game_wins(path, expected):
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    if len(rows) != expected:
        raise ValueError(f'Incomplete arena: {len(rows)} != {expected}')
    return sum(row['winner'] == 0 for row in rows)


p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--directory', type=Path, required=True)
p.add_argument('--hidden', type=int, default=1024)
p.add_argument('--generations', type=int, default=20)
p.add_argument('--games-per-generation', type=int, default=64)
p.add_argument('--validation-games', type=int, default=8)
p.add_argument('--simulations-per-tree', type=int, default=128)
p.add_argument('--epochs', type=int, default=15)
p.add_argument('--learning-rate', type=float, default=0.0002)
p.add_argument('--value-weight', type=float, default=0.5)
p.add_argument('--replay-generations', type=int, default=5)
p.add_argument('--workers', type=int, default=4)
p.add_argument('--gate-every', type=int, default=10)
p.add_argument('--gate-pairs', type=int, default=100)
p.add_argument('--gate-threshold', type=float, default=0.55)
p.add_argument('--arena-every', type=int, default=100)
p.add_argument('--arena-pairs', type=int, default=40)
p.add_argument('--seed-base', type=int, default=3_960_000_000)
a = p.parse_args()
if any(x < 1 for x in (a.hidden, a.generations, a.games_per_generation,
                       a.validation_games, a.simulations_per_tree, a.epochs,
                       a.replay_generations, a.workers, a.gate_every, a.gate_pairs,
                       a.arena_every, a.arena_pairs)) or not 0.5 <= a.gate_threshold <= 1:
    p.error('Counts must be positive and gate-threshold must be in [0.5, 1]')
if a.games_per_generation > 4000 or a.validation_games > 1000 or max(a.gate_pairs, a.arena_pairs) > 500:
    p.error('Seed slots per generation exceeded')
if a.seed_base < 0 or a.seed_base + (a.generations + 1) * 10000 > 0x100000000:
    p.error('Seed schedule exceeds uint32 range')
directory = a.directory.resolve()
directory.mkdir(parents=True, exist_ok=True)
manifest_path = directory / 'run.json'
settings = {key: value for key, value in vars(a).items() if key != 'directory'}
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())
    previous = manifest['settings']
    # Runs created before gate-every evaluated the candidate every generation.
    previous.setdefault('gate_every', 1)
    if ({k: v for k, v in previous.items() if k != 'generations'} !=
            {k: v for k, v in settings.items() if k != 'generations'} or
            a.generations < previous['generations']):
        p.error('Resume settings differ from run.json (only generations may increase)')
    if a.generations > previous['generations']:
        manifest['settings']['generations'] = a.generations
        save_manifest(manifest_path, manifest)
    manifest.setdefault('learner', manifest['generations'][-1]['candidate']
                        if manifest['generations'] else manifest['champion'])
else:
    initial = directory / 'model-000'
    command([sys.executable, ROOT / 'scripts/init-belief-policy.py', initial,
             '--hidden', a.hidden, '--seed', 240930])
    manifest = {'settings': settings, 'champion': 'model-000',
                'learner': 'model-000', 'generations': []}
    save_manifest(manifest_path, manifest)


def build(model_name):
    model = directory / model_name
    binaries = directory / 'bin' / model_name
    if not (binaries / 'search-belief').exists():
        command([NODE, ROOT / 'scripts/build-belief-policy.mjs',
                 model / 'weights.hpp', binaries], directory / 'logs' / f'{model_name}-build.log')
    return binaries / 'search-belief'


def arena(name, candidate, baseline, seed, pairs):
    games = directory / 'arenas' / f'{name}.jsonl'
    games.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(JAIPUR_AI_BIN_DIR=str(candidate.parent),
               JAIPUR_ALT_BELIEF_BIN=str(baseline) if baseline else '',
               JAIPUR_BENCH_ITERATIONS=str(a.simulations_per_tree),
               JAIPUR_BENCH_LOG=str(games))
    baseline_profile = 'beliefRootAltFull' if baseline else 'beliefOff'
    command([NODE, '--experimental-strip-types', ROOT / 'scripts/benchmark-native.ts',
             'beliefRootFull', baseline_profile, seed, pairs, 50],
            directory / 'logs' / f'{name}.log', env)
    wins = game_wins(games, pairs * 2)
    return {'candidateWins': wins, 'baselineWins': pairs * 2 - wins,
            'seedStart': seed, 'pairs': pairs, 'games': str(games)}


for generation in range(len(manifest['generations']) + 1, a.generations + 1):
    generation_started = time.monotonic()
    timings = {}
    actor = manifest['champion']
    learner_init = manifest['learner']
    stage_started = time.monotonic()
    actor_binary = build(actor)
    timings['actorBuildSeconds'] = time.monotonic() - stage_started
    seed = a.seed_base + generation * 10000
    shard_count = min(a.workers, a.games_per_generation)
    size, extra = divmod(a.games_per_generation, shard_count)
    train_files = []
    tasks = []
    offset = 0
    for shard in range(shard_count):
        count = size + (shard < extra)
        output = directory / 'selfplay' / f'gen-{generation:03d}-train-{shard:02d}.jsonl'
        train_files.append(output)
        tasks.append((output, seed + offset, count))
        offset += count
    validation = directory / 'selfplay' / f'gen-{generation:03d}-validation.jsonl'
    tasks.append((validation, seed + 5000, a.validation_games))

    def generate(task):
        output, start, games = task
        output.parent.mkdir(parents=True, exist_ok=True)
        log = directory / 'logs' / f'{output.stem}.log'
        command([NODE, '--experimental-strip-types', ROOT / 'scripts/selfplay-belief-zero.ts',
                 output, actor_binary, start, games, a.simulations_per_tree,
                 1, 1], log)
        return json.loads(log.read_text().splitlines()[-1])

    stage_started = time.monotonic()
    with ThreadPoolExecutor(max_workers=min(a.workers, len(tasks))) as pool:
        selfplay_summaries = list(pool.map(generate, tasks))
    timings['selfplaySeconds'] = time.monotonic() - stage_started
    replay_from = max(1, generation - a.replay_generations + 1)
    replay = sorted(path for step in range(replay_from, generation + 1)
                    for path in (directory / 'selfplay').glob(f'gen-{step:03d}-train-*.jsonl'))
    prepared = directory / 'data' / f'gen-{generation:03d}'
    stage_started = time.monotonic()
    command([sys.executable, ROOT / 'scripts/prepare-belief-zero-data.py', prepared,
             '--train', *replay, '--validation', validation,
             '--new-policy-weight', 1, '--expected-simulations',
             8 * a.simulations_per_tree],
            directory / 'logs' / f'gen-{generation:03d}-prepare.log')
    timings['prepareSeconds'] = time.monotonic() - stage_started
    candidate = f'model-{generation:03d}'
    stage_started = time.monotonic()
    command([sys.executable, ROOT / 'scripts/train-belief-policy.py',
             prepared / 'train.jsonl', prepared / 'validation.jsonl',
             directory / candidate, '--hidden', a.hidden, '--epochs', a.epochs,
             '--learning-rate', a.learning_rate, '--value-weight', a.value_weight,
             '--init', directory / learner_init / 'model.pt', '--select-objective', 'policy'],
            directory / 'logs' / f'gen-{generation:03d}-train.log')
    timings['trainSeconds'] = time.monotonic() - stage_started
    manifest['learner'] = candidate
    gate = None
    accepted = False
    if generation % a.gate_every == 0:
        stage_started = time.monotonic()
        candidate_binary = build(candidate)
        timings['candidateBuildSeconds'] = time.monotonic() - stage_started
        stage_started = time.monotonic()
        gate = arena(f'gen-{generation:03d}-gate', candidate_binary, actor_binary,
                     seed + 7000, a.gate_pairs)
        timings['gateSeconds'] = time.monotonic() - stage_started
        accepted = gate['candidateWins'] / (2 * a.gate_pairs) > a.gate_threshold
        if accepted:
            manifest['champion'] = candidate
    record = {'generation': generation, 'actor': actor, 'learnerInit': learner_init,
              'candidate': candidate,
              'train': [str(path) for path in train_files],
              'validation': str(validation), 'replayFrom': replay_from,
              'selfplay': selfplay_summaries,
              'gate': gate, 'promoted': accepted, 'champion': manifest['champion'],
              'learner': manifest['learner']}
    if generation % a.arena_every == 0:
        stage_started = time.monotonic()
        champion_binary = build(manifest['champion'])
        record['originalMcts'] = arena(f'gen-{generation:03d}-vs-mcts', champion_binary,
                                       None, seed + 8000, a.arena_pairs)
        timings['originalMctsSeconds'] = time.monotonic() - stage_started
    timings['totalSeconds'] = time.monotonic() - generation_started
    record['timings'] = timings
    manifest['generations'].append(record)
    save_manifest(manifest_path, manifest)
    print(json.dumps(record), flush=True)
