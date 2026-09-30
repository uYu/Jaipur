// Replay saved matches only. Counterfactuals change one sale and, where stated,
// keep the recorded opponent sale. They are hindsight evidence, not optimality proofs.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  applyAction,
  newGame,
  nextRound,
  actionError,
} from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { GOODS } from "../src/game/types.ts";
import type { State, Event, Action } from "../src/game/types.ts";
const [
  input = "analysis/badcases-2026-09-24/matches.json.gz",
  output = "/tmp/jaipur-audit-cases.json",
] = process.argv.slice(2);
const bytes = readFileSync(input);
const matches = JSON.parse(
  (input.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"),
);
const cases: any[] = [];
const stats: any = {
  matches: 0,
  rounds: 0,
  decisions: 0,
  losingRoundDecisions: 0,
  opponentClosingSaleLosses: 0,
};
const counts = (hand: string[]) =>
  Object.fromEntries(GOODS.map((g) => [g, hand.filter((x) => x === g).length]));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
function describe(s: State, a: Action) {
  if (a.type === "take") return { type: a.type, good: s.market[a.index] };
  if (a.type === "exchange")
    return {
      type: a.type,
      take: a.market.map((i) => s.market[i]),
      give: a.hand.map((i) => s.players[s.current].hand[i]),
      camels: a.camels,
    };
  if (a.type === "camels")
    return {
      type: a.type,
      count: s.market.filter((c) => c === "camel").length,
    };
  return a;
}
function sales(s: State): Action[] {
  return GOODS.flatMap((g) =>
    Array.from(
      { length: s.players[s.current].hand.filter((x) => x === g).length },
      (_, i) => i + 1,
    )
      .filter((n) => n >= (GOODS.indexOf(g) < 3 ? 2 : 1))
      .map((count) => ({ type: "sell" as const, good: g, count })),
  );
}
for (let mi = 0; mi < matches.length; mi++) {
  const match = matches[mi];
  const events: Event[] = match.events;
  let final = newGame(match.seed);
  for (const e of events)
    final = e.type === "next" ? nextRound(final) : applyAction(final, e);
  if (final.phase !== "finished") throw Error(`Incomplete match ${mi}`);
  stats.matches++;
  stats.rounds += final.results.length;
  let s = newGame(match.seed);
  const past: Event[] = [];
  const trace: any[] = [];
  const previousOwn: any[] = [null, null];
  for (let index = 0; index < events.length; index++) {
    const a = events[index];
    if (a.type === "next") {
      s = nextRound(s);
      past.push(a);
      previousOwn.fill(null);
      trace.length = 0;
      continue;
    }
    const actor = s.current;
    const profile = actor === match.seat ? match.candidate : match.baseline;
    const actual = applyAction(s, a);
    const lost = final.results[s.round - 1].winner === 1 - actor;
    stats.decisions++;
    stats.losingRoundDecisions += Number(lost);
    const next = events[index + 1];
    const near =
      GOODS.filter((g) => s.tokens[g].length === 0).length >= 2 ||
      s.deck.length <= 2;
    const saleOptions = lost && near ? sales(s) : [];
    const immediate = saleOptions
      .map((action) => ({ action, result: applyAction(s, action) }))
      .filter(
        (x) =>
          x.result.phase !== "playing" &&
          x.result.results.at(-1)!.winner === actor,
      );
    let closing: State | undefined;
    if (lost && actual.phase === "playing" && next?.type === "sell") {
      const end = applyAction(actual, next);
      if (end.phase !== "playing") {
        closing = end;
        stats.opponentClosingSaleLosses++;
      }
    }
    const replies = closing
      ? sales(s)
          .map((action) => {
            let result = applyAction(s, action);
            if (result.phase === "playing") {
              if (actionError(result, next as Action)) return null;
              result = applyAction(result, next as Action);
            }
            return result.phase === "playing" ? null : { action, result };
          })
          .filter((x) => x !== null)
      : [];
    const rescued = replies.filter(
      (x) => x!.result.results.at(-1)!.winner === actor,
    );
    const previous = previousOwn[actor];
    const reversal =
      lost &&
      a.type === "exchange" &&
      previous?.round === s.round &&
      previous?.action.type === "exchange"
        ? GOODS.filter(
            (g) =>
              previous.taken.includes(g) &&
              a.hand.some((i) => s.players[actor].hand[i] === g) &&
              s.players[actor].hand.filter((x) => x === g).length >= 3,
          )
        : [];
    if (immediate.length || closing || reversal.length) {
      const o = observe(s, past, 0.75);
      const record: any = {
        match: mi,
        source: match.source,
        seed: match.seed,
        seat: match.seat,
        budget: match.budget,
        index,
        round: s.round,
        turn: s.turn,
        actor,
        profile,
        kind: immediate.length
          ? "declined_immediate_win"
          : rescued.length
            ? "sale_before_recorded_close_wins"
            : closing
              ? "unconverted_before_close"
              : "set_reversal",
        hand: counts(s.players[actor].hand),
        ownCamels: s.players[actor].camels,
        knownOpponent: o.knownOpponentHand,
        opponentCount: o.opponentHandCount,
        inferredCloseProbability: o.opponentNextSaleCloseProbability,
        market: s.market,
        tokens: s.tokens,
        deckCount: s.deck.length,
        ownGoods: sum(s.players[actor].goods),
        ownBonuses: s.players[actor].bonuses,
        opponentGoods: sum(s.players[1 - actor].goods),
        bonusCounts: o.bonusCounts,
        actualAction: describe(s, a),
        rawAction: a,
        reply: next?.type === "sell" ? next : null,
        roundResult: final.results[s.round - 1],
        hiddenForPostmortem: {
          opponentHand: counts(s.players[1 - actor].hand),
          opponentCamels: s.players[1 - actor].camels,
          opponentBonuses: s.players[1 - actor].bonuses,
        },
        immediateWins: immediate.map((x) => ({
          action: x.action,
          result: x.result.results.at(-1),
        })),
        saleCounterfactuals: replies.map((x) => ({
          action: x!.action,
          result: x!.result.results.at(-1),
        })),
        trace: trace.slice(-8),
        previousOwn: previous,
        reversedGoods: reversal,
      };
      cases.push(record);
    }
    trace.push({
      index,
      actor,
      profile,
      action: describe(s, a),
      handBefore: counts(s.players[actor].hand),
      camelsBefore: s.players[actor].camels,
    });
    previousOwn[actor] = {
      index,
      round: s.round,
      action: describe(s, a),
      taken: a.type === "exchange" ? a.market.map((i) => s.market[i]) : [],
      handAfter: counts(actual.players[actor].hand),
    };
    s = actual;
    past.push(a);
  }
}
const byKind: any = {};
const byProfile: any = {};
for (const c of cases) {
  byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const k = c.profile + " / " + c.kind;
  byProfile[k] = (byProfile[k] ?? 0) + 1;
}
writeFileSync(
  output,
  JSON.stringify({ stats, byKind, byProfile, cases }, null, 2),
);
console.log(JSON.stringify({ stats, byKind, byProfile }, null, 2));
