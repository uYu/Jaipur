import { observe } from "./ai.ts";
import type { Observation } from "./ai.ts";
import { COUNTS, sum } from "./data.ts";
import { dmcActions } from "./dmc.ts";
import { applyAction } from "./engine.ts";
import {
  findImmediateWinningAction,
  publicRoundBounds,
} from "./immediate-win.ts";
import { GOODS } from "./types.ts";
import type { Action, Card, State } from "./types.ts";

const CARDS: Card[] = [...GOODS, "camel"];
const TIERS = [3, 4, 5] as const;
type Tier = (typeof TIERS)[number];
type Budget = { maxNodes?: number; maxMs?: number };
const exhausted = Symbol("endgame proof budget exhausted");

/** Own move, every opposing reply, then an immediate win on our next move.
 * Incomplete proofs always fall back to the model; no sampled world can prove a win.
 */
export function findEndgameWinningAction(
  o: Observation,
  budget: Budget = {},
): Action | undefined {
  const immediate = findImmediateWinningAction(o);
  if (immediate) return immediate;
  if (o.deckCount > 3 && GOODS.filter((g) => !o.tokens[g].length).length < 2)
    return undefined;
  const bounds = publicRoundBounds(o);
  if (
    !bounds ||
    !Number.isInteger(bounds.opponentCamels) ||
    bounds.opponentCamels < 0
  )
    return undefined;

  const deadline = performance.now() + (budget.maxMs ?? 20);
  const maxNodes = budget.maxNodes ?? 2_000;
  let nodes = 0;
  function visit() {
    if (++nodes > maxNodes || performance.now() >= deadline) throw exhausted;
  }

  const pool = GOODS.map(
    (g) =>
      COUNTS[g] -
      [...o.hand, ...o.market, ...o.discard].filter((c) => c === g).length,
  );
  const known = GOODS.map(
    (g) => o.knownOpponentHand.filter((c) => c === g).length,
  );
  const deckCamels =
    COUNTS.camel -
    o.camels -
    bounds.opponentCamels -
    o.market.filter((c) => c === "camel").length;
  if (
    pool.some((n, g) => n < known[g]) ||
    deckCamels < 0 ||
    sum(pool) + deckCamels !== o.opponentHandCount + o.deckCount
  )
    return undefined;

  // Enumerate every hand consistent with card conservation and publicly known
  // cards. Deliberately ignore posterior weights and pruning of rare hands.
  function* hands(
    g = 0,
    left = o.opponentHandCount,
    hand: number[] = [],
  ): Generator<number[]> {
    visit();
    if (g === 6) {
      if (left === 0) yield hand;
      return;
    }
    for (let n = known[g]; n <= Math.min(left, pool[g]); n++)
      yield* hands(g + 1, left - n, [...hand, n]);
  }

  function world(hand: number[], draw?: { tier: Tier; value: number }): State {
    const bonus = structuredClone(bounds!.pools);
    const opponentBonuses: number[] = [];
    for (const tier of TIERS) {
      const count = bonus[tier].length - o.bonusCounts[tier];
      if (draw?.tier === tier)
        bonus[tier].splice(bonus[tier].indexOf(draw.value), 1);
      opponentBonuses.push(
        ...bonus[tier].splice(bonus[tier].length - count, count),
      );
      if (draw?.tier === tier) bonus[tier].push(draw.value);
    }
    return {
      seed: 0,
      rng: 0,
      round: 1,
      turn: o.turn,
      current: 0,
      starter: 0,
      players: [
        {
          hand: [...o.hand],
          camels: o.camels,
          goods: [...o.goods],
          bonuses: [...o.bonuses],
        },
        {
          hand: GOODS.flatMap((g, i) => Array(hand[i]).fill(g)),
          camels: bounds!.opponentCamels,
          goods: [...o.opponentGoods],
          bonuses: opponentBonuses,
        },
      ],
      deck: [
        ...GOODS.flatMap((g, i) => Array(pool[i] - hand[i]).fill(g)),
        ...Array<Card>(deckCamels).fill("camel"),
      ],
      market: [...o.market],
      discard: [...o.discard],
      tokens: structuredClone(o.tokens),
      bonus,
      seals: [0, 0],
      results: [],
      phase: "playing",
      log: [],
    };
  }

  // Refill multisets suffice: subsequent legal moves and scores depend on card
  // faces, not market order. The returned first move still uses the real indices.
  function* transitions(s: State, action: Action): Generator<State> {
    const count = Math.min(
      s.deck.length,
      action.type === "take"
        ? 1
        : action.type === "camels"
          ? s.market.filter((c) => c === "camel").length
          : 0,
    );
    if (!count) {
      visit();
      yield applyAction(s, action);
      return;
    }
    const available = CARDS.map(
      (c) => s.deck.filter((card) => c === card).length,
    );
    const drawn = Array<number>(7).fill(0);
    function* choose(g: number, left: number): Generator<State> {
      visit();
      if (g === 7) {
        if (left) return;
        const remaining = CARDS.flatMap((c, i) =>
          Array<Card>(available[i] - drawn[i]).fill(c),
        );
        const refill = CARDS.flatMap((c, i) => Array<Card>(drawn[i]).fill(c));
        yield applyAction({ ...s, deck: [...remaining, ...refill] }, action);
        return;
      }
      for (let n = 0; n <= Math.min(left, available[g]); n++) {
        drawn[g] = n;
        yield* choose(g + 1, left - n);
      }
    }
    yield* choose(0, count);
  }

  function winsAfterReply(s: State) {
    visit();
    const view = observe({ ...s, current: 0 });
    if (s.phase !== "playing")
      return publicRoundBounds(view)?.wins(view.camels) ?? false;
    // A public-information proof here prevents choosing a different last move
    // based on an opponent hand that the player cannot actually see.
    return findImmediateWinningAction(view) !== undefined;
  }

  function survives(s: State) {
    if (s.phase !== "playing") return winsAfterReply(s);
    for (const reply of dmcActions(observe(s)))
      for (const after of transitions(s, reply))
        if (!winsAfterReply(after)) return false;
    return true;
  }

  try {
    const actions = dmcActions(o);
    // Cashing out one set before closing with another is a common two-move win.
    actions.sort(
      (a, b) => Number(b.type === "sell") - Number(a.type === "sell"),
    );
    for (const action of actions) {
      visit();
      const tier =
        action.type === "sell" && action.count >= 3
          ? (Math.min(5, action.count) as Tier)
          : undefined;
      const draws =
        tier !== undefined && o.bonusCounts[tier] > 0
          ? [...new Set(bounds.pools[tier])].map((value) => ({ tier, value }))
          : [undefined];
      let complete = true,
        sawWorld = false;
      for (const hand of hands()) {
        sawWorld = true;
        for (const draw of draws) {
          for (const next of transitions(world(hand, draw), action)) {
            if (!survives(next)) {
              complete = false;
              break;
            }
          }
          if (!complete) break;
        }
        if (!complete) break;
      }
      if (sawWorld && complete) return action;
    }
  } catch (error) {
    if (error !== exhausted) throw error;
  }
  return undefined;
}
