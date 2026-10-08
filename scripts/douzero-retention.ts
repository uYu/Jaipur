import { readdirSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";

/** Keep the most recent numbered checkpoints and any explicitly protected ones. */
export function pruneDouzeroCheckpoints(
  directory: string,
  maxRecent: number,
  protectedPaths: string[],
) {
  if (!Number.isSafeInteger(maxRecent) || maxRecent < 0)
    throw Error("maxRecent must be a nonnegative integer");
  if (maxRecent === 0) return;
  const names = readdirSync(directory)
    .filter((name) => /^model-\d+\.pt$/.test(name))
    .sort((left, right) => Number(right.slice(6, -3)) - Number(left.slice(6, -3)));
  const protectedNames = new Set(protectedPaths.map((path) => basename(path)));
  for (const name of names.slice(maxRecent))
    if (!protectedNames.has(name)) unlinkSync(join(directory, name));
}
