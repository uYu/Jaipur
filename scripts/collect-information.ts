import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { newGame, applyAction, nextRound } from "../src/game/engine.ts";
import { chooseAction } from "../src/game/ai.ts";
import {
  playerView,
  publicEvent,
  rowFeatures,
  cardCounts,
} from "../src/game/information.ts";
import type { PublicEvent } from "../src/game/information.ts";
import type { Event } from "../src/game/types.ts";
import { InformationNetwork } from "../src/game/information-network.ts";
const [modelPath, pastPath, output, seedText, gamesText] =
    process.argv.slice(2),
  start = Number(seedText),
  count = Number(gamesText);
const model = new InformationNetwork(
    JSON.parse(readFileSync(modelPath, "utf8")),
  ),
  past = new InformationNetwork(JSON.parse(readFileSync(pastPath, "utf8")));
let rng = (start ^ 0xa137cab) >>> 0;
const random = () => {
  rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
  return rng / 4294967296;
};
writeFileSync(output, "");
writeFileSync(output + ".games", "");
let samples = 0;
const wins = [0, 0];
for (let game = 0; game < count; game++) {
  const seed = start + game,
    seat =
      process.env.INFORMATION_BALANCED_SEATS === "1"
        ? (game + Math.floor(game / 10) + Math.floor(start / 100)) % 2
        : game % 2,
    opponent = game % 10 < 5 ? "current" : game % 10 < 9 ? "past" : "normal";
  let s = newGame(seed),
    h: PublicEvent[] = [],
    events: Event[] = [],
    moves = 0;
  const rows: any[] = [];
  while (s.phase !== "finished") {
    if (moves > 1500) throw Error("Unfinished rollout");
    if (s.phase === "roundEnd") {
      const a = { type: "next" } as const,
        next = nextRound(s);
      h = [...h, publicEvent(s, next, a)];
      events.push(a);
      s = next;
      continue;
    }
    const v = playerView(s, s.current, h),
      active = s.current === seat || opponent === "current";
    let action;
    if (!active && opponent === "normal")
      action = chooseAction(v.observation, "normal");
    else {
      const p = (active ? model : past).predict(v);
      let u = random(),
        index = p.actions.length - 1;
      for (let j = 0; j < p.actions.length; j++) {
        u -= p.probabilities[j];
        if (u <= 0) {
          index = j;
          break;
        }
      }
      action = p.actions[index];
      if (active)
        rows.push({
          ...rowFeatures(v),
          chosen: index,
          old_logp: Math.log(p.probabilities[index]),
          player: s.current,
          trajectory: `${seed}:${s.current}`,
          seed,
          private: [
            ...cardCounts(s.players[1 - s.current].hand)
              .slice(0, 6)
              .map((n) => n / 7),
            s.players[1 - s.current].bonuses.reduce((a, b) => a + b, 0) / 50,
          ],
          hand: cardCounts(s.players[1 - s.current].hand).slice(0, 6),
        });
    }
    const next = applyAction(s, action);
    h = [...h, publicEvent(s, next, action)];
    events.push(action);
    s = next;
    moves++;
    if (moves % 10 === 0) {
      const scores = s.players.map(
        (p) =>
          p.goods.reduce((a, b) => a + b, 0) +
          p.bonuses.reduce((a, b) => a + b, 0),
      );
      console.log(
        `[PPO自我对局] seed=${seed} 对手=${opponent} 第${moves}手 第${s.round}轮 筹码分(未计骆驼) ${scores.join(":")} 印章 ${s.seals.join(":")}`,
      );
    }
  }
  const winner = s.seals[0] >= 2 ? 0 : 1;
  wins[winner === seat ? 0 : 1]++;
  for (const r of rows)
    appendFileSync(
      output,
      JSON.stringify({ ...r, z: s.seals[r.player] >= 2 ? 1 : -1 }) + "\n",
    );
  samples += rows.length;
  appendFileSync(
    output + ".games",
    JSON.stringify({ seed, seat, opponent, winner, events }) + "\n",
  );
}
console.log(
  JSON.stringify({ type: "rollout", start, games: count, samples, wins }),
);
