# DouZero 式 Jaipur 模型：CPU / GPU 自我对局训练

约两周的定时 GPU 作业参数、自动收尾、检查点保留和任务提交说明见 [DouZero 14 天作业](DOUZERO_14D_JOB.md)。

训练入口为 [`scripts/launch-douzero.sh`](../scripts/launch-douzero.sh)。模型采用当前公开历史 LSTM + 行动条件 Q 网络；每个训练样本来自**已完成整场比赛**中实际执行的行动，目标是行动方的整场胜负 `+1/-1`。`--device` 选择权重更新设备，`--actor-device` 选择批量行动评分设备，默认均按原配置使用 CPU 评分。游戏规则和公开手牌后验由 CPU worker 处理；多个 worker 的预测请求可以合批，也可以用多个独立 CPU 评分进程同时处理。每次权重更新后会同步评分模型。

## 环境

- Linux 或 macOS，Node.js **22.13+**、Python **3.10+**。
- 安装仓库 Node 依赖：`npm ci`。
- Python 环境至少安装 `numpy` 和 `torch`。需要 SwanLab 时另装 `swanlab==0.10.1` 并设置对应环境变量；不设置 `SWANLAB_API_KEY` 或 `SWANLAB_MODE` 就只写本地日志。
- GPU 服务器须安装**能识别该机器 CUDA 驱动和 GPU 的 PyTorch 构建**。按 [PyTorch 官方安装选择器](https://pytorch.org/get-started/locally/)选择 Linux / Pip / Python / 对应 CUDA 版本。启动器会检查 `torch.cuda.is_available()`；显式指定 `--device cuda` 时检查失败会直接报错，不会悄悄退回 CPU。

示例初始化：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install numpy
# CPU: .venv/bin/python -m pip install torch
# GPU: 按上面的 PyTorch 官方选择器安装对应 CUDA 版 torch。
npm ci
```

## 启动命令

### 分层行动空间实验

在原版训练命令上加 `--hierarchical`，即从零训练一套**不兼容原版检查点**的新模型。模型先选拿牌／骆驼／卖牌／换牌；选择换牌后，先选换入货物数量组合，再选交出的手牌和骆驼。随机探索也按这三层选择，不会让支付组合较多的换牌自动占据更多探索概率。新模型对每种货物只保留“一次卖完手中该种货物”的卖牌候选；对手和游戏规则仍可少卖。训练目标仍是完整比赛的行动方胜负，分别监督三个价值头。此实验的 `mse` 是几个价值头损失之和，不能与原版单头 MSE 比大小。

```sh
./scripts/launch-douzero.sh --hierarchical --device cpu --python .venv/bin/python \
  --output output/jaipur-hierarchical-smoke --actors 2 --smoke

./scripts/launch-douzero.sh --hierarchical --device cpu --python .venv/bin/python \
  --output output/jaipur-hierarchical-10m --actors 4 --actor-lanes 16 \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --checkpoint-every 50 --dev-pairs 32
```

GPU 服务器将 `--device cpu` 改为 `--device cuda`。续训同样加 `--hierarchical --resume 新模型检查点`；启动器会拒绝将原版检查点加载到新模型。推理评测脚本会根据检查点架构自动使用对应的卖牌候选空间。这个改动只用于研究训练，不会更换网页 AI 或预编译 Wasm。

本机 16 场冒烟对局的 5,885 个决策中，重放规则得到原版平均 41.63 个完整合法候选，限制整组卖出后平均 39.37 个；分层网络最终只给选中类型与换入目标下平均 3.47 个具体动作打分。动作列表仍会完整生成以保证合法性，这些数字只说明具体动作评分量。该冒烟批次有 487 次卖牌，少卖为 0。另一次从零训练的 10,000 样本小试验在第 4 次更新达到 12,115 样本，开发集仍为 0/4；目前没有强度改进证据，应先用独立种子和等样本旧模型对照，再决定是否长期训练。

进一步训练至约 289 万样本后，分层版在第 150 次更新的固定开发集只赢 `7/64`，拿单牌约占六成；原版在相近的 246 万样本（第 175 次更新）开发集赢 `40/64`。在同一组新种子对普通 AI 的 64 场对照中，分层版第 150 次检查点按三层硬选择赢 `2/64`，即使改用其具体行动头直接选择也只赢 `10/64`；原版第 175 次检查点限制整组卖出赢 `36/64`。这表明目前的独立类型／目标头和联合损失退化严重，长期分层训练已停止。

`--full-sale-only` 保留原版单头 Q 网络，只移除少卖候选，作为隔离卖牌限制影响的对照。已有原版第 715 次检查点在同一组 64 场对普通 AI 的对照中，原行动空间与临时限制整组卖出都赢 `56/64`，说明这组种子上性能下降主要来自分层模型。正式从零对照仍需单独训练；不能把旧检查点的推理实验当成新训练结果。

```sh
./scripts/launch-douzero.sh --full-sale-only --device cpu --python .venv/bin/python \
  --output output/jaipur-flat-fullsale-10m --actors 4 --actor-lanes 16 \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --checkpoint-every 50 --dev-pairs 32
```

分层训练的日志字段为多头损失 `loss` 与三个单头 MSE；单头版本继续记录 `mse`。SwanLab 对分层旧日志会将原来的 `mse` 解释为 `train/loss`。二者不能按数值直接比较。

从零训练可直接运行仓库根目录的 `train.sh`：默认 CUDA、1000 万样本、每 128 场更新一次、每 50 轮评估和保存一次检查点，写入新的 `output/jaipur-douzero-10m-fresh` 目录。脚本不传 `--resume`；若该目录已有 `config.json`，会拒绝覆盖。设置 `SWANLAB_API_KEY` 并安装 `swanlab==0.10.1` 后，训练开始时会自动在线记录，无需另开回填进程。可以用 `JAIPUR_DOUZERO_OUTPUT` 改输出目录。

不设样本和更新轮数上限时，在启动器加 `--unlimited`，或用 `train.sh` 设置 `JAIPUR_DOUZERO_UNLIMITED=1`。此时 `config.json` 记录 `unlimited: true`、`targetSamples: 0`、`iterations: 0`；训练持续到手动停止或遇到错误，每 50 轮照常评估和保存检查点，不会因达到 1000 万样本退出。请为每次启动使用新的输出目录。

新训练默认探索率 `0.01`、每批样本训练 `1` 遍。可用 `--exploration`、`--epochs-per-batch` 或 `train.sh` 的 `JAIPUR_DOUZERO_EXPLORATION`、`JAIPUR_DOUZERO_EPOCHS_PER_BATCH` 调整。已启动的进程仍使用启动时参数；每轮的实际值记录在 `config.json` 和 `training.jsonl`。SwanLab 还会记录拿牌、骆驼、出售、换牌四类行动的占比，以及每小把双方合计的平均行动数 `selfplay/avg_round_turns`（已完成比赛的行动样本数除以其中的小把数）。本地日志继续保留完成场次、截断场次、已完成比赛的小把数和总行动数。

`--actors N --actor-lanes M` 使用 N 个 CPU worker 并行推进比赛。`--scorers N` 将 worker 的合批请求分配给 N 个独立 CPU 模型评分进程；默认 1，最多与 `--actors` 相同。这台 10 核 Mac 的最快实测配置是 `--device cpu --actors 8 --scorers 4 --actor-lanes 16`；在 `train.sh` 中设置 `JAIPUR_DOUZERO_DEVICE=cpu JAIPUR_DOUZERO_ACTORS=8 JAIPUR_DOUZERO_SCORERS=4 JAIPUR_DOUZERO_ACTOR_LANES=16`。两轮各 128 场的完整训练对照中，随机初始化时 4 对局/1 评分进程 34,224 样本用时 14.89 秒，4/4 为 34,281 样本/10.45 秒；从同一第 150 轮检查点开始时，4/1 为 29,047 样本/11.25 秒，4/4 为 29,490 样本/8.42 秒，8/4 为 28,393 样本/7.64 秒。按样本吞吐算，8/4 比 4/1 快约 44%。8/8 只比 8/4 慢或相近，需更多内存。这些只是短跑吞吐测试，不代表棋力提高。

可在训练所用的 Python 环境中安装 `orjson`，加快 Node 到 Python 的自我对局请求解析：`python -m pip install orjson`。未安装时自动使用标准库 `json`，功能不依赖此可选包。本机 128 场单轮测试中，启用 `orjson` 后耗时由约 9.3 秒降至 7.4 秒；吞吐受行动分布和机器负载影响。

GPU 服务器可比较 `--device cuda --actor-device cuda --scorers 1` 与 CPU 评分配置 `--device cuda --actor-device cpu --scorers 4`。GPU 评分保持原来的批量 Q 网络与动作集合；当前 Mac 无可用 CUDA/MPS，尚无 GPU 评分的实测吞吐。分层模型的 GPU 评分暂不支持。

```sh
python -m pip install swanlab==0.10.1
printf 'SwanLab API Key: '
read -rs SWANLAB_API_KEY
printf '\n'
export SWANLAB_API_KEY
nohup sh train.sh > train.log 2>&1 &
unset SWANLAB_API_KEY
```

先各跑一轮完整流水线。`--smoke` 会覆盖训练规模为 16 场、1 次更新、1 对开发种子；输出目录必须是新目录。

```sh
# CPU 冒烟
./scripts/launch-douzero.sh --device cpu --python .venv/bin/python \
  --output /data/jaipur-douzero-cpu-smoke --smoke

# CUDA GPU 冒烟（在有 NVIDIA GPU 的服务器执行）
./scripts/launch-douzero.sh --device cuda --python .venv/bin/python \
  --output /data/jaipur-douzero-gpu-smoke --smoke
```

大规模训练命令，目标为**本次运行新增** 1000 万个完整比赛行动样本：

```sh
# CPU
./scripts/launch-douzero.sh --device cpu --python .venv/bin/python \
  --output /data/jaipur-douzero-10m-cpu \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --checkpoint-every 50 --dev-pairs 32

# CUDA GPU
CUDA_VISIBLE_DEVICES=0 ./scripts/launch-douzero.sh \
  --device cuda --python .venv/bin/python \
  --output /data/jaipur-douzero-10m-gpu \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --checkpoint-every 50 --dev-pairs 32
```

`--device auto` 会优先选择 CUDA，其次 MPS，最后 CPU。GPU 服务器想确认**确实用了 GPU 训练**，建议显式指定 `--device cuda`，并检查启动日志的 `device: "cuda"`、`actorDevice: "cpu"`。

## 续训与结果

中断后读取上一目录的 `selection.json`，其中 `latestCheckpoint` 用于继续训练；`bestCheckpoint` 是按开发集选出的候选。续训写到**新**输出目录，并从检查点恢复网络、优化器和随机数状态：

```sh
./scripts/launch-douzero.sh --device cuda --python .venv/bin/python \
  --output /data/jaipur-douzero-continued \
  --resume /data/jaipur-douzero-10m-gpu/model-050.pt \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --checkpoint-every 50 --dev-pairs 32
```

`--target-samples` 在续训目录重新计数；旧检查点的版本号用于区分新旧对局种子。`progress.json` 报告当前批次进度，`training.jsonl` 保存每次更新和开发对局，`completion.json` 表示达到目标，`selfplay-games.jsonl` 保存可重放的完整比赛。默认不保存重复的训练张量；需要逐批审计时加 `--save-batches`，会明显增加磁盘占用。新版默认每 50 轮保存一次编号检查点；开发集成绩刷新、训练结束时也会保存。`selection.json` 的 `latestCheckpoint` 指向最近一次**已保存**的模型，中断时最多损失最近 49 轮的权重更新。已在运行的旧进程仍按启动时的代码保存。

新训练批次会在 `roundMetrics` 里按“一个已完成小局中的一位玩家”记录拿货、拿骆驼、换牌、卖牌次数、卖出的牌数、总行动数和小局得分。SwanLab 同时记录每小局均值、四类行动占比，以及“卖出牌数 ÷ 卖牌行动数”；后者是整个批次的总量之比。每到开发集评估间隔，会生成 AI 曲线与 1600+ 人工玩家水平参考线的对照图。参考值固定在 `data/human-elo1600-action-baseline.json`，来自人工原版对局的训练划分（9 位玩家、1278 条玩家小局记录），Elo 是依据训练划分胜负推算的。此改动不会热更新已经运行的训练进程。

一次本机对照从相同的第 400 轮检查点续训：原设置（探索率 `0.1`、每批 4 遍）第 500 轮在独立 200 局中胜普通 AI `22/200`；改为 `0.01`、每批 1 遍后，第 420 轮在两组互不重叠的独立种子中分别为 `133/200` 和 `135/200`。这是该检查点的实测改善，不能直接当作从零训练的预期胜率。训练 MSE 并非棋力指标，应优先比较独立配对对局。

已启动但未启用 SwanLab 的训练，可在服务器另开终端安装 `swanlab==0.10.1`，通过环境变量提供 API Key，然后运行 `python scripts/dmc-swanlab.py 输出目录 --follow`。该命令先上传 `training.jsonl` 的已有记录，再跟随新记录，直到出现 `completion.json`；只上传汇总指标和配置，不上传完整对局或模型文件。运行地址写入输出目录的 `swanlab-run.json`。

项目名通过 `JAIPUR_SWANLAB_PROJECT` 设置；不要在进程环境里直接设置 `SWANLAB_PROJECT`，因为新版 SwanLab SDK 把它解析为内部结构化配置。训练脚本会默认使用 `jaipur-douzero`。

开发集固定用于选检查点，**不能当最终胜率**。大量训练完成后应使用新的配对种子、交换先后手，与普通 AI、旧 DMC 和困难搜索 AI 分别做完整对局评估；未通过评估前不要替换网页 AI。

## 与困难搜索 AI 对比

`scripts/evaluate-douzero-native.ts` 评估纯 DouZero 模型对原生 `guidedBehavior`；它与网页困难档同用 8 棵树、每步约 1 秒搜索。`scripts/benchmark-native.ts` 的 `douzeroMcts` 则把 DouZero Q 分数变成**根节点先验**，与原 MCTS 先验各占 50%；内部 rollout 和回报没有改用模型。可通过固定每棵树的模拟次数，让融合版与原版每步搜索量相同：

```sh
node scripts/build-ai-research.mjs
JAIPUR_PYTHON=.venv/bin/python \
JAIPUR_DOUZERO_CHECKPOINT=output/jaipur-douzero-10m-scratch-stable-v2-20260928/model-715.pt \
JAIPUR_BENCH_ITERATIONS=1024 \
node --experimental-strip-types scripts/benchmark-native.ts \
  douzeroMcts guidedBehavior 3900004100 4 50
```

2026-09-28 的小样本对照在 4 个新种子上交换先后手，共 8 场、852 次合法行动；双方每步均为 8,192 次模拟，融合版与原版 **4:4**，完整决策平均 **335/330 ms**。逐局记录已独立重放核验。该样本不足以证明融合版更强，且固定模拟次数不等于网页的 1 秒时间预算。

本机 CPU 冒烟及从其检查点续训均已通过；本机没有 CUDA GPU，因此 CUDA 前向和训练须在 GPU 服务器的 `--smoke` 命令上确认。
