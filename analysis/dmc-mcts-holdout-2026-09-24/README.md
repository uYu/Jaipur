# DMC 根先验：新种子固定次数复核

评测前固定的方案见 [PLAN.md](PLAN.md)。冻结 `model-612.pt` 和原有 50% 根先验融合配置，用此前 MCTS 融合实验未使用的种子 12001–12024；每个种子交换座位。双方每次决策均执行 8 棵树 × 256 次迭代，共 2,048 次搜索，没有时间截止或 DMC 超时回退。

## 结果

| 完整比赛 | 候选 `dmcMcts` | 基线 `guidedBehavior` |
| --- | ---: | ---: |
| 胜场 | 21 | 27 |
| 平均完整决策耗时 | 85.93 ms | 84.90 ms |

24 个配对种子中，候选 2:0 为 4 个、1:1 为 13 个、基线 2:0 为 7 个。候选胜率为 43.75%；把**每个种子**的 0、0.5、1 分作为一个独立观察，Hoeffding 95% 保守区间为 **16.0%–71.5%**。仅看 11 个一边全胜的种子，配对双侧精确检验 `p=0.549`。区间很宽，结果不能证明候选更弱，也没有复现此前 8 个配对种子中 10:6 的正向信号。

此前 9101–9108 的相同 2,048 次搜索档位和本轮种子互不重叠；两批描述性合计为候选 **31:33**，共 32 个配对种子。该合计只适用于这一档搜索次数，不能把其他档位重复使用的种子再当独立样本。当前不支持将 DMC 融合策略升为默认 AI。

## 证据与复现

- [完整对局日志](count-256-games.jsonl)：48 场，逐行动事件；[原始结果](count-256-result.json)含每局结果及完整决策耗时。
- [独立回放](verification.log)验证 48 场、5,216 次行动：动作合法、终局、胜负及种子和座位配对正确。评测程序每一步都断言双方实际搜索次数为 2,048。
- [配对分析](pair-analysis.json)列出每个种子的结果、保守区间与精确检验。模型 SHA-256 为 `cfc00afb26ce064008a20f436d0b433101d27052079ca399f7345818cc3ec85b`。

在仓库根目录，先运行 `node scripts/build-ai-research.mjs`，再用安装了 PyTorch 和 NumPy 的解释器执行：

```sh
JAIPUR_PYTHON=/path/to/python \
JAIPUR_DMC_CHECKPOINT=analysis/dmc-10m-2026-09-24/model-612.pt \
JAIPUR_BENCH_ITERATIONS=256 \
JAIPUR_BENCH_LOG=analysis/dmc-mcts-holdout-2026-09-24/count-256-games.jsonl \
node --experimental-strip-types scripts/benchmark-native.ts dmcMcts guidedBehavior 12001 24 50 \
  > analysis/dmc-mcts-holdout-2026-09-24/count-256-result.json
```

末尾 `50` 是旧 CLI 的必填字段；固定次数模式不会把它用作时间限制。运行会覆盖上面的原始对局日志，复现时宜改用新目录。随后执行 `scripts/verify-dmc-mcts.ts <目录> count-256` 和 `scripts/summarize-dmc-holdout.ts <目录>`。随机搜索结果也可能因运行环境与实现变化而不同。
