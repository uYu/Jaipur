import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bin =
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research");
const data =
  process.env.JAIPUR_NN_TRAIN_DIR ?? join(tmpdir(), "jaipur-nn-training");
execFileSync("node", ["scripts/build-ai-research.mjs"], {
  cwd: root,
  stdio: "inherit",
});
const write = process.argv.includes("--write");
const args = process.argv.slice(2).filter((arg) => arg !== "--write");
execFileSync(
  process.env.JAIPUR_PYTHON ?? "python3",
  [
    "scripts/train-neural.py",
    "--generator",
    join(bin, "generate-nn-data"),
    "--directory",
    data,
    "--epochs",
    "80",
    "--target",
    "win",
    "--architecture",
    "symmetric",
    "--hidden",
    "64",
    ...args,
  ],
  { cwd: root, stdio: "inherit" },
);
const generated = join(data, "nn-weights.hpp");
const checkedIn = join(root, "cpp/nn-weights.hpp");
// The verifier includes the checked-in header, so copy the candidate only
// after an explicit --write; otherwise verify the already frozen candidate.
if (write) {
  copyFileSync(generated, checkedIn);
  copyFileSync(join(data, "metadata.json"), join(root, "cpp/nn-training.json"));
  execFileSync("node", ["scripts/build-ai-research.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
} else if (
  readFileSync(generated, "utf8") !== readFileSync(checkedIn, "utf8")
) {
  throw new Error(
    "Neural weights changed; inspect the training result before --write.",
  );
}
const metadata = JSON.parse(readFileSync(join(data, "metadata.json"), "utf8"));
execFileSync(
  process.env.JAIPUR_PYTHON ?? "python3",
  [
    "scripts/verify-neural.py",
    "--binary",
    join(bin, "verify-nn"),
    "--header",
    checkedIn,
    "--validation",
    join(
      data,
      `positions-${metadata.data_id}-${metadata.validation_games}-${metadata.seed_validation}.f32`,
    ),
  ],
  { cwd: root, stdio: "inherit" },
);
