import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseDifficulty,
  opponentPolicy,
  DIFFICULTY_NAME,
} from "../src/game/difficulty.ts";
import { parseSave, replay } from "../src/game/storage.ts";
import { createTutorialSave, TUTORIAL_ACTIONS } from "../src/game/tutorial.ts";
import { readPreferences, writePreferences } from "../src/game/preferences.ts";
import { observe } from "../src/game/ai.ts";
import { dmcEventHistory } from "../src/game/dmc-history.ts";
import { actionError, newGame } from "../src/game/engine.ts";
import { DouzeroNetwork } from "../src/game/douzero-network.ts";
import { chooseDouzeroActionFromModel } from "../src/game/douzero-browser.ts";

test("the three visible difficulty levels retain the requested opponent policies", () => {
  assert.deepEqual(
    ["easy", "normal", "hard"].map((d) => DIFFICULTY_NAME[d]),
    ["入门", "中等", "高难"],
  );
  assert.equal(opponentPolicy("easy"), "heuristic");
  assert.equal(opponentPolicy("normal"), "tactical");
  assert.equal(opponentPolicy("hard"), "model");
  assert.equal(opponentPolicy("experimental"), "model");
  for (const invalid of [null, undefined, 0, "master", {}, []])
    assert.equal(parseDifficulty(invalid), null);
});

test("old experimental saves become high difficulty without changing any replayed actions", () => {
  const legacy = {
    ...createTutorialSave(),
    difficulty: "experimental" as const,
    events: TUTORIAL_ACTIONS,
  };
  const imported = parseSave(JSON.stringify(legacy));
  assert.equal(imported.difficulty, "hard");
  assert.deepEqual(replay(imported), replay(legacy));
  assert.equal(
    parseSave(JSON.stringify({ ...legacy, difficulty: "hard" })).difficulty,
    "hard",
  );
});

test("saved preferences migrate the old model level and write only the new name", () => {
  const original = globalThis.localStorage;
  let stored = JSON.stringify({ difficulty: "experimental", targetSeals: 2 });
  globalThis.localStorage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  } as Storage;
  try {
    assert.deepEqual(readPreferences(), { difficulty: "hard", targetSeals: 2 });
    writePreferences({ difficulty: "experimental", targetSeals: 1 });
    assert.deepEqual(JSON.parse(stored), {
      difficulty: "hard",
      targetSeals: 1,
    });
    stored = JSON.stringify({ difficulty: "invalid" });
    assert.deepEqual(readPreferences(), {
      difficulty: "normal",
      targetSeals: 1,
    });
  } finally {
    globalThis.localStorage = original;
  }
});

test("the actual high difficulty worker uses the former experimental model", async () => {
  const bytes = readFileSync(
    new URL("../src/game/models/legacy-round-147126.bin", import.meta.url),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const model = new DouzeroNetwork(buffer);
  const state = newGame(66980, 1);
  const observation = observe(state, [], 0.75);
  const history = dmcEventHistory(state.seed, [], state.current);
  const expected = chooseDouzeroActionFromModel(model, observation, history);
  const previousSelf = globalThis.self;
  const previousFetch = globalThis.fetch;
  const messages: any[] = [];
  const worker = {
    postMessage: (message: unknown) => messages.push(message),
    onmessage: null as any,
  };
  globalThis.self = worker as any;
  globalThis.fetch = async () => new Response(buffer);
  try {
    await import("../src/game/ai.worker.ts");
    for (const difficulty of ["hard", "experimental"]) {
      await worker.onmessage({
        data: { difficulty, observation, history },
      });
      const reply = messages.at(-1);
      assert.equal(reply.error, undefined);
      assert.match(reply.algorithm, /v147126/);
      assert.deepEqual(reply.action, expected);
      assert.equal(actionError(state, reply.action), null);
    }
  } finally {
    globalThis.self = previousSelf;
    globalThis.fetch = previousFetch;
  }
});
