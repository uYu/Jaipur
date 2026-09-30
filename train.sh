#!/bin/sh
# Fresh DouZero-style GPU training. Run with: nohup sh train.sh > train.log 2>&1 &
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repo_root"

: "${JAIPUR_DOUZERO_PYTHON:=python}"
: "${JAIPUR_DOUZERO_OUTPUT:=./output/jaipur-douzero-10m-fresh}"
: "${JAIPUR_DOUZERO_DEVICE:=cuda}"
: "${JAIPUR_DOUZERO_ACTOR_DEVICE:=cpu}"
: "${JAIPUR_DOUZERO_TARGET_SAMPLES:=10000000}"
: "${JAIPUR_DOUZERO_UNLIMITED:=0}"
: "${JAIPUR_DOUZERO_GAMES_PER_UPDATE:=128}"
: "${JAIPUR_DOUZERO_MAX_UPDATES:=2000}"
: "${JAIPUR_DOUZERO_EVAL_EVERY:=50}"
: "${JAIPUR_DOUZERO_CHECKPOINT_EVERY:=50}"
: "${JAIPUR_DOUZERO_EXPLORATION:=0.01}"
: "${JAIPUR_DOUZERO_EPOCHS_PER_BATCH:=1}"
: "${JAIPUR_DOUZERO_ACTORS:=1}"
: "${JAIPUR_DOUZERO_SCORERS:=1}"
: "${JAIPUR_DOUZERO_ACTOR_LANES:=8}"
: "${JAIPUR_DOUZERO_DEV_PAIRS:=32}"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:-0}"

if [ -n "${SWANLAB_API_KEY:-}" ]; then
  "$JAIPUR_DOUZERO_PYTHON" -c 'import swanlab' || {
    echo "SwanLab API key is set, but this Python cannot import swanlab" >&2
    exit 2
  }
  export JAIPUR_SWANLAB_PROJECT="${JAIPUR_SWANLAB_PROJECT:-jaipur-douzero}"
else
  echo "SWANLAB_API_KEY is unset; only local training logs will be written" >&2
fi

# No --resume: the launcher requires a fresh output directory.
if [ "$JAIPUR_DOUZERO_UNLIMITED" = "1" ]; then
  set -- --unlimited
else
  set --
fi
exec ./scripts/launch-douzero.sh \
  "$@" \
  --device "$JAIPUR_DOUZERO_DEVICE" --python "$JAIPUR_DOUZERO_PYTHON" \
  --actor-device "$JAIPUR_DOUZERO_ACTOR_DEVICE" \
  --output "$JAIPUR_DOUZERO_OUTPUT" \
  --target-samples "$JAIPUR_DOUZERO_TARGET_SAMPLES" \
  --games-per-update "$JAIPUR_DOUZERO_GAMES_PER_UPDATE" \
  --max-updates "$JAIPUR_DOUZERO_MAX_UPDATES" \
  --eval-every "$JAIPUR_DOUZERO_EVAL_EVERY" \
  --checkpoint-every "$JAIPUR_DOUZERO_CHECKPOINT_EVERY" \
  --exploration "$JAIPUR_DOUZERO_EXPLORATION" \
  --epochs-per-batch "$JAIPUR_DOUZERO_EPOCHS_PER_BATCH" \
  --actors "$JAIPUR_DOUZERO_ACTORS" \
  --scorers "$JAIPUR_DOUZERO_SCORERS" \
  --actor-lanes "$JAIPUR_DOUZERO_ACTOR_LANES" \
  --dev-pairs "$JAIPUR_DOUZERO_DEV_PAIRS"
