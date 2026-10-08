#!/usr/bin/env bash
# One bounded DouZero-style training job. Submit this script to the scheduler.
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage: JAIPUR_DOUZERO_OUTPUT=/path/to/new-run scripts/train-douzero-14d.sh

Environment: JAIPUR_DOUZERO_PYTHON (default python),
JAIPUR_DOUZERO_MAX_HOURS (default 330), JAIPUR_DOUZERO_RESUME (optional),
JAIPUR_DOUZERO_ACTOR_DEVICE (default cpu),
JAIPUR_DOUZERO_ACTORS (default 8), JAIPUR_DOUZERO_SCORERS (default 4),
JAIPUR_DOUZERO_ACTOR_LANES (default 16), CUDA_VISIBLE_DEVICES,
JAIPUR_DOUZERO_FULL_SALE_ONLY (default 1),
JAIPUR_DOUZERO_MCTS_EVERY_HOURS (default 6; 0 disables),
JAIPUR_DOUZERO_MCTS_PAIRS (default 20 = 40 matches),
JAIPUR_DOUZERO_MCTS_SIMULATIONS (default 1024 per tree),
JAIPUR_DOUZERO_CHECKPOINT_EVERY (default 500 updates),
JAIPUR_DOUZERO_CHECKPOINT_MAX (default 10 recent checkpoints),
JAIPUR_SWANLAB_PROJECT (default jaipur-douzero-14d),
SWANLAB_API_KEY (optional; supply through the scheduler's secret store).
The output directory must be new, including when resuming from a checkpoint.
EOF
  exit 0
fi

: "${JAIPUR_DOUZERO_OUTPUT:?Set JAIPUR_DOUZERO_OUTPUT to a fresh output directory}"
: "${JAIPUR_DOUZERO_PYTHON:=python}"
: "${JAIPUR_DOUZERO_MAX_HOURS:=330}"
: "${JAIPUR_DOUZERO_ACTOR_DEVICE:=cpu}"
: "${JAIPUR_DOUZERO_ACTORS:=8}"
if [[ "$JAIPUR_DOUZERO_ACTOR_DEVICE" == "cpu" ]]; then
  : "${JAIPUR_DOUZERO_SCORERS:=4}"
else
  : "${JAIPUR_DOUZERO_SCORERS:=1}"
fi
: "${JAIPUR_DOUZERO_ACTOR_LANES:=16}"
: "${JAIPUR_DOUZERO_FULL_SALE_ONLY:=1}"
export DMC_MCTS_EVERY_HOURS="${JAIPUR_DOUZERO_MCTS_EVERY_HOURS:-6}"
export DMC_MCTS_PAIRS="${JAIPUR_DOUZERO_MCTS_PAIRS:-20}"
export DMC_MCTS_SIMULATIONS="${JAIPUR_DOUZERO_MCTS_SIMULATIONS:-1024}"
export JAIPUR_SWANLAB_PROJECT="${JAIPUR_SWANLAB_PROJECT:-jaipur-douzero-14d}"

args=(
  --device cuda --actor-device "$JAIPUR_DOUZERO_ACTOR_DEVICE"
  --python "$JAIPUR_DOUZERO_PYTHON"
  --output "$JAIPUR_DOUZERO_OUTPUT" --unlimited
  --max-hours "$JAIPUR_DOUZERO_MAX_HOURS"
  --games-per-update 128 --epochs-per-batch 1 --exploration 0.01
  --actors "$JAIPUR_DOUZERO_ACTORS" --scorers "$JAIPUR_DOUZERO_SCORERS"
  --actor-lanes "$JAIPUR_DOUZERO_ACTOR_LANES"
  --eval-every 500 --dev-pairs 64
  --checkpoint-every "${JAIPUR_DOUZERO_CHECKPOINT_EVERY:-500}"
  --checkpoint-max "${JAIPUR_DOUZERO_CHECKPOINT_MAX:-10}" --no-game-records
)
case "$JAIPUR_DOUZERO_FULL_SALE_ONLY" in
  1) args+=(--full-sale-only) ;;
  0) ;;
  *) echo "JAIPUR_DOUZERO_FULL_SALE_ONLY must be 0 or 1" >&2; exit 2 ;;
esac
if [[ -n "${JAIPUR_DOUZERO_RESUME:-}" ]]; then
  args+=(--resume "$JAIPUR_DOUZERO_RESUME")
fi

exec ./scripts/launch-douzero.sh "${args[@]}"
