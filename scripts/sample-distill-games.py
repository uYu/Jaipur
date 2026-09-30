"""Sample replayable completed matches for a seed-disjoint search teacher run."""
import argparse
import json
import random
import re
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument("selfplay", type=Path)
p.add_argument("directory", type=Path)
p.add_argument("--selfplay-games", type=int, default=640)
p.add_argument("--search-games", type=int, default=160)
p.add_argument("--shards", type=int, default=8)
p.add_argument("--seed", type=int, default=20260929)
p.add_argument("--exclude-manifest", type=Path)
a = p.parse_args()
if a.selfplay_games % a.shards or a.search_games % a.shards:
    raise ValueError("Game counts must be divisible by shard count")
rng = random.Random(a.seed)
excluded = set(range(1001, 1021)) | set(range(1101, 1121))
excluded |= set(range(1201, 1211)) | set(range(1301, 1321))
excluded |= set(range(3900009000, 3900009500))
if a.exclude_manifest:
    previous = json.loads(a.exclude_manifest.read_text())
    excluded.update(game["seed"] for game in previous["games"])

# Version buckets avoid collecting only one phase of the DMC policy.
buckets = [[] for _ in range(a.shards)]
seen = [0] * a.shards
quota = a.selfplay_games // a.shards
version_pattern = re.compile(rb'"version":(\d+)')
seed_pattern = re.compile(rb'"seed":(\d+)')
with a.selfplay.open("rb") as file:
    for raw in file:
        prefix = raw[:160]
        version_match = version_pattern.search(prefix)
        seed_match = seed_pattern.search(prefix)
        if not version_match or not seed_match:
            continue
        version = int(version_match.group(1))
        seed = int(seed_match.group(1))
        if seed in excluded:
            continue
        bucket = min(a.shards - 1, version * a.shards // 2400)
        seen[bucket] += 1
        sample = buckets[bucket]
        if len(sample) < quota:
            sample.append((seed, raw, str(a.selfplay)))
        else:
            index = rng.randrange(seen[bucket])
            if index < quota:
                sample[index] = (seed, raw, str(a.selfplay))
if any(len(bucket) != quota for bucket in buckets):
    raise ValueError(f"Insufficient self-play games by version: {[len(b) for b in buckets]}")

# Exclude self-play logs here; search and baseline games improve coverage of
# states the distilled root prior will actually encounter.
search_by_seed = {}
for path in sorted(Path("analysis").rglob("*games*.jsonl")):
    if "selfplay" in path.name:
        continue
    for raw in path.open("rb"):
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            continue
        seed = row.get("seed")
        if (not isinstance(seed, int) or seed in excluded or
                not isinstance(row.get("events"), list) or not row["events"]):
            continue
        search_by_seed.setdefault(seed, (seed, raw, str(path)))
search = list(search_by_seed.values())
rng.shuffle(search)
if len(search) < a.search_games:
    raise ValueError(f"Need {a.search_games} search games, found {len(search)}")
search = search[:a.search_games]
selected = [item for bucket in buckets for item in bucket] + search
seeds = [item[0] for item in selected]
if len(seeds) != len(set(seeds)):
    raise ValueError("Repeated seed in sampled games")
rng.shuffle(selected)
a.directory.mkdir(parents=True, exist_ok=True)
manifest = []
per_shard = len(selected) // a.shards
for shard in range(a.shards):
    part = selected[shard * per_shard:(shard + 1) * per_shard]
    path = a.directory / f"games-{shard:02d}.jsonl"
    with path.open("wb") as file:
        for seed, raw, source in part:
            file.write(raw if raw.endswith(b"\n") else raw + b"\n")
            manifest.append({"seed": seed, "source": source, "shard": shard})
(a.directory / "manifest.json").write_text(json.dumps({
    "seed": a.seed, "selfplayGames": a.selfplay_games,
    "searchGames": a.search_games, "shards": a.shards,
    "versionBucketAvailable": seen, "games": manifest,
}, indent=2) + "\n")
print(json.dumps({"games": len(selected), "uniqueSeeds": len(set(seeds)),
                  "selfplay": a.selfplay_games, "search": a.search_games,
                  "availableSearchSeeds": len(search_by_seed), "directory": str(a.directory)}))
