import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { newGame, applyAction, nextRound } from "../src/game/engine.ts";
import { observe } from "../src/game/ai.ts";
import { encodeObservation } from "../src/game/ai-wasm.ts";
import type { Event } from "../src/game/types.ts";

const [output, ...inputs] = process.argv.slice(2);
const riskOnly = inputs.includes("--risk-only");
const countAt = inputs.indexOf("--iterations-per-tree");
const fixedIterations = countAt < 0 ? 0 : Number(inputs[countAt + 1]);
if (countAt >= 0 && (!Number.isSafeInteger(fixedIterations) || fixedIterations < 1))
  throw Error("--iterations-per-tree requires a positive integer");
const files = inputs.filter((input, i) => input !== "--risk-only" &&
  !(countAt >= 0 && (i === countAt || i === countAt + 1)));
if (!output || !files.length)
  throw Error("Usage: generate-belief-policy-data.ts output.jsonl [--iterations-per-tree N] logs...");
const worker = spawn(
  join(
    process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research"),
    "search",
  ),
  ["teacher", "1.4142135623730951", "0", "8", "1",
    fixedIterations ? "0" : "50", "1"],
);
let pending:
  { resolve: (value: any) => void; reject: (error: Error) => void } | undefined;
createInterface({ input: worker.stdout }).on("line", (line) => {
  const callback = pending;
  pending = undefined;
  try {
    callback?.resolve(JSON.parse(line));
  } catch (error) {
    callback?.reject(error as Error);
  }
});
worker.on("error", (error) => pending?.reject(error));
worker.on("exit", (code) => pending?.reject(Error(`Teacher exited ${code}`)));
worker.stderr.pipe(process.stderr);
writeFileSync(output, "");
let positions = 0,
  games = 0;
try {
  for (const file of files)
    for (const line of readFileSync(file, "utf8").trim().split("\n")) {
      const saved = JSON.parse(line);
      const allEvents = saved.events as Event[];
      let final = newGame(saved.seed);
      for (const event of allEvents)
        final =
          event.type === "next" ? nextRound(final) : applyAction(final, event);
      if (final.phase !== "finished") throw Error("Incomplete match");
      let state = newGame(saved.seed);
      const events: Event[] = [];
      for (const event of allEvents) {
        const riskObservation =
          riskOnly && state.phase === "playing"
            ? observe(state, events, 0.75)
            : undefined;
        const risk = riskObservation?.opponentNextSaleCloseProbability ?? 0;
        // Alternating 7/5-turn spacing covers both actors in each round.
        if (
          state.phase === "playing" &&
          (riskOnly
            ? risk > 1e-6 && risk < 1 - 1e-6
            : state.turn % 12 === 0 || state.turn % 12 === 7)
        ) {
          const encoded = encodeObservation(
            riskObservation ?? observe(state, events, 0.75),
            true,
          );
          const response = new Promise<any>((resolve, reject) => {
            pending = { resolve, reject };
          });
          worker.stdin.write(
            `${fixedIterations || 100000} ${encoded.length} ${Array.from(encoded).join(" ")}\n`,
          );
          const row = await response;
          const result = final.results[state.round - 1];
          row.outcome =
            result.winner === null
              ? 0.5
              : Number(result.winner === state.current);
          row.seed = saved.seed;
          row.seat = saved.seat;
          row.round = state.round;
          row.turn = state.turn;
          row.teacherMs = fixedIterations ? null : 50;
          row.teacherSimulations = fixedIterations ? fixedIterations * 8 : null;
          row.source = file;
          if (row.features.length !== 142 || !row.actions.length)
            throw Error("Invalid teacher features");
          appendFileSync(output, JSON.stringify(row) + "\n");
          positions++;
        }
        state =
          event.type === "next" ? nextRound(state) : applyAction(state, event);
        events.push(event);
      }
      if (++games % 10 === 0)
        console.error(JSON.stringify({ games, positions }));
    }
} finally {
  worker.stdin.end();
}
console.error(JSON.stringify({ output, games, positions }));
