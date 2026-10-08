import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pruneDouzeroCheckpoints } from "../scripts/douzero-retention.ts";

test("long run keeps recent, initial, best, and latest checkpoints", () => {
  const directory = mkdtempSync(join(tmpdir(), "jaipur-douzero-retention-"));
  try {
    for (const version of [0, 50, 100, 150, 200, 250])
      writeFileSync(join(directory, `model-${version.toString().padStart(3, "0")}.pt`), "checkpoint");
    writeFileSync(join(directory, "training.jsonl"), "metrics");
    pruneDouzeroCheckpoints(directory, 2, [
      join(directory, "model-000.pt"),
      join(directory, "model-100.pt"),
      join(directory, "model-250.pt"),
    ]);
    assert.deepEqual(readdirSync(directory).sort(), [
      "model-000.pt", "model-100.pt", "model-200.pt", "model-250.pt",
      "training.jsonl",
    ]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
