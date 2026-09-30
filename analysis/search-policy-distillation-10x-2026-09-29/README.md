# MCTS 策略蒸馏：10 倍局面覆盖（2026-09-29）

本轮检验增加 MCTS 策略标签是否能改善行动先验。模型仅接在研究版 MCTS 的根节点，未替换正式 AI，也未重启 DouZero 训练。

## 数据

- 教师与上轮相同：原版 `guidedBehavior`，每个局面固定 8 棵树 × 512 次模拟，共 4096 次。监督目标是根节点合法行动的访问比例。
- 在上轮 1556 个训练局面外，另选 800 场完整对局，覆盖 DMC 自我对局的 8 个训练版本段和历史搜索对局。每场抽取约 20 个决策点，生成 15,540 个新标签。合计 17,096 个训练局面，约为上轮的 10.99 倍，来自 840 个种子。
- 验证仍用独立的 298 个局面、10 个种子；测试仍用独立的 768 个局面、20 个种子。三组种子互不重叠。所有新旧训练标签的教师模拟次数均核对为 4096，目标分布质量之和约为 1。
- 模型结构仍为 166→128→1；价值损失权重为 0，只训练行动策略。第 29 轮验证交叉熵最低。原始数据、来源清单、训练日志、模型与指标位于 `output/jaipur-search-distill-10x-20260929/`。

## 离线测试

| 策略 | 测试交叉熵，低为好 | 模型首选行动的教师访问份额 | 与教师首选吻合 |
| --- | ---: | ---: | ---: |
| 1 倍训练数据 | 2.2506 | 30.54% | 49.61% |
| 10.99 倍训练数据 | 2.1581 | 32.98% | 57.03% |

教师自身最高访问份额均值为 39.94%；均匀策略交叉熵为 2.7727。指标说明更好地拟合了该教师在这组局面上的根访问分布，不直接等于更高胜率。PyTorch 与编译版 C++ 在 595 组输入上的最大绝对输出差为 5.25×10⁻⁶。

## 完整对局

10 倍与 1 倍策略均仅提供 MCTS 根节点先验；双方其余搜索逻辑相同。双方每步固定 8×256＝2048 次模拟，脚本逐步验证搜索次数。每个独立种子交换先后手。

| 对局 | 独立种子 | 10 倍策略胜负 | 候选先手胜局 | 候选后手胜局 |
| --- | ---: | ---: | ---: | ---: |
| 第一组，3900009600–9619 | 20 | 24:16 | 13/20 | 11/20 |
| 第二组，3900009700–9719 | 20 | 20:20 | 11/20 | 9/20 |
| 合计 | 40 | 44:36 | 24/40 | 20/40 |

按每个种子的两场对局看，共有 11 个种子两胜、22 个种子各胜一场、7 个种子两负。第一组有一次约 17 分钟的异常搜索计时，导致其平均耗时失真；第二组双方平均每步搜索耗时约 81.8 ms，未见额外推理成本。

## 结论与升版标准

10 倍数据明显改善了对教师访问分布的模仿；直接对战的 44:36 仍是较小且不稳定的领先。第二组 20:20，现有结果不足以认定实战强度提升。**本轮不将模型升为正式 AI，也不生成 100 倍教师标签。**

已在 `output/jaipur-search-distill-100x-20260929/sources/` 准备好与本轮种子不重复的 8000 场自我对局来源。历史搜索对局除本轮已抽取的 160 场外，只剩 3 个新种子可用；若未来扩大数据，需要先扩大搜索对局分布，或明确接受新增数据主要来自自我对局。

复现关键命令：

```sh
python3 scripts/sample-distill-games.py \
  output/jaipur-flat-fullsale-unlimited-humanval-20260929/selfplay-games.jsonl \
  output/jaipur-search-distill-10x-20260929/sources \
  --selfplay-games 640 --search-games 160 --shards 8 --seed 20260929

# 对每个 sources/games-XX.jsonl 分片执行；共 8 个分片。
node --experimental-strip-types scripts/generate-belief-policy-data.ts \
  output/jaipur-search-distill-10x-20260929/teacher-00.jsonl \
  --iterations-per-tree 512 \
  output/jaipur-search-distill-10x-20260929/sources/games-00.jsonl

python3 scripts/train-belief-policy.py \
  output/jaipur-search-distill-10x-20260929/train.jsonl \
  output/jaipur-search-distill-20260929/validation.jsonl \
  output/jaipur-search-distill-10x-20260929/model \
  --epochs 40 --hidden 128 --value-weight 0
```

训练集为 `output/jaipur-search-distill-20260929/train.jsonl` 与本轮 8 个教师分片的合并文件。精确来源、各分片数量见 `sources/manifest.json` 与 `data-summary.json`；逐局记录见 `direct-1x-games*.jsonl`，汇总见 `comparison-summary.json`。
