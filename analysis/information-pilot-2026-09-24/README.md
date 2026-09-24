# 信息集策略／价值模型与 PPO 试验

日期：2026-09-24。实验原型，不替换游戏内 AI。设计见 [AI_NEXT_DESIGN](../../docs/AI_NEXT_DESIGN.md)，逐阶段运行前计划见 [PLAN](PLAN.md)。

## 已实现

1. **合法玩家视图与公开历史**：109维当前状态、32维公开事件。进入网络与搜索的接口不含真实 seed/rng、对手手牌或牌堆顺序。对手私有奖励面值也不进入 actor。
2. **受规则约束的后验与生成器**：根据公开转移／补牌维护精确手牌计数分布；根节点无放回抽样，联合抽样对手奖励与剩余奖励堆。只把公开选择当干预；尚未用神经网络行为似然重加权。
3. **GRU64 策略／价值／对手模型**：state MLP128、action24→32、两个可变行动评分头和整场胜负价值。隐藏牌辅助监督仅用于训练，critic 单独读取特权标签，部署 JSON 不含 critic。
4. **单棵行动观察历史树**：我方 PUCT，对手从自己的合法玩家视图按 μ 抽样；叶子 V 与终局回报统一为根玩家整场 ±1。支持深度1/4，整轮结束后继续到下一次我方决策。超时未完成模拟不提交路径访问计数。
5. **fresh PPO**：同一玩家相邻决策之间作 GAE。只对本批当前 actor 实际采样的行动做 PPO；每批冻结旧 log-prob。历史对手与 normal 行动不冒充 on-policy 数据。旧自我对局记录仅用于离线初始化。
6. **可复核评估和 SwanLab 文字日志**：每10手直接打印到被 SDK 捕获的 stdout；完整动作保存 JSONL，再独立重放。日志中的双方筹码分包含模拟器私有奖金，仅用于监控，不进入决策模型。

这是一套借鉴 AP-MCTS、POMCP、PerfectDou 的斋普尔组合原型，不是论文直接复现。

## 训练

- 135场旧搜索完整比赛，隔一手采样，共7,343局面；训练6,180、验证1,163。全部相同发牌种子（含不同座位／搜索预算）绑定同一划分。[来源哈希与种子](dataset.json)。
- 离线训练10 epochs，按开发集 policy NLL + value MSE 选择 epoch9。NLL 2.952→2.086；整场价值 MSE 0.976→0.897。CPU约42.5秒。[曲线](training.json)。
- PPO 固定16批×32场=512场，46,243个新局面，约163秒。最终第16批固定用于评估，没有按测试胜率选版本。[PPO指标](ppo/training.json)。
- PPO后的旧开发集 value MSE=0.865；这是旧行为分布上的诊断，不能直接当成新策略或搜索策略的校准证明。
- 每批32场中17场双方当前actor、12场历史对手、3场normal；历史快照每4批更新。训练标签为整场先得两印章的胜负。

## 已完成的直接落子结果

全部交换座位，以完整比赛计胜负。

| 候选 | 对手 | 种子 | 战绩 |
| --- | --- | --- | --- |
| 离线初始化 | normal | 51001–51032 | 12:52 |
| 离线初始化 | normal | 54001–54032 | 7:57 |
| 最终 PPO | normal | **同上** | **22:42** |
| 最终 PPO | 冻结 DMC738 | 55001–55032 | **6:58** |

同一批种子，PPO提升23.44个百分点；按种子整组重采样20,000次的 bootstrap 95%区间为 +9.38 至 +37.50个百分点。这是相对弱初始化的提升，**不代表超过旧DMC**。[计算结果](summary.json)。两个模型在54001组的成绩彼此配对，不能当作互相独立样本。

纯模型决策平均约0.32–0.45ms（不含进程启动／权重装载）；这仅是本机部署原型的测量，不能直接外推浏览器／Wasm。

## 搜索结果

离线模型，深度1，52001–52002两对种子，对同模型直接落子为 **0:4**。182个搜索决策平均990.21ms，最大990.71ms；平均3,562.8次模拟，平均2.97%根行动未访问，0次回退。只4场，不能精确估计真实胜率，也无法仅凭这项试验把损失唯一归因于 V 或 μ。

对原有1秒 `guidedBehavior` 搜索（53001–53002）为 **0:4**；181个候选搜索决策，平均990.19ms、最大990.73ms，平均3,712.2次模拟，0次回退。

最终PPO模型，深度1，56001–56002两对种子，对同一PPO直接落子为 **2:2**；211个候选搜索决策，平均990.18ms、最大990.68ms，平均3,772.4次模拟，平均8.68%根行动未访问，0次回退。样本仅4场，没有搜索增益证据。没有把离线模型与PPO模型的搜索结果混在一起计胜率。

## 验证范围与限制

- 新后验与现有精确过滤器在三场回放的多个局面、双方视角下逐项一致，误差<1e-8；抽样后的玩家可见状态逐项不变。
- 真实隐藏信息改动不改变输入。额外改变训练特权字段不改变 actor 输出；critic-only loss 不向 actor 参数回传梯度。
- Python与JS推理：离线模型最大误差6.74e-7，PPO模型1.17e-6以下。GRU、两个策略头与价值头同时比较。深度4仅做了推理／合法行动 smoke test，尚无完整实战胜率结论。
- 所有780场比赛（512场自我对局、268场评测），共86,811次行动，独立引擎回放通过；同时核验结果、换座位完整性、预登记种子与训练／测试不重叠。见 [全量回放记录](game-verification.json)。
- 原生1383局面行动枚举／rollout／终局检查与NEON测试通过。
- 尚未做普通critic vs 特权critic消融，因此不能把PPO改善归因于特权信息。
- μ目前是训练对手混合分布的近似，PPO阶段主要跟踪当前actor样本；尚未按对手身份建模。
- 辅助手牌头尚未接入 belief 重加权；搜索蒸馏阶段未启动。当前模型未达到normal与旧DMC门槛，不应继续把“多做搜索”当成解决模型质量问题的默认方法。

## 下一项有针对性的实验

优先检查／改善初始化和价值目标对齐：用冻结DMC738在新局面生成软行动分布，蒸馏公开策略；随后在该策略的fresh轨迹上训练整场价值，并按比赛阶段检查校准；同时校准 μ 对实际部署对手的行动预测，检查训练时随机采样与评测时贪心落子的差异。相同训练预算下做公开critic与特权critic对照。只有纯策略达到基线且叶子V能区分行动，再扩展深度与搜索自我对局。这些是后续建议，本次未把它们伪装成已完成结果。

## 运行入口

需要 Node、PyTorch、NumPy；上传日志另需 SwanLab。现有 `scripts/requirements-dmc.txt` 提供训练依赖。请在新目录复现实验，评测器拒绝覆盖已存在的比赛记录，PPO训练器拒绝覆盖已有训练记录。

```bash
node --experimental-strip-types scripts/prepare-information.ts analysis/new-information-run
python scripts/train-information-model.py analysis/new-information-run 10
python scripts/train-information-ppo.py analysis/new-information-run analysis/new-information-run/ppo 16
node scripts/build-ai-research.mjs
python scripts/run-information-evaluations.py analysis/new-information-run
```

SwanLab 实时日志包装任意训练／评测命令（密钥交互输入，不写入源码）：

```bash
python scripts/run-information-swanlab.py analysis/new-information-run/live node --experimental-strip-types scripts/evaluate-information.ts analysis/new-information-run/ppo analysis/new-information-run/live search1 policy 56001 2
```

复现固定种子是核对实现，不能把复现同一批种子重新计为独立证据。上述自动评测脚本使用本次预登记种子及现有 DMC738 文件，独立棋力复核应另登记新种子。


## SwanLab

- [离线训练](https://swanlab.cn/@franzyu/jaipur-dmc/runs/1up5tma5)
- [首次normal门槛](https://swanlab.cn/@franzyu/jaipur-dmc/runs/mqv7untd)
- [离线模型浅搜索](https://swanlab.cn/@franzyu/jaipur-dmc/runs/1rgcbmyr)
- [PPO训练（每10手文字日志）](https://swanlab.cn/@franzyu/jaipur-dmc/runs/8l2cs7u3)
- [normal、旧DMC及旧1秒搜索对照](https://swanlab.cn/@franzyu/jaipur-dmc/runs/reu5xf6i)
- [最终PPO浅搜索](https://swanlab.cn/@franzyu/jaipur-dmc/runs/916s52fx)
