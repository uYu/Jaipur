# DouZero 结构的 Jaipur 候选模型

这一轮先对齐模型结构，再判断训练与棋力。候选没有接入网页或默认搜索，旧 DMC 检查点和训练程序保持原样。

## 结构

DouZero 的[论文](https://proceedings.mlr.press/v139/zha21a/zha21a.pdf)和[官方模型源码](https://github.com/kwai/DouZero/blob/main/douzero/dmc/models.py)使用历史行动 LSTM（隐藏维度 128），把历史表示与当前状态、候选行动拼接，再经过五个 512 维隐藏层和一个标量输出层。本候选采用同样的主干：

```text
当前轮最近 16 个公开行动 × 26 维 → LSTM(26, 128)
当前公开观察 146 维 + 候选完整行动 24 维 + 历史 128 维
    → 512 → 512 → 512 → 512 → 512 → Q(观察, 行动)
```

历史中每步的前两维表示行动者相对当前玩家的位置，后 24 维沿用当前 DMC 的完整行动编码。新轮清空历史，左侧零填充；市场拿牌、卖牌和交换的公开内容逐步记录。所有合法完整行动都用同一个网络评分；`score_actions` 只计算一次历史 LSTM，再批量评分行动。双人对称游戏共享一套参数，因此没有复制 DouZero 斗地主的三角色网络。Jaipur 的 16×26 历史窗口也不是 DouZero 的牌型编码或窗口长度的逐字复制。

代码入口：[历史编码](../../src/game/dmc-history.ts)、[候选网络](../../scripts/douzero_model.py)、[数据重放](../../scripts/generate-douzero-data.ts)、[离线训练](../../scripts/train-douzero-pilot.py)、[推理服务](../../scripts/douzero-inference.py)、[配对对局](../../scripts/evaluate-douzero.ts)。

## 小样本链路检查

从现有千万级自对弈日志末尾取 80 场完整比赛，按整场种子分成 64 场训练和 16 场验证。训练 7,704 个已执行行动样本，验证 2,045 个。标签是实际完整比赛的行动方胜负 ±1，没有用搜索访问量或真实隐藏手牌作标签。模型含 1,284,097 个参数。

四轮离线训练的验证 MSE 依次为 **1.138、1.135、1.083、1.130**；只预测训练集平均回报的验证 MSE 约 **1.000**。保留第 3 轮作为这次试验的检查点。一组未参与训练的配对种子、交换先后手对普通 AI 的比赛为 **0:2**。模型能完成合法行动评分、完整对局和玩家视角检查，但这次数据量与训练方式远不足以说明棋力增强，结果也不支持升版。

`/tmp/jaipur-douzero-recent.pt` 是本机的临时试验检查点，不作为正式模型。复现：

```sh
tail -n 80 analysis/dmc-10m-2026-09-24/selfplay-games.jsonl > /tmp/jaipur-douzero-recent-games.jsonl
node --experimental-strip-types scripts/generate-douzero-data.ts /tmp/jaipur-douzero-recent-games.jsonl /tmp/jaipur-douzero-recent 64 16
python3 scripts/train-douzero-pilot.py --train /tmp/jaipur-douzero-recent-train.jsonl --validation /tmp/jaipur-douzero-recent-validation.jsonl --output /tmp/jaipur-douzero-recent.pt --epochs 4
node --experimental-strip-types scripts/evaluate-douzero.ts /tmp/jaipur-douzero-recent.pt 3900000000 1
```

后续若要做有意义的 DouZero 式对照，需要用这套历史输入持续自我对局、训练足量完整回报，并在独立种子下与旧 DMC 及当前搜索 AI 做等时完整比赛。当前离线试验只是结构与数据链路检查，不能把旧日志的行为回报当作新策略的最终胜率。
