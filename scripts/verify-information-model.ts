import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import {
  newGame,
  nextRound,
  applyAction,
  actionError,
} from "../src/game/engine.ts";
import {
  playerView,
  publicEvent,
  rowFeatures,
} from "../src/game/information.ts";
import type { PublicEvent } from "../src/game/information.ts";
import { InformationNetwork } from "../src/game/information-network.ts";
import { informationSearch } from "../src/game/information-search.ts";
const dir = process.argv[2],
  f = JSON.parse(readFileSync(`${dir}/parity.json`, "utf8")),
  network = new InformationNetwork(
    JSON.parse(readFileSync(`${dir}/model.json`, "utf8")),
  ),
  dataset = JSON.parse(readFileSync(`${dir}/dataset.json`, "utf8"));
let found = false,
  maxError = 0,
  search: any;
for (const source of dataset.sources) {
  if (found) break;
  for (const line of readFileSync(source.path, "utf8").trim().split("\n")) {
    const game = JSON.parse(line);
    if (game.seed !== f.seed) continue;
    let s = newGame(game.seed),
      h: PublicEvent[] = [];
    for (const a of game.events) {
      if (s.phase === "playing") {
        const v = playerView(s, s.current, h),
          rows = rowFeatures(v);
        if (
          rows.state.every((x, i) => Math.abs(x - f.state[i]) < 1e-6) &&
          rows.history.length === f.history.length
        ) {
          const p = network.predict(v),
            mu = network.predict(v, "opponent");
          const errors = [
            Math.abs(p.value - f.value),
            ...p.logits.map((x, i) => Math.abs(x - f.logits[i])),
            ...mu.logits.map((x, i) => Math.abs(x - f.opponent_logits[i])),
          ];
          maxError = Math.max(...errors);
          assert.ok(maxError < 2e-5, `parity error ${maxError}`);
          search = informationSearch(v, network, {
            budgetMs: 1000,
            depth: 4,
            random: () => 0.418,
          });
          assert.equal(actionError(s, search.action), null);
          assert.ok(search.stats.completed > 0);
          found = true;
          break;
        }
      }
      const next = a.type === "next" ? nextRound(s) : applyAction(s, a);
      h = [...h, publicEvent(s, next, a)];
      s = next;
    }
    if (found) break;
  }
}
assert.ok(found, "Fixture replay located");
writeFileSync(
  `${dir}/inference-verification.json`,
  JSON.stringify({ maxError, search }, null, 2) + "\n",
);
console.log({ maxError, stats: search.stats });
