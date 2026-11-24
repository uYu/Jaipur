import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DouzeroNetwork } from '../src/game/douzero-network.ts';
import { DEFAULT_DOUZERO_MODEL_URL } from '../src/game/douzero-browser.ts';
test('Top5 browser scores match PyTorch with empty, partial and full history', () => {
  const bytes = readFileSync(DEFAULT_DOUZERO_MODEL_URL);
  const model = new DouzeroNetwork(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const cases = JSON.parse(readFileSync(new URL('./fixtures/tfhand-top5-parity.json', import.meta.url), 'utf8'));
  for (const c of cases) {
    const actual = model.score(c.history, c.state, c.actions);
    actual.forEach((score, i) => assert.ok(Math.abs(score-c.scores[i]) < 0.00003, `${score} vs ${c.scores[i]}`));
    assert.equal(actual.indexOf(Math.max(...actual)), c.scores.indexOf(Math.max(...c.scores)));
  }
});
