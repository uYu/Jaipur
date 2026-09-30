# 公开行动手牌推断实验

后续公开概率输入与搜索行动标签的网络实验见 [belief-policy-followup.md](belief-policy-followup.md)。

2026-09-23。研究分支增加了 `publicHandDistribution`：开局按 55 张牌守恒枚举对手五张起手牌，随后用公开拿牌、交换、出售和市场翻牌条件更新每种手牌组合的概率。基础版只把行动当作可行性证据；后续实验另加入拿牌选择似然。浏览器困难 AI 仍使用原 Wasm 构建；原生研究程序可以读取该分布。

## 真实隐藏牌校准

`scripts/calibrate-hand-belief.ts` 在完整模拟对局中逐步比较“对手下一手有合法卖牌可清空第三类筹码”概率与真实隐藏牌。开局还按公开的对手货物手牌张数约束并归一化。每一手的真实手牌都在分布支持集内（下表 `unsupported=0`）。

| 对局来源                         | 局数 | 决策点 | 真正有收市卖牌 | 支持集遗漏 |    Brier |     两堆已空时 Brier |
| -------------------------------- | ---: | -----: | -------------: | ---------: | -------: | -------------------: |
| 独立种子随机合法行动 50001–50200 |  200 | 39,296 |          1,408 |          0 | 0.000016 | 0.000260（2,419 点） |
| 已保存的神经版对线性版 AI 对局   |   40 |  4,390 |            157 |          0 |  0.00094 |    0.00921（448 点） |

全部决策点的 Brier 被大量“还不到收市”的零概率局面压低，因此应优先看两堆已空的子集和可靠性分箱。随机行动样本几乎全部为确定的 0 或 1，不能验证中等概率。AI 日志中预测 10%–20%、20%–30%、30%–40% 的分箱分别只有 9、2、6 点，实际频率为 22%、0%、50%。这些点在同一完整对局内相关，尚不足以断言中等概率范围已经校准。

在这 40 局 AI 日志的相同决策点，旧均匀抽样模型的 Brier 为 0.00114，两堆已空子集为 0.01113；新分布分别为 0.00094 和 0.00921。这个离线改善尚未转化为整局胜率优势。

## 旧错局复查

| 局面                          | 新分布：关键致命组合 | 新分布：任意下手卖牌收市 | 原报告的旧均匀采样关键组合 |
| ----------------------------- | -------------------: | -----------------------: | -------------------------: |
| 1004，行动 29，对手至少三钻石 |                20.0% |                    20.0% |                      18.4% |
| 1308，行动 45，对手至少五黄金 |                14.1% |                    18.8% |                      10.7% |

1308 的关键组合概率上升了，但 1004 变化很小；还不能证明搜索会改选卖牌。

## 搜索对照与升版判断

原生搜索 50 ms 名义预算，种子 2101–2110，交换先后手共 20 局：新分布版对旧均匀抽样版 **10:10**，平均每步实际耗时约 52.9 ms 对 53.0 ms。样本量不足以精确估计胜率，也没有升版证据。

上述耗时是原生搜索进程返回的搜索耗时，不包括 TypeScript 重放历史并计算手牌分布的时间；因此还不能作为浏览器 1 秒总决策预算的性能结论。

这一步没有把新分布切入浏览器 Wasm。后续的拿牌行为模型、可见信息网络训练与分项消融见下文；所有候选都保持为研究配置。

本机缺少 `em++`，当前无法重建浏览器 Wasm。`encodeObservation` 默认保留旧编码，原生对照显式附加后验分布，不影响现有浏览器 AI。

## 行为条件化补充

进一步把“对手选择拿哪张货物”作为证据：假设在拿牌行动已发生的条件下，某张市场牌被选中的权重为 `exp(β × 对手此前持有的同类张数)`，并在所有可拿的市场牌之间归一化。用种子 1001–1120 的已保存对局拟合拿牌似然，网格最优 `β=0.75`；在独立种子 1301–1320 的 40 局上，收市风险 Brier 从无行为条件化的 0.00094 降至 0.00077，两堆已空时从 0.00921 降至 0.00751。另 20 局种子 1201–1210 也略有改善，但多数风险已是确定值。该行为模型在 1004 错局反而把致命组合估计从 20.0% 降到 12.4%，说明平均校准不能替代具体错局检查。

手牌分布现按同一公开事件数组增量更新。校准脚本定期用新数组从开局完整重放，并比较收市概率，防止缓存改变推断结果。

原生 50 ms 预算、种子 2201–2210 交换先后手共 20 局，行为条件化对纯牌流转分布为 **10:10**。它是研究候选，尚无升版依据。

## 可见信息网络候选

新增 `generate-observable-nn-data.ts`：在完整对局中保存决策时公开观察和行为条件化手牌分布，用原生编码器按该分布抽一个搜索会采用的隐藏世界并计算原 160 维特征。标签来自这轮真实结算，从当前行动者视角记胜负和分差；训练与验证按完整对局种子分开。此做法避免拿真实对手手牌当网络输入，但树中备选行动的后续局面仍可能与训练轨迹不同。

训练集为种子 70001–71200 的 1,200 局、29,216 个局面；验证集为种子 80001–80240 的 240 局、5,970 个局面。64 单元对称网络的验证胜负 MSE 为 **0.691**，同一输入上的旧神经网络为 **0.705**、线性参考为 **0.819**。C++ 与 NumPy 的最大推理差为 `1.79e-7`，玩家交换反对称误差为 0。候选权重与训练元数据分别保存在 [`observable-nn-weights.hpp`](observable-nn-weights.hpp)、[`observable-nn-training.json`](observable-nn-training.json)，未替换仓库默认网络。离线误差不能作为升版依据，整局先验与模拟策略消融另行记录。

先验单独替换，在原生 50 ms、种子 2301–2310 的 20 局交换先后手对战中对线性基线为 **9:11**。样本较小，尚未显示优势。

模拟策略单独替换，在种子 2401–2410 的 20 局中为 **11:9**；候选平均搜索耗时约 62.9 ms，线性基线约 52.7 ms，均高于名义预算。这也不足以证明优势，且需要在实际使用的预算下复核。

先验与模拟策略同时替换，在种子 2501–2510 的 20 局中只有 **1:19**，候选平均搜索耗时约 63.3 ms。这是明确的负面信号：单独消融的小幅差异不能相加，网络偏差会在树内重复影响候选排序和后续模拟。该组合不升版。

把神经先验限制在根节点、同时保留神经模拟策略，种子 2701–2710 的 20 局仍只有 **2:18**。因此问题不能仅归因于树内每一层都使用神经先验；这个组合也不升版。

首次名义 1 秒对局暴露了研究程序的计时检查过稀：搜索每 16 次迭代才检查时间，线性基线平均每步耗时约 9.45 秒，候选约 0.97 秒，所得 3:1 **不作为 1 秒胜率证据**。已改为每次迭代检查时间，并重新测量搜索耗时及包含 TypeScript 观察构造的总耗时。

仅在迭代边界检查仍不足够：线性模拟策略的一次长 rollout 可以持续数秒，第二次试验平均耗时约 7.39 秒且候选 0:4，仍不能当作公平 1 秒比较。研究程序现将截止时间传进 rollout 和单步行动评分，超时模拟回传中性截断值；再次复核后才使用预算结果。固定迭代数的生产搜索不受这个时间参数影响。

将观察构造耗时从搜索预算中扣除后，种子 2801 的一对 1 秒完整对局为 **1:1**。候选与线性版的平均整步耗时分别为约 960 ms、933 ms；搜索最大耗时约 997 ms、1002 ms。候选有一次整步达到约 1367 ms，说明仍存在偶发非搜索开销，不能宣称严格保证每步不超过 1 秒。这一对局只用于检查时间控制，不足以判断胜率。

同一计时规则下，种子 2901 的一对 2 秒完整对局为候选 **0:2**。候选与线性版平均整步耗时约 1840 ms、1733 ms，最慢整步约 2005 ms、2003 ms，没有超过预算 50 ms 以上的决策。样本不足以估计总体胜率，也没有一致的提升信号。

启用手牌分布增量缓存后，独立种子 2802 的一对 1 秒对局为候选 **0:2**；候选和线性版平均观察构造耗时约 1.13 ms、1.15 ms，最大约 2.82 ms、2.77 ms，整步最大约 998 ms、1002 ms，没有明显超时。合并两个 1 秒种子，候选为 **1:3**。这仍是探索性小样本，足以说明尚不能升版，不能据此量化真实胜率。

在最终的整步计时协议和增量缓存下，重新用原生 50 ms、种子 3001–3010 做 20 局先验单独消融，候选为 **8:12**。前文 9:11 等旧 50 ms 数字均来自计时修复前，只作为历史诊断。

同一最终协议下，种子 3101–3110 的 20 局模拟策略单独消融为候选 **4:16**。两方平均整步耗时都约 45.2 ms。此前模拟策略 11:9 的微弱优势没有在严格计时下复现。结合 1 秒与 2 秒探索性配对结果，这份网络候选不升版。

复现：

```sh
node --experimental-strip-types scripts/calibrate-hand-belief.ts 200 50001
node --experimental-strip-types scripts/calibrate-hand-belief.ts analysis/ai-eval-2026-09-23/jaipur-neural-vs-guided.jsonl
node --experimental-strip-types scripts/recheck-missed-wins.ts
npm run build:ai-research
node --experimental-strip-types scripts/benchmark-native.ts guided guidedLegacy 2101 10 50
node --experimental-strip-types scripts/fit-take-preference.ts analysis/ai-eval-2026-09-23/jaipur-paired-vs-guided.jsonl analysis/ai-eval-2026-09-23/jaipur-explore-vs-guided.jsonl
node --experimental-strip-types scripts/calibrate-hand-belief.ts analysis/ai-eval-2026-09-23/jaipur-neural-vs-guided.jsonl 0.75
node --experimental-strip-types scripts/generate-observable-nn-data.ts /tmp/jaipur-observable-train.f32 70001 1200
node --experimental-strip-types scripts/generate-observable-nn-data.ts /tmp/jaipur-observable-validation.f32 80001 240
python3 scripts/train-neural.py --train-file /tmp/jaipur-observable-train.f32 --validation-file /tmp/jaipur-observable-validation.f32 --train-games 1200 --validation-games 240 --directory /tmp/jaipur-observable-nn --epochs 80 --target win --architecture symmetric --hidden 64
JAIPUR_CANDIDATE_NN_HEADER="$PWD/analysis/ai-eval-2026-09-23/observable-nn-weights.hpp" npm run build:ai-research
node --experimental-strip-types scripts/benchmark-native.ts observablePrior guidedBehavior 3001 10 50
node --experimental-strip-types scripts/benchmark-native.ts observableRollout guidedBehavior 3101 10 50
node --experimental-strip-types scripts/benchmark-native.ts observableRollout guidedBehavior 2802 1 1000
node --experimental-strip-types scripts/benchmark-native.ts observableRollout guidedBehavior 2901 1 2000
```

## 2026-09-24：收市风险搜索实验

为避免 8 棵搜索树漏掉较少见的致命手牌，增加了可选的后验分层抽样；默认搜索不变。另增加可选的根节点风险修正：两类筹码已空时，从公开后验取 32 个等距分位手牌，逐一检查候选行动后对手立即卖牌收市的最差结果，并从搜索访问份额中扣去预计输局概率。两项均只在原生研究程序通过命令行启用，未接入浏览器 Wasm。

分层抽样对行为条件化后验基线，50 ms、种子 2401–2410、交换先后手共 20 局为 **8:12**；种子 2411 的一对 1 秒对局 **1:1**。50 ms 平均整步耗时约 45.5 ms 对 45.3 ms；1 秒约 950 ms 对 950 ms。它没有显示提升。旧错局 1004 和 1308 在 1 秒下仍选择换牌。

收市风险修正对同一基线，50 ms、种子 2501–2505 为 **6:4**，独立种子 2511–2520 为 **9:11**，合计 **15:15**；两方平均整步耗时都约 45.3 ms。旧错局 1004 和 1308 在 1 秒下也仍选择换牌。首批小幅领先未复现，不进入较长预算升版阶段。

这两种搜索改动均没有在指定错局和配对整局测试中形成可靠优势。当前可确认的改进仍是公开手牌后验的离线校准和增量计算；尚无证据支持替换正式 AI 策略或神经网络权重。

复核命令：

```sh
npm run build:ai-research
node --experimental-strip-types scripts/recheck-missed-wins.ts 0.75
node --experimental-strip-types scripts/benchmark-native.ts guidedStratified guidedBehavior 2401 10 50
node --experimental-strip-types scripts/benchmark-native.ts guidedStratified guidedBehavior 2411 1 1000
node --experimental-strip-types scripts/benchmark-native.ts guidedCloseRisk guidedBehavior 2501 5 50
node --experimental-strip-types scripts/benchmark-native.ts guidedCloseRisk guidedBehavior 2511 10 50
```
