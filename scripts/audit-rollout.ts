import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newGame, applyAction, nextRound } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { encodeObservation, decodeAction } from "../src/game/ai-wasm.ts";
import type { Event } from "../src/game/types.ts";

const root = "analysis/badcases-2026-09-24/";
const manifest = JSON.parse(
  readFileSync(root + "selected-cases.json", "utf8"),
).manifest;
const bin = join(
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research"),
  "search",
);
const mode = process.argv[2] ?? "audit";
for (const entry of manifest) {
  const save = JSON.parse(readFileSync(root + entry.save, "utf8"));
  let state = newGame(save.seed);
  const past: Event[] = save.events.slice(0, entry.index);
  for (const e of past)
    state = e.type === "next" ? nextRound(state) : applyAction(state, e);
  const o = observe(state, past, 0.75),
    input = encodeObservation(o, true);
  const line = (n: number) =>
    `${n} ${input.length} ${Array.from(input).join(" ")}\n`;
  if (mode === "audit") {
    const rows = execFileSync(bin, ["audit-replies"], {
      input: line(128),
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    console.log(
      JSON.stringify({
        seed: save.seed,
        index: entry.index,
        actual: save.events[entry.index],
        rows: rows.map((r) => ({
          ...r,
          action: decodeAction(Int32Array.from(r.action), o),
        })),
      }),
    );
  } else {
    const profiles =
      mode === "factor"
        ? ([
            ["guided", 1, 1, 0, 0, 0],
            ["factored", 1, 1, 0, 0, 1],
          ] as const)
        : ([
            ["guided", 1, 1, 0, 0],
            ["noPrior", 0, 1, 0, 0],
            ["randomRollout", 1, 0, 0, 0],
            ["neuralRollout", 1, 1, 1, 0],
            ["tactical", 1, 1, 0, 1],
          ] as const);
    for (const [
      name,
      prior,
      learned,
      neural,
      tactics,
      factor = 0,
    ] of profiles) {
      const args = [
        "audit-search",
        "1.4142135623730951",
        "0",
        "8",
        String(learned),
        process.argv[3] ?? "1000",
        String(prior),
        "0",
        String(neural),
        "0",
        "0",
        "0",
        "0",
        String(tactics),
        String(factor),
      ];
      const r = JSON.parse(
        execFileSync(bin, args, { input: line(1000000), encoding: "utf8" }),
      );
      console.log(
        JSON.stringify({
          seed: save.seed,
          index: entry.index,
          name,
          ...r,
          root: r.root.map((x: any) => ({
            ...x,
            action: decodeAction(Int32Array.from(x.action), o),
          })),
          action: decodeAction(Int32Array.from(r.action), o),
        }),
      );
    }
  }
}
