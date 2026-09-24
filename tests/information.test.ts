import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newGame, nextRound, applyAction } from "../src/game/engine.ts";
import {
  playerView,
  publicEvent,
  structuralBelief,
  sampleState,
  stateFeatures,
  eventFeatures,
} from "../src/game/information.ts";
import type { PublicEvent } from "../src/game/information.ts";
import type { Event } from "../src/game/types.ts";
import {
  informationSearch,
  observationKey,
} from "../src/game/information-search.ts";
import { publicHandDistribution } from "../src/game/hand-belief.ts";
test("sanitized posterior agrees with existing exact filter; samples conserve information", () => {
  const games = readFileSync(
    "tests/fixtures/information-matches.jsonl",
    "utf8",
  )
    .trim()
    .split("\n")
    .slice(0, 3)
    .map((line) => JSON.parse(line));
  let checked = 0;
  for (const game of games) {
    let s = newGame(game.seed),
      h: PublicEvent[] = [],
      events: Event[] = [];
    for (const a of game.events as Event[]) {
      if (s.phase === "playing" && events.length % 7 === 0) {
        for (const p of [0, 1]) {
          const v = playerView(s, p, h),
            worlds = structuralBelief(v),
            old = publicHandDistribution(s, events, p, 0),
            map = new Map(old.map((w) => [w.hand.join(","), w.probability]));
          assert.equal(worlds.length, old.length);
          for (const w of worlds)
            assert.ok(
              Math.abs(w.probability - (map.get(w.hand.join(",")) ?? -1)) <
                1e-8,
            );
          const sampled = sampleState(v, worlds, () => 0.413);
          assert.deepEqual(playerView(sampled, p, h), v);
          assert.equal(
            observationKey(h, playerView(sampled, p, h)),
            observationKey(h, v),
          );
          assert.equal(stateFeatures(v).length, 109);
          const changed = structuredClone(s);
          changed.seed = 123;
          changed.rng = 345;
          changed.deck.reverse();
          changed.bonus[3].reverse();
          changed.players[1 - p].hand.reverse();
          changed.players[1 - p].bonuses = changed.players[1 - p].bonuses.map(
            () => 999,
          );
          assert.deepEqual(playerView(changed, p, h), v);
          checked++;
        }
      }
      const next = a.type === "next" ? nextRound(s) : applyAction(s, a);
      const e = publicEvent(s, next, a);
      assert.equal(eventFeatures(e, 0).length, 32);
      h = [...h, e];
      events = [...events, a];
      s = next;
    }
  }
  assert.ok(checked > 50);
});

test("terminal backup uses root player's full-match result without consulting leaf value", () => {
  const games = readFileSync(
    "tests/fixtures/information-matches.jsonl",
    "utf8",
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  let checked = false;
  for (const game of games) {
    let s = newGame(game.seed),
      history: PublicEvent[] = [];
    for (let i = 0; i < game.events.length; i++) {
      const action = game.events[i];
      if (
        i === game.events.length - 1 &&
        s.seals[0] === 1 &&
        s.seals[1] === 1
      ) {
        const view = playerView(s, s.current, history),
          sample = sampleState(view, structuralBelief(view), () => 0.413),
          terminal = applyAction(sample, action);
        assert.equal(terminal.phase, "finished");
        const network = {
          predict: () => ({
            actions: [action],
            probabilities: [1],
            logits: [0],
            value: 0,
          }),
          value: () => {
            throw Error("Terminal must not call leaf value");
          },
        };
        const result = informationSearch(view, network, {
          budgetMs: 1000,
          iterations: 1,
          depth: 4,
          random: () => 0.413,
        });
        assert.equal(result.stats.completed, 1);
        assert.equal(result.stats.terminals, 1);
        assert.equal(
          result.stats.rootValue,
          terminal.seals[view.player] >= 2 ? 1 : -1,
        );
        checked = true;
        break;
      }
      const next =
        action.type === "next" ? nextRound(s) : applyAction(s, action);
      history = [...history, publicEvent(s, next, action)];
      s = next;
    }
    if (checked) break;
  }
  assert.ok(checked);
});
