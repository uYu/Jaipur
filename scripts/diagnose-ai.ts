import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aiScenarios } from "./ai-scenarios.ts";
import { observe } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";

const samples = Number(process.argv[2] ?? 400);
if (!Number.isInteger(samples) || samples < 1 || samples > 100000)
  throw Error("Usage: diagnose-ai.ts samplesPerAction");
const dir =
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research");
for (const { name, state } of aiScenarios) {
  const o = observe(state),
    x = encodeObservation(o);
  const input = samples + " " + x.length + " " + Array.from(x).join(" ") + "\n";
  const result = spawnSync(join(dir, "search"), ["diagnose"], {
    input,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(result.stderr);
  for (const line of result.stdout.trim().split("\n")) {
    const data = JSON.parse(line);
    data.candidates.forEach((c: { action: number[] }) =>
      Object.assign(c, { action: decodeAction(Int32Array.from(c.action), o) }),
    );
    data.candidates.sort(
      (a: { winScore: number }, b: { winScore: number }) =>
        b.winScore - a.winScore,
    );
    console.log(JSON.stringify({ name, samples, ...data }));
  }
}
