// Replay completed self-play games into observable (history, state, action,
// final return) examples. Split by complete game, never by individual move.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
import { newGame, nextRound, applyAction, actionError } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { dmcAction, dmcState } from "../src/game/dmc.ts";
import { dmcHistory } from "../src/game/dmc-history.ts";
import type { DmcPublicMove } from "../src/game/dmc-history.ts";
import type { Event } from "../src/game/types.ts";

const [source, prefix, trainText = "64", validationText = "16"] =
  process.argv.slice(2);
const trainGames = Number(trainText), validationGames = Number(validationText);
if (!source || !prefix || ![trainGames, validationGames].every(
  (n) => Number.isSafeInteger(n) && n > 0,
)) throw Error("Usage: generate-douzero-data.ts games.jsonl output-prefix [trainGames validationGames]");

const outputs = [[], []] as string[][];
const seeds = [new Set<number>(), new Set<number>()];
let games = 0;
for await (const line of createInterface({ input: createReadStream(source) })) {
  if (games >= trainGames + validationGames) break;
  if (!line.trim()) continue;
  const game = JSON.parse(line) as { seed: number; winner: number; events: Event[] };
  if (!Number.isSafeInteger(game.seed) || ![0, 1].includes(game.winner))
    throw Error("Bad complete game metadata");
  const split = games < trainGames ? 0 : 1;
  if (seeds[0].has(game.seed) || seeds[1].has(game.seed))
    throw Error("Game seed appears in multiple examples");
  seeds[split].add(game.seed);
  let state = newGame(game.seed);
  const events: Event[] = [];
  let moves: DmcPublicMove[] = [];
  for (const event of game.events) {
    if (event.type === "next") {
      state = nextRound(state);
      moves = [];
    } else {
      assert.equal(actionError(state, event), null);
      const o = observe(state, events, 0.75);
      const action = dmcAction(o, event);
      outputs[split].push(JSON.stringify({
        seed: game.seed,
        history: dmcHistory(moves, state.current),
        stateAction: [...dmcState(o, {
          ownSeals: state.seals[state.current],
          opponentSeals: state.seals[1 - state.current],
          round: state.round,
        }), ...action],
        target: state.current === game.winner ? 1 : -1,
      }));
      moves.push({ actor: state.current, action });
      state = applyAction(state, event);
    }
    events.push(event);
  }
  assert.equal(state.phase, "finished");
  assert.equal(state.seals[0] > state.seals[1] ? 0 : 1, game.winner);
  games++;
}
if (games !== trainGames + validationGames)
  throw Error("Not enough completed games");
writeFileSync(prefix + "-train.jsonl", outputs[0].join("\n") + "\n");
writeFileSync(prefix + "-validation.jsonl", outputs[1].join("\n") + "\n");
console.log(JSON.stringify({
  games: [trainGames, validationGames],
  examples: outputs.map((rows) => rows.length),
  seeds: seeds.map((set) => [Math.min(...set), Math.max(...set)]),
}));
