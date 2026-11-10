import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replayValuePoints } from "../src/game/replay-value.ts";
import { DouzeroNetwork } from "../src/game/douzero-network.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import { dmcAction, dmcActions, dmcState } from "../src/game/dmc.ts";
import { dmcEventHistory } from "../src/game/dmc-history.ts";
import { advance, replay } from "../src/game/storage.ts";
import { newGame } from "../src/game/engine.ts";
import type { Save } from "../src/game/types.ts";

function completedSave(seed: number, targetSeals: 1 | 2): Save {
  const result: Save = {
    version: 1,
    seed,
    targetSeals,
    difficulty: "easy",
    events: [],
  };
  let state = newGame(seed, targetSeals);
  while (state.phase !== "finished" && result.events.length < 400) {
    const event =
      state.phase === "roundEnd"
        ? { type: "next" as const }
        : chooseAction(observe(state), "easy");
    result.events.push(event);
    state = advance(state, event);
  }
  assert.equal(state.phase, "finished");
  return result;
}
const save = completedSave(66980, 1);

test("replay evaluation only scores your decisions with the same public inputs as the opponent model", () => {
  const expected: {
    history: number[][];
    state: number[];
    actions: number[][];
  }[] = [];
  let state = newGame(save.seed, 1);
  for (let i = 0; i <= save.events.length; i++) {
    if (state.phase === "playing" && state.current === 0) {
      const observation = observe(state, save.events.slice(0, i), 0.75);
      expected.push({
        history: dmcEventHistory(save.seed, save.events.slice(0, i), 0),
        state: dmcState(observation, {
          ownSeals: 0,
          opponentSeals: 0,
          round: 0,
        }),
        actions: dmcActions(observation).map((a) => dmcAction(observation, a)),
      });
    }
    if (save.events[i]) state = advance(state, save.events[i]);
  }
  let calls = 0;
  const points = [
    ...replayValuePoints(save, {
      score(history, state, actions) {
        assert.deepEqual({ history, state, actions }, expected[calls++]);
        return Float32Array.from(actions.map((_, i) => i / actions.length));
      },
    }),
  ];
  assert.equal(calls, expected.length);
  assert.equal(points.length, save.events.length + 1);
  assert.deepEqual(
    points.map((p) => p.index),
    points.map((_, i) => i),
  );
  let decisions = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.decision) {
      decisions++;
      assert.ok(p.decision.loss >= 0);
      assert.equal(
        p.decision.loss,
        p.decision.bestValue - p.decision.actualValue,
      );
      if (i < points.length - 1) assert.equal(p.value, p.decision.actualValue);
    }
  }
  assert.equal(decisions, calls);
  const winner = replay(save).results.at(-1)!.winner;
  assert.equal(
    points.at(-1)!.value,
    winner === null ? 0 : winner === 0 ? 1 : -1,
  );
});

test("unfinished games cannot expose the analysis or call the model", () => {
  assert.throws(
    () => [
      ...replayValuePoints(
        { ...save, events: [] },
        {
          score() {
            assert.fail("model must not run during a live match");
          },
        },
      ),
    ],
    /比赛结束/,
  );
});

test("invalid model output is reported rather than drawn as a value curve", () => {
  assert.throws(
    () => [
      ...replayValuePoints(save, {
        score(_history, _state, actions) {
          return Float32Array.from(actions.map(() => NaN));
        },
      }),
    ],
    /有效评分/,
  );
});

test("the actual shipped model produces finite values and selected-action differences without altering the save", () => {
  const bytes = readFileSync(
    new URL("../src/game/models/legacy-round-114824.bin", import.meta.url),
  );
  const model = new DouzeroNetwork(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const before = JSON.stringify(save);
  const points = [...replayValuePoints(save, model)];
  assert.equal(model.version, 114824);
  assert.ok(points.some((p) => p.decision && p.decision.loss > 0.05));
  for (const p of points)
    assert.ok(p.value === null || Number.isFinite(p.value));
  assert.equal(JSON.stringify(save), before);
  // The first selected Q stays in your perspective while the opponent is to act.
  const chosen = points.find((p) => p.decision && p.index < points.length - 1)!;
  assert.equal(chosen.value, chosen.decision!.actualValue);
});

test("round boundaries reset predictions and a rival opening never becomes a rival-perspective value", () => {
  const match = completedSave(1000, 2);
  assert.equal(newGame(match.seed).current, 1);
  const points = [
    ...replayValuePoints(match, {
      score(_history, _state, actions) {
        return Float32Array.from(actions.map(() => 0.4));
      },
    }),
  ];
  let state = newGame(match.seed, 2);
  let ownDecision = false;
  let roundEnds = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    assert.equal(p.round, state.round);
    if (state.phase !== "playing") {
      roundEnds++;
      const winner = state.results.at(-1)!.winner;
      assert.equal(p.value, winner === null ? 0 : winner === 0 ? 1 : -1);
    } else if (state.current === 0 || ownDecision) {
      assert.ok(Math.abs(p.value! - 0.4) < 1e-6);
    } else assert.equal(p.value, null);
    const event = match.events[i];
    if (!event) break;
    if (state.current === 0 && event.type !== "next") ownDecision = true;
    if (event.type === "next") ownDecision = false;
    state = advance(state, event);
  }
  assert.ok(roundEnds >= 2);
});
