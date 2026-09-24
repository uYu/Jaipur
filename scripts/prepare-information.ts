import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import {
  newGame,
  applyAction,
  nextRound,
  actionError,
} from "../src/game/engine.ts";
import {
  playerView,
  publicEvent,
  rowFeatures,
  cardCounts,
} from "../src/game/information.ts";
import type { PublicEvent } from "../src/game/information.ts";
import type { Event } from "../src/game/types.ts";
import { dmcAction } from "../src/game/dmc.ts";
const dir = process.argv[2] ?? "analysis/information-pilot-2026-09-24";
mkdirSync(dir, { recursive: true });
const paths = ["mix-50ms", "mix-1s", "mix-2s", "pure-50ms"]
  .map((n) => `analysis/dmc-mcts-2026-09-24/${n}-games.jsonl`)
  .concat(
    ["256", "1024", "4096"].map(
      (n) => `analysis/dmc-mcts-fixed-2026-09-24/count-${n}-games.jsonl`,
    ),
    [
      "analysis/dmc-mcts-holdout-2026-09-24/count-256-games.jsonl",
      "analysis/dmc-mcts-1s-738-2026-09-24/matches-games.jsonl",
    ],
  );
for (const split of ["train", "dev"])
  writeFileSync(`${dir}/${split}.jsonl`, "");
const counts = { train: 0, dev: 0, games: 0 },
  seeds: { train: Set<number>; dev: Set<number> } = {
    train: new Set(),
    dev: new Set(),
  };
const sources = [];
for (const path of paths) {
  const text = readFileSync(path, "utf8");
  sources.push({
    path,
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  for (const line of text.trim().split("\n")) {
    const game = JSON.parse(line);
    let s = newGame(game.seed),
      h: PublicEvent[] = [];
    const rows = [];
    let moves = 0;
    const split =
      createHash("sha256").update(String(game.seed)).digest()[0] % 5 === 0
        ? "dev"
        : "train";
    seeds[split].add(game.seed);
    for (const a of game.events as Event[]) {
      if (a.type !== "next" && actionError(s, a))
        throw Error("Illegal source action");
      if (a.type !== "next" && moves++ % 2 === 0) {
        const v = playerView(s, s.current, h),
          features = rowFeatures(v),
          chosen = features.actions.findIndex(
            (x) =>
              JSON.stringify(x) === JSON.stringify(dmcAction(v.observation, a)),
          );
        if (chosen < 0) throw Error("Missing recorded action");
        rows.push({
          ...features,
          chosen,
          player: s.current,
          seed: game.seed,
          private: [
            ...cardCounts(s.players[1 - s.current].hand)
              .slice(0, 6)
              .map((n) => n / 7),
            s.players[1 - s.current].bonuses.reduce((a, b) => a + b, 0) / 50,
          ],
          hand: cardCounts(s.players[1 - s.current].hand).slice(0, 6),
        });
      }
      const next = a.type === "next" ? nextRound(s) : applyAction(s, a);
      h = [...h, publicEvent(s, next, a)];
      s = next;
    }
    if (s.phase !== "finished") throw Error("Incomplete source game");
    for (const row of rows) {
      appendFileSync(
        `${dir}/${split}.jsonl`,
        JSON.stringify({ ...row, z: s.seals[row.player] >= 2 ? 1 : -1 }) + "\n",
      );
      counts[split]++;
    }
    counts.games++;
  }
}
if ([...seeds.train].some((s) => seeds.dev.has(s))) throw Error("Seed leakage");
writeFileSync(
  `${dir}/dataset.json`,
  JSON.stringify(
    {
      counts,
      seeds: { train: [...seeds.train], dev: [...seeds.dev] },
      sources,
    },
    null,
    2,
  ) + "\n",
);
console.log(counts);
