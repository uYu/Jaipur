# DMC 自我对局与 MCTS 融合：实验交接

更新日期：2026-09-24。本文是这条研究线的入口；各次运行目录保留原始配置、逐局结果与校验记录。[默认游戏 AI](AI_ALGORITHM.md)仍是原来的搜索策略，DMC 模型及融合策略均**未升版**。

## 当前结论

千万级自我对局使独立行动的 DMC 明显强于训练起点：对普通 AI 的完整比赛从 **40:88** 提升到 **101:27**（两者使用相同的 64 个配对种子，各 128 场）。不过，纯 DMC 对 1 秒及 2 秒 `guidedBehavior` 搜索对手分别为 **0:4**，样本很小，且不支持替代搜索。

把冻结 DMC 只接入 MCTS **根节点先验**后，最可比的固定搜索次数试验在三个预算上分别得到 **10:6、9:7、10:6**。每档仅 8 个种子、交换先后手，共 16 场；三档复用同一组种子，不能合成 48 场独立样本。当前有继续扩样的正向信号，尚无足够证据认为棋力稳定提升。训练选模和评测汇总均标记 `promoted: false`。

## 方法与输入

| 环节 | 当前实现 |
| --- | --- |
| 信息边界 | 每次真实决策使用 AI 可见的公开观察、公开行动维护的手牌后验、比赛印章与轮次；不读取真实对手手牌或牌堆顺序。146 维观察加 24 维行动特征。 |
| 行动空间 | 枚举规则允许的所有完整行动，包括每种合法卖牌数量与交换组合；网络逐项评分，不剪枝。 |
| DMC 目标 | ε-greedy 自我对局，给实际执行的行动赋整场比赛胜负回报，按当时行动玩家视角取 ±1；用回归训练 Q。没有 MCTS 标签或 TD bootstrap。 |
| 网络与训练 | 共享 170→128→128→1 网络；RMSprop，学习率 `1e-4`，`alpha=0.99`、`eps=1e-5`，每批 128 场、16 个同步环境、4 个 epoch、minibatch 256、梯度裁剪 40。千万级续训 ε=0.1；超过 700 手且未结束的比赛丢弃，本次为 0。 |
| 模型选择 | 每 50 次更新及末次，用固定 32 个开发种子交换先后手，对普通 AI 打 64 场；按胜负选检查点，同分保留较早版本。MSE 只作训练诊断，不是升版指标。 |
| 搜索融合 | 冻结所选模型，在每个真实根局面对所有合法行动计算 Q；实验性先验为 `0.95 × softmax(Q / 0.2) + 0.05 / 行动数`。`dmcMcts` 将它与原先验各混合 50%。这不是已校准的对手行动概率。 |
| MCTS 其余部分 | 仍采样 8 个隐藏世界，内部节点先验、rollout、单轮终局回报和根访问量选行动均沿用 `guidedBehavior`。DMC 预测整场比赛回报，MCTS 回传单轮结果，故本实验没有混合两种 value，也没有把 DMC 接入 rollout。 |

方法对应代码：[公开输入与行动编码](../src/game/dmc.ts)、[自我对局](../scripts/selfplay-dmc.ts)、[PyTorch 训练与评分](../scripts/dmc-learner.py)、[混合桥接](../scripts/dmc-mcts-client.ts)、[MCTS 根先验](../cpp/mcts.hpp)、[原生搜索接口](../scripts/ai-research.cpp)和[完整比赛评测](../scripts/benchmark-native.ts)。这种将 DMC 用于根先验的接法是本项目实验方案，并非直接复现 DouZero 的部署结构。

## 数据与评测

### 自我对局训练

| 阶段 | 训练数据 | 选模与独立对局 | 原始记录 |
| --- | --- | --- | --- |
| 小规模试跑 | 随机初始化，12 次更新，1,536 场，179,185 条执行行动样本 | 开发集选 `model-006.pt`；对普通 AI 4:28，对随机初始模型 16:0 | [试跑记录](../analysis/dmc-selfplay-2026-09-24/README.md) |
| 千万级续训 | 从试跑**最后的** `model-012.pt` 恢复权重、优化器和随机状态；646 次更新，82,688 场，新增 10,009,435 条样本，0 场截断 | 第 600 次更新的 `model-612.pt` 开发集 51:13；最后 `model-658.pt` 为 48:16。独立对普通 AI 101:27，对续训起点 62:2；对 1 秒及 2 秒搜索对手各 0:4 | [千万级记录](../analysis/dmc-10m-2026-09-24/README.md)、[最终评测](../analysis/dmc-10m-2026-09-24/evaluation-summary.json) |

普通 AI 是 TypeScript `normal`；搜索对手是原生 `guidedBehavior`。所有胜负均为**完整比赛**，并交换先后手。千万级的对普通 AI 测试与起点对照共用 64 个独立于开发集的配对种子；选中模型对起点用另 32 个配对种子。1 秒、2 秒对搜索对手各只有 2 个配对种子，不能据此精确估计相对棋力。[数据复核](../analysis/dmc-10m-2026-09-24/evaluation-verification.json)独立回放了 328 场评测、33,999 次合法行动，并检查训练数量、唯一种子及训练与测试种子不重叠。

### MCTS 融合评测

先做了[等时间探索](../analysis/dmc-mcts-2026-09-24/README.md)：50% 根先验融合在 50 ms 为 4:4（8 场）、1 秒为 2:2（4 场）、2 秒为 3:1（4 场）；100% DMC 根先验在 50 ms 为 2:6（8 场）。不同预算使用不同种子，这只是初筛，不能用于判断预算变化的收益。24 场、2,492 次行动已独立回放。

主要比较改为**固定搜索次数**：[逐档结果](../analysis/dmc-mcts-fixed-2026-09-24/RESULTS.md)与[机器汇总](../analysis/dmc-mcts-fixed-2026-09-24/evaluation-summary.json)。候选 `dmcMcts` 对基线 `guidedBehavior`，同为 8 棵树；禁用时间截止及 DMC 超时回退，每次决策断言实际迭代数相等。三个预算均使用种子 9101–9108，每个种子交换先后手。

| 每棵树迭代数 | 每决策总迭代数 | 候选胜:负 | 候选／基线平均完整决策耗时 |
| ---: | ---: | ---: | ---: |
| 256 | 2,048 | 10:6 | 85.75／83.55 ms |
| 1,024 | 8,192 | 9:7 | 329.53／322.56 ms |
| 4,096 | 32,768 | 10:6 | 1217.84／1204.23 ms |

耗时包括公开观察、DMC 推理与搜索。同迭代数不保证同树深、展开节点数或 rollout 长度；这些随访问路径变化。三个档位共 48 场、5,323 次行动均由[独立校验日志](../analysis/dmc-mcts-fixed-2026-09-24/verification.log)复核，每一步的搜索次数也通过断言。固定种子已用于探索，下一轮应另设未看过的种子作为最终判断依据。

## 产出物与复现入口

| 位置 | 内容与用途 |
| --- | --- |
| [`analysis/dmc-selfplay-2026-09-24/`](../analysis/dmc-selfplay-2026-09-24/README.md) | 小规模试跑的配置、训练日志、对局、批次张量、检查点、选模及数据抽查；续训起点 `model-012.pt` 在这里。 |
| [`analysis/dmc-10m-2026-09-24/`](../analysis/dmc-10m-2026-09-24/README.md) | 千万级训练原始数据、`training.jsonl`、逐批 `batch-*.npz`、逐版本 `model-*.pt`、`selection.json`、`completion.json`、最终评测与校验。原始目录约 1.2 GB，SwanLab 只保存汇总指标，不代替本地模型和逐局数据。 |
| [选中检查点](../analysis/dmc-10m-2026-09-24/model-612.pt) | `model-612.pt`，SHA-256：`cfc00afb26ce064008a20f436d0b433101d27052079ca399f7345818cc3ec85b`。后续比较应固定此文件或明确记录新模型摘要。 |
| [`analysis/dmc-mcts-2026-09-24/`](../analysis/dmc-mcts-2026-09-24/README.md) | 等时间初筛的逐局日志、汇总和回放证据。 |
| [`analysis/dmc-mcts-fixed-2026-09-24/`](../analysis/dmc-mcts-fixed-2026-09-24/README.md) | 固定搜索次数的 `count-*-games.jsonl`、`count-*-result.json`、汇总、校验日志及可读结果。 |

SwanLab：[小规模试跑](https://swanlab.cn/@franzyu/jaipur-dmc/runs/szoxikri)、[千万级训练](https://swanlab.cn/@franzyu/jaipur-dmc/runs/tp9whivk)、[等时间探索](https://swanlab.cn/@franzyu/jaipur-dmc/runs/xe07njxj)、[固定搜索次数](https://swanlab.cn/@franzyu/jaipur-dmc/runs/g4bbb7c0)。连接云端时只从环境变量读取 `SWANLAB_API_KEY`，不要写入仓库。两轮训练的大体积批次、逐版中间检查点及训练对局日志保留本地并由 `.gitignore` 排除；试跑 `model-006.pt`、续训起点 `model-012.pt`、千万级选中与末次检查点，以及体积较小的配置、结果、校验记录可纳入版本控制。备份或迁移研究环境时需单独保存这些未入库原始数据。

从试跑末版重新启动同方案的千万级训练，应使用**新的**输出目录（程序拒绝覆盖已有 `config.json`）：

```sh
DMC_TARGET_SAMPLES=10000000 DMC_EVAL_EVERY=50 DMC_DEV_PAIRS=32 DMC_FINAL_EVAL=1 \
node --experimental-strip-types scripts/selfplay-dmc.ts analysis/dmc-next 2000 128 \
  analysis/dmc-selfplay-2026-09-24/model-012.pt
```

`2000` 是安全更新上限，达到目标样本后停止；独立测试在训练结束后运行。训练与测试种子由脚本固定，重复同一配置主要用于复现流程，不应当作新的独立验证集。

从仓库根目录复现固定次数评测的一个档位：

```sh
python3 -m pip install -r scripts/requirements-dmc.txt
node scripts/build-ai-research.mjs
JAIPUR_DMC_CHECKPOINT=analysis/dmc-10m-2026-09-24/model-612.pt \
JAIPUR_BENCH_ITERATIONS=1024 \
node --experimental-strip-types scripts/benchmark-native.ts dmcMcts guidedBehavior 9101 8 50
```

`JAIPUR_PYTHON` 可指定已安装 PyTorch/NumPy 的解释器。最后的 `50` 是旧 CLI 必填毫秒字段；设置 `JAIPUR_BENCH_ITERATIONS` 后不作时间截止，结果中应看到 `comparison=equal-search-count`、`timeLimitMs=null`、`simulationsPerDecision=8192`。其他档位把每棵树次数改为 256 或 4096。不要用 9101–9108 的重复测试结果当新的独立证据。

## 下一轮迭代

1. 预先登记更多**新**配对种子，继续以完整比赛和交换先后手比较相同搜索次数；按种子对汇报胜负与不确定性，不把复用种子的档位合并为独立样本。然后另测实际 1 秒及更长时间预算下的完整决策成本与胜负。
2. 从逐局日志找融合版输局，区分根先验误排、隐藏牌抽样、卖牌收市风险与 rollout 失误；对代表局面做受控重放。手牌后验尤其应以真实隐藏牌校准“对手下手能否卖牌收市”的概率。
3. 如要测试 DMC rollout 或价值融合，先让模拟路径的**公开历史与后验**随行动正确更新，并解决整场回报与现有单轮 MCTS 回报口径不同的问题。所有候选仍以独立完整对局评估，MSE 只作诊断。
