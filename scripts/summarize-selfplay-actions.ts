// Reconstruct completed-match action/score statistics for one actor version.
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { newGame, nextRound, applyAction } from "../src/game/engine.ts";
import type { Event } from "../src/game/types.ts";
import {
  addRoundMetrics, completedGameRoundMetrics, emptyRoundMetrics, ROUND_ACTIONS,
} from "./douzero-round-metrics.ts";

const [gamesPath, versionText, outputPath] = process.argv.slice(2);
const version = Number(versionText);
if (!gamesPath || !Number.isSafeInteger(version) || version < 0 || !outputPath)
  throw Error("Usage: summarize-selfplay-actions.ts selfplay-games.jsonl version output.json");
const baseline = JSON.parse(readFileSync(
  new URL("../data/human-elo1600-action-baseline.json", import.meta.url), "utf8",
));
const totals = emptyRoundMetrics();
let matches = 0;
let epsilon: number | undefined;
const lines = createInterface({ input: createReadStream(gamesPath) });
for await (const line of lines) {
  if (!line) continue;
  const game = JSON.parse(line);
  if (game.version !== version) continue;
  if (epsilon !== undefined && epsilon !== game.epsilon)
    throw Error("One actor version has multiple exploration rates");
  epsilon = game.epsilon;
  let state = newGame(game.seed);
  const samples: { actor: number }[] = [];
  for (const event of game.events as Event[]) {
    if (event.type === "next") state = nextRound(state);
    else {
      samples.push({ actor: state.current });
      state = applyAction(state, event);
    }
  }
  if (state.phase !== "finished" || samples.length !== game.turns)
    throw Error(`Invalid completed replay at seed ${game.seed}`);
  addRoundMetrics(totals,
    completedGameRoundMetrics(game.events, samples, state.results));
  matches++;
}
if (!matches) throw Error(`No completed games for actor version ${version}`);
const totalActions = ROUND_ACTIONS.reduce(
  (sum, category) => sum + totals.actionCounts[category], 0);
const perPlayerRound: Record<string, number> = Object.fromEntries([
  ...ROUND_ACTIONS.map((category) =>
    [category, totals.actionCounts[category] / totals.playerRounds] as const),
  ["goods_sold", totals.goodsSold / totals.playerRounds],
  ["total", totalActions / totals.playerRounds],
  ["score", totals.scoreSum / totals.playerRounds],
]);
const actionShare = Object.fromEntries(ROUND_ACTIONS.map((category) =>
  [category, totals.actionCounts[category] / totalActions]));
const goodsPerSale = totals.goodsSold / totals.actionCounts.sell_actions;
const report = {
  version, matches, rounds: totals.playerRounds / 2,
  playerRounds: totals.playerRounds, epsilon,
  actionCounts: totals.actionCounts,
  goodsSold: totals.goodsSold,
  perPlayerRound,
  goodsPerSale,
  actionShare,
  human1600: {
    players: baseline.players,
    playerRounds: baseline.player_rounds,
    perPlayerRound: baseline.per_player_round_mean,
    goodsPerSale: baseline.goods_per_sale,
    actionShare: baseline.action_share,
  },
};
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
