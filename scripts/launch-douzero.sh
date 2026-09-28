#!/usr/bin/env bash
# Portable launcher for the Jaipur DouZero-style on-policy self-play learner.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/launch-douzero.sh --output DIR [options]

Options:
  --device auto|cpu|cuda|mps  Weight-update device; actor stays on CPU (default: auto)
  --python PATH               Python with NumPy and PyTorch (default: python3)
  --target-samples N          New completed-match samples (default: 10000000)
  --games-per-update N        Completed matches per model update (default: 128)
  --max-updates N             Safety cap on model updates (default: 2000)
  --eval-every N              Development evaluation interval (default: 50)
  --checkpoint-every N        Save a resume checkpoint every N updates (default: 50)
  --dev-pairs N               Paired development seeds (default: 32)
  --resume CHECKPOINT         Resume model, optimizer, and RNG from checkpoint
  --save-batches              Save compressed training batches (uses more disk)
  --smoke                     One 16-match CPU/GPU pipeline check
  --help                      Show this help

Use a fresh --output directory for each run, including resumed runs.
EOF
}

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
output=""
device="auto"
python="python3"
target_samples="10000000"
games_per_update="128"
max_updates="2000"
eval_every="50"
checkpoint_every="50"
dev_pairs="32"
resume=""
save_batches="0"
smoke="0"
while (($#)); do
  case "$1" in
    --output|--device|--python|--target-samples|--games-per-update|--max-updates|--eval-every|--checkpoint-every|--dev-pairs|--resume)
      (($# >= 2)) || { echo "Missing value for $1" >&2; exit 2; }
      case "$1" in
        --output) output=$2 ;;
        --device) device=$2 ;;
        --python) python=$2 ;;
        --target-samples) target_samples=$2 ;;
        --games-per-update) games_per_update=$2 ;;
        --max-updates) max_updates=$2 ;;
        --eval-every) eval_every=$2 ;;
        --checkpoint-every) checkpoint_every=$2 ;;
        --dev-pairs) dev_pairs=$2 ;;
        --resume) resume=$2 ;;
      esac
      shift 2 ;;
    --save-batches) save_batches="1"; shift ;;
    --smoke) smoke="1"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$output" ]] || { echo "--output is required" >&2; exit 2; }
case "$output" in /*) ;; *) output="$(pwd)/$output" ;; esac
if [[ -n "$resume" ]]; then
  case "$resume" in /*) ;; *) resume="$(pwd)/$resume" ;; esac
fi
case "$device" in auto|cpu|cuda|mps) ;; *) echo "Invalid --device: $device" >&2; exit 2 ;; esac
if [[ "$smoke" == "1" ]]; then
  target_samples="1"
  games_per_update="16"
  max_updates="1"
  eval_every="1"
  checkpoint_every="1"
  dev_pairs="1"
fi
for value in "$target_samples" "$games_per_update" "$max_updates" "$eval_every" "$checkpoint_every" "$dev_pairs"; do
  [[ "$value" =~ ^[1-9][0-9]*$ ]] || { echo "Counts must be positive integers" >&2; exit 2; }
done
((games_per_update < 10000)) || { echo "--games-per-update must be below 10000" >&2; exit 2; }
[[ ! -e "$output/config.json" ]] || { echo "Output already has config.json; use a fresh directory" >&2; exit 2; }
[[ -z "$resume" || -f "$resume" ]] || { echo "Resume checkpoint not found: $resume" >&2; exit 2; }
command -v node >/dev/null || { echo "Node.js >=22.13 is required" >&2; exit 2; }
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || major===22&&minor<13) process.exit(1)' || {
  echo "Node.js >=22.13 is required" >&2; exit 2;
}
python_bin=$(command -v "$python") || { echo "Python not found: $python" >&2; exit 2; }
case "$python_bin" in /*) ;; *) python_bin="$(pwd)/$python_bin" ;; esac
"$python_bin" - "$device" <<'PY'
import sys
import numpy
import torch
requested = sys.argv[1]
if requested == "cuda" and not torch.cuda.is_available():
    raise SystemExit("CUDA requested, but this PyTorch installation cannot access a CUDA GPU")
if requested == "mps" and not torch.backends.mps.is_available():
    raise SystemExit("MPS requested, but this PyTorch installation cannot access MPS")
selected = requested if requested != "auto" else (
    "cuda" if torch.cuda.is_available() else
    "mps" if torch.backends.mps.is_available() else "cpu"
)
print(f"PyTorch {torch.__version__}; training device: {selected}", flush=True)
PY

cd "$repo_root"
args=("$output" "$max_updates" "$games_per_update")
if [[ -n "$resume" ]]; then args+=("$resume"); fi
echo "Starting DouZero-style self-play: target=$target_samples samples, output=$output"
exec env DMC_ARCHITECTURE=douzero DMC_DEVICE="$device" \
  DMC_TARGET_SAMPLES="$target_samples" DMC_EVAL_EVERY="$eval_every" \
  DMC_CHECKPOINT_EVERY="$checkpoint_every" \
  DMC_DEV_PAIRS="$dev_pairs" DMC_SAVE_BATCHES="$save_batches" \
  DMC_FINAL_EVAL=0 JAIPUR_PYTHON="$python_bin" \
  node --experimental-strip-types scripts/selfplay-dmc.ts "${args[@]}"
