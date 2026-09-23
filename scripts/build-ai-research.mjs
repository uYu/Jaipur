import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir =
  process.env.JAIPUR_AI_BIN_DIR ?? join(tmpdir(), "jaipur-ai-research");
mkdirSync(dir, { recursive: true });
const flags = ["-std=c++20", "-O3"];
if (process.platform === "darwin") {
  const sdk = execFileSync("xcrun", ["--show-sdk-path"], {
    encoding: "utf8",
  }).trim();
  flags.push("-isystem", join(sdk, "usr/include/c++/v1"));
}
function compile(source, name) {
  execFileSync(
    process.env.CXX ?? "c++",
    [...flags, source, "-o", join(dir, name)],
    { cwd: root, stdio: "inherit" },
  );
}
compile("scripts/ai-research.cpp", "search");
compile("scripts/train-rollout.cpp", "train");
compile("scripts/generate-nn-data.cpp", "generate-nn-data");
compile("scripts/verify-nn.cpp", "verify-nn");

// Pin the original pre-refactor AI. Only add a wall-clock stop, normalize root
// visits by work actually performed, and replace its one-shot CLI with a pipe.
const ref = process.env.JAIPUR_BASELINE_REF ?? "c86381e";
let source = execFileSync("git", ["show", ref + ":cpp/jaipur_ai.cpp"], {
  cwd: root,
  encoding: "utf8",
});
function replaceOnce(from, to) {
  if (source.split(from).length !== 2)
    throw new Error("Unknown baseline source: " + from);
  source = source.replace(from, to);
}
source =
  "#include <chrono>\n#include <string>\ndouble ai_limit_ms=0;\n" + source;
replaceOnce(
  "TreeResult search_tree(const State& root_state, int iterations) {",
  "TreeResult search_tree(const State& root_state, int iterations) {\nconst auto started=std::chrono::steady_clock::now();",
);
replaceOnce(
  "for (int iteration = 0; iteration < iterations; ++iteration) {",
  `for (int iteration = 0; iteration < iterations; ++iteration) {
    if(iteration && iteration%16==0 && ai_limit_ms>0 &&
       std::chrono::duration<double,std::milli>(
         std::chrono::steady_clock::now()-started).count()>=ai_limit_ms/jaipur::TREES) break;`,
);
source = source.replaceAll(
  "edge.visits / static_cast<double>(iterations)",
  "edge.visits / static_cast<double>(result.root.visits)",
);
const cli = source.indexOf("#ifdef JAIPUR_CLI");
if (cli < 0) throw new Error("Baseline CLI not found");
source =
  source.slice(0, cli) +
  `
int main(int argc,char** argv) {
  if(argc>1) ai_limit_ms=std::stod(argv[1]);
  int iterations,length;
  while(std::cin>>iterations>>length) {
    std::vector<int32_t> input(length);
    for(auto& x:input) std::cin>>x;
    jaipur::Observation o;
    if(!jaipur::parse_observation(input.data(),length,o)) return 2;
    const auto start=std::chrono::steady_clock::now();
    const auto decision=jaipur::choose(o,jaipur::hash_input(input.data(),length),iterations);
    int32_t out[16];jaipur::encode_action(decision.action,out);
    std::cout<<"{\\"action\\":[";
    for(int i=0;i<16;i++) std::cout<<(i?",":"")<<out[i];
    std::cout<<"],\\"elapsedMs\\":"
      <<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count()
      <<"}"<<std::endl;
  }
}
`;
const baselineSource = join(dir, "original-timed.cpp");
writeFileSync(baselineSource, source);
compile(baselineSource, "original");
console.log("Research binaries:", dir, "baseline:", ref);
