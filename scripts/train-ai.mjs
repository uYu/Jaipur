import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir =
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research");
const header = execFileSync(
  join(dir, "train"),
  ["100000", "20260922", "margin"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
const path = join(root, "cpp/rollout-weights.hpp");
if (process.argv.includes("--write")) writeFileSync(path, header);
else if (readFileSync(path, "utf8").trim() !== header.trim())
  throw new Error(
    "Training result differs from checked-in weights; inspect before --write.",
  );
console.log(
  "Reproducible model SHA256:",
  createHash("sha256").update(header.trim()).digest("hex"),
);
