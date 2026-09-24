import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame,
  applyAction,
  nextRound,
  legalActions,
  actionError,
} from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import {
  dmcState,
  dmcAction,
  dmcActions,
  DMC_STATE,
  DMC_ACTION,
} from "../src/game/dmc.ts";
import { random } from "../src/game/data.ts";
import type { Event, Good } from "../src/game/types.ts";

test("DMC actions cover exactly the independent engine legal set, without equivalent-card duplicates", () => {
  let rng = 42,
    positions = 0;
  for (let seed = 6001; seed < 6009; seed++) {
    let s = newGame(seed);
    const events: Event[] = [];
    for (let turn = 0; turn < 80 && s.phase !== "finished"; turn++) {
      if (s.phase === "roundEnd") {
        s = nextRound(s);
        events.push({ type: "next" });
      }
      const o = observe(s, events, true),
        actions = dmcActions(o);
      const keys = actions.map((a) => JSON.stringify(dmcAction(o, a)));
      assert.equal(new Set(keys).size, keys.length);
      assert.deepEqual(
        new Set(keys),
        new Set(legalActions(s).map((a) => JSON.stringify(dmcAction(o, a)))),
      );
      for (const a of actions) assert.equal(actionError(s, a), null);
      const x = dmcState(o, {
        ownSeals: s.seals[s.current],
        opponentSeals: s.seals[1 - s.current],
        round: s.round,
      });
      assert.equal(x.length, DMC_STATE);
      assert.equal(dmcAction(o, actions[0]).length, DMC_ACTION);
      for (let g = 0; g < 6; g++)
        assert.ok(
          Math.abs(
            x.slice(90 + g * 8, 98 + g * 8).reduce((a, b) => a + b, 0) - 1,
          ) < 1e-8,
        );
      assert.equal(Math.round(x[145] * 11), s.players[1 - s.current].camels);
      const [r, n] = random(rng);
      rng = n;
      const a = actions[Math.floor(r * actions.length)];
      s = applyAction(s, a);
      events.push(a);
      positions++;
    }
  }
  assert.ok(positions > 300);
});

test("DMC input is invariant to hidden opponent hand, deck order and bonus values", () => {
  const a = newGame(7421),
    b = structuredClone(a),
    other = 1 - a.current;
  const i = b.deck.findIndex(
    (c) => c !== "camel" && c !== b.players[other].hand[0],
  );
  const old = b.players[other].hand[0];
  b.players[other].hand[0] = b.deck[i] as Good;
  b.deck[i] = old;
  b.deck.reverse();
  a.players[other].bonuses = [a.bonus[3].pop()!];
  b.players[other].bonuses = [b.bonus[3].shift()!];
  const context = { ownSeals: 0, opponentSeals: 0, round: 1 };
  assert.deepEqual(
    dmcState(observe(a, [], true), context),
    dmcState(observe(b, [], true), context),
  );
});
