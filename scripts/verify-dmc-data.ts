// Independently replay complete episodes and compare saved MC tensors and labels.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { newGame, nextRound, applyAction } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { dmcState, dmcAction } from "../src/game/dmc.ts";
import type { Event } from "../src/game/types.ts";
const [directory, tensorsPath] = process.argv.slice(2);
const tensors = JSON.parse(readFileSync(tensorsPath, "utf8"));
const games = readFileSync(join(directory, "selfplay-games.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
let at = 0,
  checked = 0;
for (const game of games) {
  if (at >= tensors.x.length) break;
  assert.equal(game.iteration, 0);
  let s = newGame(game.seed);
  const events: Event[] = [];
  for (const event of game.events as Event[]) {
    if (event.type === "next") s = nextRound(s);
    else {
      const o = observe(s, events, 0.75);
      const x = [
        ...dmcState(o, {
          ownSeals: s.seals[s.current],
          opponentSeals: s.seals[1 - s.current],
          round: s.round,
        }),
        ...dmcAction(o, event),
      ];
      assert.equal(x.length, tensors.x[at].length);
      x.forEach((v, i) => assert.ok(Math.abs(v - tensors.x[at][i]) < 1e-6));
      assert.equal(tensors.y[at], s.current === game.winner ? 1 : -1);
      s = applyAction(s, event);
      at++;
    }
    events.push(event);
  }
  assert.equal(s.phase, "finished");
  assert.equal(game.winner, s.seals[0] > s.seals[1] ? 0 : 1);
  checked++;
}
assert.equal(at, tensors.x.length);
console.log(
  JSON.stringify({
    completeEpisodes: checked,
    verifiedSamples: at,
    featuresMatch: true,
    actorPerspectiveMatchReturns: true,
  }),
);
