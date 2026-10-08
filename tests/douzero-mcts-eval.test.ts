import test from "node:test";
import assert from "node:assert/strict";
import { parseMctsSummary } from "../scripts/douzero-mcts-eval.ts";

test("periodic MCTS summary validates completed matches and equal search budget", () => {
  const summary = {
    comparison: "equal-search-count", fixedIterationsPerTree: 1024, wins: [17, 23],
  };
  const log = 'Python scorer ready\n{"seed":3900020000}\n' +
    JSON.stringify(summary, null, 2) + '\nScorer closed\n';
  assert.deepEqual(parseMctsSummary(log, 20, 1024), summary);
  assert.throws(() => parseMctsSummary(log, 10, 1024), /Incomplete/);
  assert.throws(() => parseMctsSummary(log, 20, 128), /mismatched/);
  assert.throws(() => parseMctsSummary(JSON.stringify({
    ...summary, comparison: "equal-time",
  }), 20, 1024), /mismatched/);
});
