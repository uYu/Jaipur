# 公开手牌分布策略网络实验

2026-09-24。此实验用公开观察和概率特征直接预测搜索行动分布。与上一版“先抽一副手牌再输入价值网络”不同，网络输入中没有抽样对手手牌、隐藏牌堆或未知奖励筹码。

## 输入与训练

142 维状态输入包括自己的货物、骆驼、已得筹码、公开市场、剩余筹码序列、弃牌、牌堆张数、双方手牌张数，以及对手每类货物持有 0–7 张的边际概率和下一手出售收市的联合事件概率。这里编码的是分布摘要；它不完整保留各类货物数量的全部相关性。

每个合法行动用 24 维特征编码。策略网络为 166→32→1 的 ReLU 网络，对同一局面的全部合法行动做 softmax，以教师搜索根节点访问份额为目标训练交叉熵。另训练 142→32→1 的价值网络，以记录对局的真实本轮胜负为标签。价值网络本轮不参与搜索或模拟策略，避免把两项效果混在一起。

训练数据来自种子 1001–1020、1101–1120 的 80 场已保存完整 AI 对局，每轮按 7 手、5 手间隔交替取点（turn % 12 为 0 或 7），覆盖双方视角，共 1,556 个局面。验证集来自独立种子 1201–1210 的 20 场完整对局，共 298 个局面（160 个偶数行动、138 个奇数行动）。教师为行为条件化手牌后验加原线性先验和模拟策略，8 棵树、50 ms 搜索预算。局面中真实隐藏牌仅用于对局结局标签，没有作为策略网络输入。

策略与价值网络训练 40 轮；候选检查点由验证策略交叉熵选择，**不作为实战升版依据**。选中第 34 轮，验证策略交叉熵 2.27144（均匀分配为 2.58869），价值 BCE 0.42945；模型首选行动平均承接教师访问份额 0.26917，教师自身最常访问行动为 0.35876。这些局面在局内相关，不能当作 298 次独立胜率观测。

## 接入与验证

候选仅用于根节点：其 softmax 分布与原先验各占一半；深层搜索、后续模拟策略、回传目标均保持同一基线。网络 logits 不做逐局面最大最小拉伸。编码及推理准备耗时从搜索预算中扣除，完整对局基准还扣除 TypeScript 观察构造耗时。

C++ 和 PyTorch 的 595 组策略/价值输出最大绝对误差为 1.6711e-6。原生测试增加了概率编码检查：后验世界顺序或整体权重尺度不改变特征，稀有收市事件概率能保留。全部 1,854 条训练和验证观察的各货物边际概率均归一化。

## 完整对局

首版固定每六手采样，会只取每轮同一行动方的视角。该版在 50 ms、种子 3301–3310 为 7:13，1 秒、种子 3401 为 1:1；其数据、权重和结果单独保存为 `belief-policy-v1-*`。随后修正采样并重训，以下使用独立种子检验修正版。

修正版 50 ms、种子 3601–3610 的 20 局为 **8:12**，平均整步耗时 45.45 ms 对 45.47 ms；1 秒、种子 3701 的一对对局为 **0:2**，平均整步耗时 944.66 ms 对 951.39 ms，最大整步约 1019.98 ms 对 999.39 ms。2 秒、种子 3801 的一对对局同样为 **0:2**，平均整步耗时 1889.00 ms 对 1841.60 ms，最大整步 2020.54 ms 对 2010.74 ms。1 秒和 2 秒各只有一对，不能据此精确估计胜率；结合 50 ms 对局和旧错局检查，没有升级依据。所有比较交换先后手；正式浏览器 AI 尚未切换到此候选。

1 秒旧错局复查中，1004 和 1308 均仍选择换牌，没有找回原报告中卖皮革的动作，详见 `belief-policy-cases.jsonl`。

## 复现

数据及模型留存在同目录的 `belief-policy-train.jsonl.gz`、`belief-policy-validation.jsonl.gz`、`belief-policy-model.pt`、`belief-policy-weights.hpp` 和 `belief-policy-training.json`。数据记录各自来源、种子、轮次和行动时刻；元数据包含数据与权重的 SHA-256。原数据可用 Python gzip 解压。

```sh
npm run build:ai-research
node --experimental-strip-types scripts/generate-belief-policy-data.ts /tmp/jaipur-belief-train.jsonl analysis/ai-eval-2026-09-23/jaipur-paired-vs-guided.jsonl analysis/ai-eval-2026-09-23/jaipur-explore-vs-guided.jsonl
node --experimental-strip-types scripts/generate-belief-policy-data.ts /tmp/jaipur-belief-validation.jsonl analysis/ai-eval-2026-09-23/jaipur-guided-vs-original.jsonl
python3 scripts/train-belief-policy.py /tmp/jaipur-belief-train.jsonl /tmp/jaipur-belief-validation.jsonl /tmp/jaipur-belief-model
JAIPUR_BELIEF_WEIGHTS_HEADER="$PWD/analysis/ai-eval-2026-09-23/belief-policy-weights.hpp" npm run build:ai-research
python3 scripts/verify-belief.py analysis/ai-eval-2026-09-23/belief-policy-model.pt /tmp/jaipur-belief-validation.jsonl "$TMPDIR/jaipur-ai-research/verify-belief"
node --experimental-strip-types scripts/benchmark-native.ts beliefRoot guidedBehavior 3601 10 50
node --experimental-strip-types scripts/benchmark-native.ts beliefRoot guidedBehavior 3701 1 1000
node --experimental-strip-types scripts/benchmark-native.ts beliefRoot guidedBehavior 3801 1 2000
```

教师和对战采用时间预算，重复运行会因机器负载产生差异。训练数据已归档，复训可使用归档数据固定教师标签。当前数据规模较小，教师仅 50 ms，且价值标签反映日志中的行为策略；这些都是本轮候选的限制。

训练集中两类筹码已空的局面有 114 个，但下手收市概率严格介于 0 和 1 的只有 6 个；验证集对应为 28 个和 0 个。这批常规采样数据对不确定收市风险的覆盖不足，不能用整体离线损失声称学会该风险。另从独立日志抽取全部这类局面做专项评估，不参与训练或选检查点。

这份候选不升版。其价值网络未接入后续模拟策略；本轮检验的是公开概率输入的根节点策略先验。将该网络用于模拟策略还需要在模拟中按行动方更新公开观察与后验，不能把已抽定的完整隐藏状态直接当作该网络输入。

专项评估从种子 1301–1320 的 40 场日志提取全部 25 个不确定收市局面，所属种子与训练、验证集不重叠，不参与拟合或选检查点。策略交叉熵 1.81617（均匀为 2.01634），首选行动与教师最高访问行动一致率 36%，模型首选行动平均教师访问份额 0.35879，教师最高份额均值 0.49192。该测试评估的是对教师偏好的拟合；教师本身也可能犯错，不能替代完整对局胜率。数据与结果保存在 `belief-policy-risk-test.jsonl.gz` 和 `belief-policy-risk-result.json`。

```sh
node --experimental-strip-types scripts/generate-belief-policy-data.ts /tmp/jaipur-belief-risk-test.jsonl --risk-only analysis/ai-eval-2026-09-23/jaipur-neural-vs-guided.jsonl
python3 scripts/evaluate-belief-policy.py analysis/ai-eval-2026-09-23/belief-policy-model.pt /tmp/jaipur-belief-risk-test.jsonl --exclude analysis/ai-eval-2026-09-23/belief-policy-train.jsonl.gz --exclude analysis/ai-eval-2026-09-23/belief-policy-validation.jsonl.gz
```

验证完成：原生 1,383 个局面的合法动作、模拟和战术检查、概率编码不变性、Tiny NN 数值测试、网页构建及差异空白检查通过。
