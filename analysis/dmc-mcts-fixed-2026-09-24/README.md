# 固定搜索次数：MCTS + DMC 对比

按用户要求，主要对比口径改为相同搜索次数，耗时作为附加成本记录。

三档均已完成，胜负依次为 **10:6、9:7、10:6**；每档 16 场，全部独立回放验证。汇总见 [RESULTS.md](RESULTS.md)，最终以 `verification.log` 和包含三档结果的 `evaluation-summary.json` 为准。跨实验的方法、数据和后续计划见 [DMC 实验交接](../../docs/DMC_RESEARCH.md)。

## 控制条件

- 候选：`dmcMcts`，50% DMC 根先验 + 50% 原先验。
- 基线：`guidedBehavior`，原先验与原 rollout。
- 冻结模型：`analysis/dmc-10m-2026-09-24/model-612.pt`；DMC 温度 0.2、5% 均匀先验质量。
- 双方都是 8 棵采样树，每棵树分别固定 256、1,024、4,096 次迭代；每个决策总计 2,048、8,192、32,768 次搜索。
- 时间限制设为 0（关闭）；融合版也关闭超时后直接用 DMC 动作的回退。观察与网络推理不减少搜索次数。
- C++ 实际计数每次搜索迭代，评测端在**每一个决策**断言 `simulations == 8 * iterationsPerTree`，不符立即失败。
- 三档均使用 9101–9108 共 8 个相同种子，交换先后手，完整打到比赛结束；每档 16 场，共 48 场。
- 对齐的是完整 MCTS 迭代数，不要求两方的树深、展开节点数或 rollout 长度相同，这些由搜索路径决定。

`JAIPUR_BENCH_ITERATIONS` 启用此模式。旧 CLI 最后一个毫秒参数在该模式下不作为截止时间；结果中的 `comparison=equal-search-count`、`timeLimitMs=null` 和 `simulationsPerDecision` 标明实际口径。

## 数据与校验

逐局结果与完整事件日志保存在 `count-*-result.json` 和 `count-*-games.jsonl`。三档跑完后，程序自动独立回放所有对局，检查行动合法性、终局、胜负及种子配对，生成 `evaluation-summary.json`。

复现示例：

```sh
JAIPUR_DMC_CHECKPOINT=analysis/dmc-10m-2026-09-24/model-612.pt \
JAIPUR_BENCH_ITERATIONS=1024 \
node --experimental-strip-types scripts/benchmark-native.ts dmcMcts guidedBehavior 9101 8 50
```

未更改默认 AI，未根据这批测试选择新温度或混合系数。
