/** Compile only the research search and parity binaries for one checkpoint. */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const [headerArg, directoryArg] = process.argv.slice(2);
if (!headerArg || !directoryArg)
  throw Error("Usage: build-belief-policy.mjs weights.hpp binary-directory");
const header = resolve(headerArg), directory = resolve(directoryArg);
mkdirSync(directory, { recursive: true });
const flags = ["-std=c++20", "-O3"];
if (process.platform === "darwin") {
  const sdk = execFileSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" }).trim();
  flags.push("-isystem", join(sdk, "usr/include/c++/v1"));
}
for (const [source, target] of [
  ["scripts/ai-research.cpp", "search-belief"],
  ["scripts/verify-belief.cpp", "verify-belief"],
]) {
  execFileSync(process.env.CXX ?? "c++",
    [...flags, `-DJAIPUR_BELIEF_WEIGHTS_HEADER="${header}"`, source,
      "-o", join(directory, target)],
    { stdio: "inherit" });
}
console.log(JSON.stringify({ header, directory }));
