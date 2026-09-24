# DMC 训练提速与 128 次续训

方案在训练前写于 [PLAN.md](PLAN.md)。从上轮**最后**的 `model-658.pt` 恢复权重、优化器及随机状态，完成 128 次更新（版本 659–786），新增 **16,384 场完整自对局、2,059,482 条行动样本**，截断 0 场。每批仍为 128 场、4 个 epoch、ε=0.1；网络、输入和整场比赛回报目标未改。128 批记录耗时合计 574.95 秒，均值 4.49 秒/批，包含定期开发集评测。

## 提速

CPU 分段计时显示，旧实现一批约 23 秒中约 18 秒用于准备观察；其中已知对手牌的推断在每次行动前从开局重放整个公开行动历史。现在按事件数组及观察方缓存重放状态，仅处理新增事件；历史发生分叉时重新计算。手牌后验原有缓存和公开输入语义保持不变。

同一 `model-658.pt`、同一批 128 场、同一开发集的受控复跑：

| 实现 | 每批耗时 | 新样本 | 结果 |
| --- | ---: | ---: | --- |
| 旧版完整重放 | 23.06 秒 | 15,945 | 逐局行动与优化版完全一致 |
| 增量缓存 | 4.73 秒 | 15,945 | 训练 MSE 及更新后的模型权重完全一致 |

这是一批的本机实测，约 **4.88 倍提速**；摘要在 [speed-check.json](speed-check.json)。另对多局、跨回合及历史分叉做了缓存与新鲜重放的对照测试。训练过程的实际均值是 4.49 秒/批，不应把受控单批倍数当作所有机器或所有阶段的保证。

## 模型选择与独立评测

开发集为新种子 3,000,100,000–3,000,100,031，交换座位，共 64 场。起点 658 版是 **45:19**；每 16 次更新评测一次，按胜负选择且同分保留较早版本。第 80 次更新的 `model-738.pt` 为最佳，**50:14**；末版 `model-786.pt` 为 **46:18**。这只是选模数据。

| 独立完整比赛（各 32 个种子，交换座位） | 候选胜:负 |
| --- | ---: |
| 新选中 `model-738.pt` 对普通 AI | 51:13 |
| 旧最佳 `model-612.pt` 对普通 AI，使用同一组种子 | 48:16 |
| 新选中 `model-738.pt` 直接对旧最佳 `model-612.pt` | 33:31 |

直接对战按种子为新模型 2:0 九个、1:1 十五个、旧模型 2:0 八个；配对双侧精确检验 `p=1`。以种子为独立单位的 95% Hoeffding 保守区间为新模型胜率 **27.6%–75.6%**。因此新模型有继续研究价值，但这批数据不足以证明它稳定强于旧最佳。`model-612.pt` 仍是已有研究中的基准检查点；浏览器默认 AI 未变更。

## 数据与校验

- [verification.json](verification.json)核对了 128 次更新、16,384 个不重复训练种子、样本累计数和开发集选模，抽样回放 9 场训练比赛；独立回放全部 **192 场测试比赛、21,641 次行动**，核对合法性、终局、胜负及种子座位配对。
- `progress.json` 是最后一批参数更新前的进度快照；最终累计数以 `completion.json` 和 `training.jsonl` 为准。
- [paired-analysis.json](paired-analysis.json)保存直接对战的按种子结果及不确定性。原始测试逐局日志为 `selected-normal.games.jsonl`、`prior-normal.games.jsonl`、`selected-prior.games.jsonl`；对应 `.json` 为机器汇总。
- [evaluation-summary.json](evaluation-summary.json)集中保存训练、模型选择、三组评测与校验结果，`promoted: false`。
- 选中模型 [model-738.pt](model-738.pt) SHA-256：`d58d5a5b5dcb3af435cb1ff4fca7231158d65c085af9bcbe4821a3c3b8031f3f`；末版 [model-786.pt](model-786.pt) SHA-256：`fb2a12d1bd9a55e7cca68e51b229e8aeda5a0f9cfe27bd76d959e7c26f5aed59`。原始训练对局、每批张量和中间检查点留在本地，并由 `.gitignore` 排除。

训练曲线与上述汇总指标已补传至私有 [SwanLab 实验](https://swanlab.cn/@franzyu/jaipur-dmc/runs/0iy069d6)；原始对局和模型文件仍留本地。

复现训练需安装 PyTorch 和 NumPy，使用**新输出目录**：

```sh
JAIPUR_PYTHON=/path/to/python DMC_DEV_SEED=3000100000 \
DMC_EVAL_EVERY=16 DMC_DEV_PAIRS=32 \
node --experimental-strip-types scripts/selfplay-dmc.ts analysis/dmc-resume-repro 128 128 \
  analysis/dmc-10m-2026-09-24/model-658.pt
```

这会重复已公开的训练及开发种子，不构成新独立验证。独立测试使用 `scripts/evaluate-dmc.ts`，种子与对手在 [PLAN.md](PLAN.md) 固定；最终可运行 `scripts/verify-dmc-resume.ts <实验目录>` 复核。
