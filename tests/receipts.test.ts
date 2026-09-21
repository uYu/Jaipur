import test from "node:test";
import assert from "node:assert/strict";
import { newGame, legalActions } from "../src/game/engine.ts";
import { advance } from "../src/game/storage.ts";
import { saleReceipts } from "../src/game/receipts.ts";
import { chooseAction, observe } from "../src/game/ai.ts";
import type { Save } from "../src/game/types.ts";
test("last sale denominations survive reload and are scoped to replay position and round", () => {
  const save: Save = { version: 1, seed: 7, difficulty: "normal", events: [] };
  let s = newGame(7);
  while (s.phase === "playing") {
    const event = chooseAction(observe(s), "normal");
    save.events.push(event);
    s = advance(s, event);
  }
  const r = saleReceipts(save);
  assert.ok(r.some(Boolean));
  assert.deepEqual(saleReceipts(JSON.parse(JSON.stringify(save))), r);
  assert.deepEqual(saleReceipts(save, 0), [null, null]);
  for (const receipt of r)
    if (receipt) {
      assert.ok(receipt.coins.length > 0);
      if (receipt.actor === 1)
        assert.ok(receipt.bonus === null || receipt.bonus === "hidden");
    }
  save.events.push({ type: "next" });
  assert.deepEqual(saleReceipts(save), [null, null]);
  assert.ok(legalActions(advance(s, { type: "next" })).length > 0);
});
