# Human replay training pilot

Source: [noidvan/jaipur](https://huggingface.co/datasets/noidvan/jaipur), licensed
CC-BY-NC-4.0. The downloaded Parquet files live in `data/hf-jaipur/` and are
ignored by Git. The dataset has 38,077 games, including 5,529 `original`
(hidden-opponent-hand) games.

## Full training

Requires Python packages `pyarrow`, `numpy`, and `torch`.

```bash
python3 scripts/prepare-human-replays.py \
  --output output/jaipur-human-full-20260929 \
  --variant original --max-games 0 --validation-percent 10 --stride 1
python3 scripts/train-human-policy.py output/jaipur-human-full-20260929 --epochs 8
# This run continued from the epoch-8 checkpoint with a smaller learning rate:
python3 scripts/train-human-policy.py output/jaipur-human-full-20260929 \
  --resume --epochs 20 --learning-rate 0.001 --patience 5
python3 scripts/train-human-policy.py output/jaipur-human-full-20260929 \
  --resume --epochs 30 --learning-rate 0.0005 --patience 5
# With SWANLAB_API_KEY set, the final continuation was streamed live
# after backfilling epochs 0–30:
output/.swanlab-venv/bin/python \
  scripts/upload-human-swanlab.py output/jaipur-human-full-20260929 -- \
  python3 scripts/train-human-policy.py output/jaipur-human-full-20260929 \
  --resume --epochs 45 --learning-rate 0.00025 --patience 5
```

Preparation converts signed `action_goods` to unique legal choices for take,
sell, and trade. Training examples contain the actor's hand, market, public
coin and bonus stack information, deck count, actor score, and the number of
goods in the opponent's hand. The pipeline also replays every public action,
including turns omitted by the sampling stride, to track the opponent cards
known from market acquisitions and trades (including known camels), cards
revealed by market refills from the deck, and goods sold to the discard. It
resets this memory each round. Initial hidden cards remain unknown; the
opponent's private hand from the source is used only to audit the known-card
lower bound and to read its public non-camel card count. Opponent score and
hidden bonus values are excluded. The split is a fixed SHA-256 hash of the
whole game ID; no test set is created. Training samples up to 15 other legal
actions per position, while validation ranks against every legal action.

Of 5,529 original-variant source games, 18 were rejected after a recorded
action or public market transition failed compatibility checks. The retained
data contains 4,958 training games (490,205 positions) and 553 validation
games (54,835 positions). No validation game appears in training. The source
files and generated JSONL are ignored by Git.

The selected checkpoint is epoch 43: validation negative log-likelihood
1.2173 and top-1 human-action agreement 55.72%, compared with 11.15% for a
uniform random choice among legal actions. The run is recorded in
[SwanLab](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/bhubvzp7).
Epochs 0–30 were backfilled when the online run opened; epochs 31–45 were
streamed as they completed. The online run uploaded four small artifacts and
finished successfully.

The model export is `output/jaipur-human-full-20260929/model.json`; the PyTorch
checkpoint is `model.pt`. The exported network scores each legal action from
54 public state features plus 12 action features, with one 64-unit ReLU hidden
layer. This is a behavior-cloning policy; match play against the existing AI
is a separate user-run evaluation and is not included in the training metric.
The serialized JSON model and PyTorch checkpoint agree within 7.7e-6 on a
validation example.

`scripts/upload-human-swanlab.py` logs each subsequent epoch immediately and
uploads aggregate preparation/training metrics and the two small model files
to the private `jaipur-human-replays` SwanLab project. It reads
`SWANLAB_API_KEY` only from the environment and never uploads raw replays or
generated training examples.

## Earlier pilot

The 400-game pilot produced 8,895 training positions from 359 games and 947
validation positions from 40 games. One source game was rejected because its
market jumped to a reset state within the same recorded round. All retained
sampled moves matched the legal-action generator, and the reconstructed known
cards remained subsets of the source hands on every turn. The 5-epoch model
reached 41.7% validation top-1 agreement with the human move, versus 19.4%
before training and 9.7% for uniform random selection among the legal choices.
Validation negative log-likelihood fell from 2.843 to 1.702.

The pilot checkpoint and JSON metrics are in `output/jaipur-human-pilot/`,
ignored by Git. Offline action agreement is not evidence of stronger gameplay.

## Preliminary complete-match comparison

`scripts/compare-human-replay.ts` uses the exported policy with public-memory
reconstruction, checking every chosen action against the local rule engine.
The same 10 seeds are paired with seats swapped for each opponent. Pure DMC
(`model-715.pt`) won 12 of 20 matches; the human-replay policy won 8. Against
the current 1-second MCTS, the user stopped the run after 8 of 20 scheduled
matches; the human-replay policy won 1 and MCTS won 7. These small samples are
diagnostic, not reliable strength estimates. Results are in the ignored
`output/jaipur-human-vs-dmc-20260929/` and
`output/jaipur-human-vs-mcts-20260929/` directories.

The validation action agreement is uneven: take 64.2%, sell 49.1%, trade
40.0%. For one-card sales it is only 5.6% across 2,781 validation positions;
the model chooses one-card sales 413 times where humans choose them 2,781
times. The model uses a small feed-forward action scorer trained to imitate
all players, without win/score targets or search. Its 54 state inputs include
card memory but omit the order of public moves, opponent public goods income,
and match seals. It also trains on games whose winner is unknown (12.9% of
training positions). These are concrete limitations of this training setup;
the results do not establish that the replay data itself lacks value.

## V2 public-history experiment

`scripts/prepare-human-replays-v2.py` keeps every turn of each original-variant
game with a recorded winner, splitting by whole game into training and
validation. It adds the opponent's publicly earned goods points, public bonus
token count, match seals, and the previous eight public moves. The actor's
private hand and own score remain available to that actor. No opponent private
card identities or hidden bonus values enter the 154 state features. The
12-dimensional candidate action features are unchanged. Training samples up
to 31 other legal actions per position, while validation uses the complete
legal set. Seals are reconstructed round by round from published scores and,
on tied scores, the publicly countable bonus and goods tokens.

`scripts/train-human-policy-v2.py` shares a state encoder between a candidate
action scorer and a match-outcome prediction head. Its loss is action
cross-entropy plus 0.25 times outcome binary cross-entropy. **Every decision
has equal action-loss weight.** Poor V1 agreement on one-card sales and trades
is a reason to inspect those categories, not proof that increasing their
weights improves play. Validation reports accuracy separately for take, sell,
one-card sell, and trade. Match strength is reserved for user-run games.

The full V2 preparation retained 4,304 training games (427,075 positions) and
481 validation games (47,959 positions). It excluded 727 games without a
recorded winner and rejected 17 games for incompatible action or public market
transitions. `scripts/train-human-swanlab-v2.py` starts the private SwanLab run
before training and streams each epoch's metrics as training progresses.
An audit of all 91,470 original-variant source trades found no one-card
exchanges. Twelve source trade records have mismatched card counts; the legal
action generator requires taking at least two market cards and giving back the
same number of goods and/or camels.

The corrected full-data run completed at
[SwanLab](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/fmxkkac3).
The selected checkpoint is epoch 23 of 24: validation action negative
log-likelihood 1.1583, top-1 agreement 58.32%, and outcome binary
cross-entropy 0.5455. On these same 47,959 validation positions, the V1
checkpoint scores 1.2157 and 55.57%. Category top-1 agreement at the selected
V2 checkpoint is 68.95% take, 59.17% sell excluding singletons, 13.29%
one-card sell, and 37.09% trade. On the same positions, V1 trade agreement is
39.71%; V2 did not improve that category. The JSON export agrees with the
PyTorch checkpoint within 4.8e-7 on a validation position, and the TypeScript
adapter selects a legal action from the exported model. These are offline
agreement numbers; they do not measure match strength.

For a direct preliminary comparison, V2 played the same ten seeds against
the same DMC `model-715.pt` checkpoint with seats swapped (20 complete
matches). V2 won 6 and DMC won 14. V1 won 8 and DMC won 12 on those exact
seeds. V2 lost five matches that V1 won and won three that V1 lost. The small
sample does not support claiming improved play from the better offline
agreement. The new results are in the ignored
`output/jaipur-human-v2-vs-dmc-20260929/` directory.

## Policy-target ablations

Using exactly the same prepared data and architecture, setting the auxiliary
outcome-loss coefficient to zero selected epoch 23 with validation NLL 1.1404
and top-1 58.43%, compared with 1.1583 and 58.32% for the outcome-head run.
It won 7 of the same 20 paired games against DMC, versus 6 for the
outcome-head run. The no-outcome experiment is at
[SwanLab](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/622tjeft).

Training that same zero-outcome-loss model on only the eventual winners'
actions kept 212,677 of 427,075 training positions. It selected epoch 20:
validation NLL 1.1906 and top-1 57.27%, but it won 10 of the same 20 games
against DMC. Its [SwanLab run](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/v8nybpke)
and local match log preserve the exact data and results. An equal-size random
subset control was prepared but its training was paused at the user's request
after epoch 5, before the predefined epoch limit.

## Exploratory player Elo

`scripts/analyze-human-elo.py` assigns all players 1500, replays only
original-variant training-split matches with known winners using K=24, and
averages ratings across 32 shuffled orders. The source has no match timestamp,
so file order is not a documented chronology. The rating uses 4,317 training
games and 1,662 players; median player participation is two games. On 485
held-out validation games, the averaged ratings predict the winner in 59.0%
with log loss 0.666, versus 50.5% majority-class accuracy and 0.693 log loss
for a constant 50/50 prediction. Among players with at least ten games against
five opponents, the top 20 from forward and reverse file-order Elo overlap in
only 14 cases. Ratings are therefore informative in aggregate but too noisy
for a hard cutoff on most players. The full ratings and audit are saved to
`output/jaipur-human-elo-20260929/`.

`scripts/sample-human-elo.py` uses these train-split ratings to sample
training decisions by the actor's rating, regardless of whether that actor
won or lost the particular match. The retain probability is
`clip(0.5 + (Elo - 1500) / 400 * games / (games + 20), 0.2, 0.8)`.
The games/(games+20) factor keeps ratings based on one or two games near
neutral sampling probability. This selected 218,331 of 427,075 decisions,
including 114,310 made by eventual match winners. Validation is unchanged.
The equal-size random-sampling run was paused after epoch 5 at the user's
request so the Elo-based run could proceed first.

The user then requested dropping games involving clearly weak players. The
first Elo-sampled run was stopped after epoch 6 and replaced by a filtered
experiment. The conservative exclusion requires at least ten training games,
at least five distinct opponents, and mean Elo at most 1450; it identifies
32 players. All 1,181 accepted training games involving one of them were
removed (116,138 positions). Elo sampling of the remaining games uses a
higher base retain probability of 0.75, with bounds 0.4 to 1.0; this keeps
245,571 positions from 3,123 games. It retains losses by higher-rated
players against players outside the exclusion set and does not use validation
outcomes for Elo or sample selection. The selected epoch is 21: validation
NLL 1.1824 and top-1 57.36%. It won 10 of the same 20 paired games against
DMC, tying the winner-only model and exceeding the all-player no-outcome-loss
model's 7 wins on these seeds. The completed
[SwanLab run](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/273zgxqr)
and local match log contain the exact results. This sample does not establish
that Elo filtering is stronger in general.

## Strict high-Elo training

`scripts/filter-human-high-elo.py` also tested high-segment-only training.
Eligibility is based exclusively on train-split results: at least ten games,
five distinct opponents, and shuffle-mean Elo at least 1525. With both players
required to meet the threshold, only 49 players and 242 games (24,958
positions) remain. The selected epoch 14 reaches 44.96% top-1 agreement on
the unchanged full validation set and wins 2 of 20 paired games against DMC.
The completed [SwanLab run](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/zlc0nz6p)
has the model and metrics.

To test the actor-only interpretation, the same threshold was applied to
the player whose action is being learned, while retaining that player's
winning and losing games against any opponent. This yields 101,445 positions
from 1,792 games. The selected epoch 20 reaches 53.49% full-validation
top-1 and wins 7 of 20 against the same DMC checkpoint and seeds. Trade and
one-card-sale agreement improve relative to the all-player model, but overall
match results do not. The completed
[SwanLab run](https://swanlab.cn/@franzyu/jaipur-human-replays/runs/mt74njcr)
contains the actor-only experiment.

## Held-out 1600+ actor agreement for DouZero

`scripts/evaluate-douzero-human.py` selects players from
`output/jaipur-human-elo-20260929/ratings.csv` with shuffled-order mean Elo
at least 1600, at least ten training-split matches, and five distinct
opponents. Ratings are inferred from match results; the source has no official
player ratings. The evaluation uses only their moves in the existing 10%
whole-game hash holdout, so the evaluated games did not determine Elo.

Run with `python scripts/evaluate-douzero-human.py --output
output/jaipur-human-1600-validation-20260929 --checkpoint
output/jaipur-flat-fullsale-10m-20260929/model-200.pt` (on one line). It saves
`validation.jsonl` with DMC public-state/history and legal-action features,
plus `summary.json`. Only the acting player's cards, public history, and
public opponent hand size enter model features. Ten human partial-sale moves
are outside the full-sale policy's candidate set and count as mismatches.

On 2026-09-29, nine eligible players yielded 43 holdout games. Two games
start after unrecorded sales and cannot reconstruct a consistent public
posterior, leaving 41 games and 1,968 actions (1,958 covered by the policy).
The current posterior reconstruction needed 171 resets to a distribution
conditioned on the current public state when replay history became
inconsistent. Treat this as a diagnostic comparison rather than an exact
replication of the training-time belief state.

| Flat full-sale checkpoint | Exact move agreement | Action-kind agreement |
| --- | ---: | ---: |
| model-000 | 390 / 1,968 = 19.8% | 602 / 1,968 = 30.6% |
| model-200 | 652 / 1,968 = 33.1% | 992 / 1,968 = 50.4% |
| rounds model-150 | 624 / 1,968 = 31.7% | 972 / 1,968 = 49.4% |

Uniform choice among the legal candidate actions would agree with 11.9% of
recorded moves in expectation. At model-200, exact agreement by human action
is take 126/669 (18.8%), sell 314/613 (51.2%), camels 136/307 (44.3%),
and trade 76/379 (20.1%). Exact agreement is only an auxiliary measure:
several legal moves can be strategically similar, and these inferred ratings
do not certify expert play.
