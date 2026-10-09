# DouZero 式训练：约两周 GPU 任务

## 提交资源

- Linux，1 张可由 PyTorch CUDA 使用的 GPU，建议配 16–32 个 CPU 核和 64 GiB 内存。自我对局及默认的行动评分主要使用 CPU；一张更大的 GPU 未必能提高整体吞吐。以任务开始后的实测样本/秒为准。若现有节点是 A100，可直接使用其中一张。
- 持久磁盘建议预留 100 GiB；脚本不保存逐局棋谱及训练张量，只保留最近 10 个编号检查点、初始检查点、最佳检查点和最新检查点。已有同类平铺模型检查点约 10 MiB/个；实际磁盘使用仍要监控。
- 调度器允许约 14 天运行。脚本在 330 小时（13 天 18 小时）后完成当前更新并保存检查点，给 14 天的外部时限留 6 小时缓冲。调度器若有比 14 天更短的单任务上限，可分段运行并用新输出目录和上段的 `latestCheckpoint` 续训。

这个任务从随机权重开始，使用平铺的 DouZero 行动价值网络和“同种货物一次卖完”的候选行动限制，不使用此前的 `model-180` Belief Zero 权重。每批 128 场已完成比赛后更新一次 Q 网络，更新后立即同步采样模型；**训练中没有 MCTS 模拟次数**。采样探索率 0.01，每批训练 1 遍，8 个自我对局 worker、4 个 CPU 评分进程，每 worker 并行推进 16 场。训练用 CUDA，行动评分默认用 CPU。`scripts/train-douzero-14d.sh` 是完整入口。

## 环境和启动

Node.js 至少 22.13；Python 至少 3.10，安装 `numpy`、可用 CUDA 的 `torch`，建议安装 `orjson`，需要在线曲线再安装 `swanlab==0.10.1`。PyTorch CUDA 包按[官方安装选择器](https://pytorch.org/get-started/locally/)选择，并先检查 `torch.cuda.is_available()`。运行 `npm ci` 安装 Node 依赖。周期 MCTS 评测需要 C++20 编译器（`c++` 或通过 `CXX` 指定），启动时自动编译原生搜索并保存到本次输出目录的 `mcts-bin/`；不需要 `em++` 或重建 Wasm。

在作业环境中通过密钥管理器注入 `SWANLAB_API_KEY`；不要把密钥写进脚本或任务日志。没有密钥时仍会写本地 `training.jsonl`。默认上传到独立项目 `jaipur-douzero-14d`；可用 `JAIPUR_SWANLAB_PROJECT` 覆盖。复用旧项目会保留其已有图表和分组布局，空分组需在网页中整理，代码不会删除远端布局。在仓库根目录运行：

```bash
export CUDA_VISIBLE_DEVICES=0
export JAIPUR_DOUZERO_PYTHON=python
export JAIPUR_DOUZERO_OUTPUT=/data/jaipur-douzero-14d-20261008
./scripts/train-douzero-14d.sh
```

提交系统应把标准输出和错误输出保存到**输出目录外**的作业日志，并给作业设置约 14 天时限。若使用 Slurm，可用 `--time=14-00:00:00`、`--cpus-per-task=16`、`--mem=64G` 及集群支持的 GPU 请求选项；分区、账户和具体 GPU 型号由集群管理员填写。[Slurm 的 sbatch 选项](https://slurm.schedmd.com/sbatch.html)和 [GPU GRES 说明](https://slurm.schedmd.com/gres.html)给出各参数格式。

若服务器实测表明 GPU 批量行动评分更快，可在**新的**训练段设 `JAIPUR_DOUZERO_ACTOR_DEVICE=cuda JAIPUR_DOUZERO_SCORERS=1`；先用短任务比较样本/秒，不要仅凭 GPU 利用率切换。每次启动都需要全新的输出目录。

## 保存、观察与续训

- 每 500 次更新保存一次编号检查点；到 330 小时会完成当前更新并保存当前模型。主进程收到 SIGINT/SIGTERM 时也会尝试在当前更新结束后保存，但调度器若直接强制杀死整个作业，只能回退到最近的已保存检查点。每 500 次更新用固定开发种子与普通 AI 对战 128 场，记录胜率；该开发集只用于过程诊断，不能作为最终棋力结论。
- `training.jsonl` 记录每批样本、对局、MSE、耗时和周期评测；`selection.json` 记录 `latestCheckpoint` 与 `bestCheckpoint`；`completion.json` 的 `phase` 为 `training-stopped` 且 `stopReason` 为 `time-limit` 时表示内部时限正常收尾。
- 训练源目录和所有检查点必须位于持久磁盘。可按固定间隔备份 `selection.json`、`training.jsonl` 和仍保留的检查点。禁用逐局棋谱后，不能事后逐手重放整个训练过程；保留的汇总指标仍可分析行动比例和完整比赛表现。
- 节点提前终止时，从 `selection.json` 的 `latestCheckpoint` 续训到**新**目录。例如设置 `JAIPUR_DOUZERO_RESUME=/data/jaipur-douzero-14d-20261008/model-XXXXX.pt`、`JAIPUR_DOUZERO_OUTPUT=/data/jaipur-douzero-14d-part2`，再执行同一脚本。新段的 330 小时时限重新计数；按剩余资源时长设置 `JAIPUR_DOUZERO_MAX_HOURS`。

以前该项目在 A100 上每 128 场约 25–35 秒，动作样本约 1.3–1.9 万/批。若这次机器维持类似速度，330 小时约能完成 3–5 万次更新、约 4–8 亿动作样本；CPU 配额、行动分布、评测和 I/O 都会改变实际速度。第 1 小时用 `training.jsonl` 重新估算，不把这个范围当作保证。

## SwanLab 图表

行动比例及每人每小局指标使用双曲线图：AI 自我对局曲线与 1600+ 人类参考水平虚线。首次更新即出图，之后每 25 次更新刷新，结束时补上末次数据；可用 `JAIPUR_SWANLAB_CHART_EVERY` 调整。参考行动比例：拿货 33.40%、拿骆驼 15.32%、换牌 19.81%、卖牌 31.47%。参考统计来自 9 位 1600+ 选手的 1278 个玩家小局。

新项目把比较图放在 `selfplay` 分组，原始标量继续上传但默认隐藏，避免重复图表。SwanLab 已存在的图表布局不会被后续 `define_metric` 改写；旧项目中的图需要手动整理或改用新项目。

检查点间隔和数量可用 `JAIPUR_DOUZERO_CHECKPOINT_EVERY`（默认 500）、`JAIPUR_DOUZERO_CHECKPOINT_MAX`（默认 10）覆盖。周期 MCTS 评测、开发集刷新最佳模型及停止时也会保存必要的检查点。

## 恢复 SwanLab 上传，训练保持运行

若本地 `training.jsonl` 继续增长而云端停更，更新 `scripts/dmc-swanlab.py` 后可启动独立的日志续传进程。它不启动采样或学习，不加载检查点。使用已验证的 SDK `swanlab==0.10.1`。指定原实验的项目、工作区和 ID，`resume=must` 会在 ID 不存在时失败，防止误建新实验。

```bash
RUN=/data/feiyu/code/Jaipur/output/jaipur-douzero-14d-20261008
# SWANLAB_API_KEY 已在当前环境中配置。
nohup python scripts/dmc-swanlab.py "$RUN" \
  --follow --resume --run-id a0d0bbub \
  --project jaipur-dmc --workspace franzyu \
  --heartbeat-seconds 300 \
  > "$RUN/swanlab-recovery.log" 2>&1 < /dev/null &
echo $! > "$RUN/swanlab-recovery.pid"
tail -f "$RUN/swanlab-recovery.log"
```

上述 ID 是本次恢复目标，其他实验需替换。日志会显示 `processed_iteration` 和 `backfill_complete`，表示本地记录已交给 SDK，并不等于云端确认全部收妥；在网页确认曲线推进。进程重启时重新读取本地日志，恢复 SDK 按每个指标的云端最后步数跳过已有数据，累计样本等统计不会只计算遗漏部分。历史比较图只重绘最新窗口一次，之后随新增数据正常更新。

等待期间每 5 分钟上传隐藏的 `monitor/heartbeat_unix` 和 `monitor/last_training_iteration`，不伪造训练 loss 或训练步。SDK 自身也有在线心跳；若服务器网络不通或上传进程退出，仍可能显示中断。独立进程跟踪到 `completion.json` 后正常收尾；没有完成文件则持续跟踪。只启动一个续传进程，目录锁会阻止重复恢复进程。不要直接杀死训练启动的原 `dmc-swanlab.py` 子进程：旧训练进程与它存在应答依赖，可能因此退出；新的续传进程可以单独管理。

以后新启动的内置 tracker 也会在等待训练或 MCTS 评测时每 5 分钟上传上述状态，无需额外恢复进程。当前已运行的旧进程不会热更新，独立跟踪用于此次补传和后续持续上传。

## 周期 MCTS 评测

默认每 6 小时，在当前训练批次结束后保存最新模型，进行 **DouZero 模型 + MCTS vs 原 MCTS**。20 个固定配对种子、交换先后手，共 40 场完整比赛；双方均使用 8 棵树、每棵 1024 次模拟（每步合计 8192 次）。评测暂停训练，时间计入 330 小时作业预算；结果只观察棋力，不决定采样模型更新或开发集最佳检查点。错过的评测间隔不会补跑。

SwanLab 记录 `mcts/model_win_rate`、双方胜场、场数、模型版本、模拟次数及耗时；本地结果在 `mcts/model-版本.json`，过程日志在相邻 `.log`。失败会记录 `mctsError` 和失败指标，继续训练并在下一周期再评测。结束信号会终止正在进行的评测进程组，已保存模型可用于续训。

可用 `JAIPUR_DOUZERO_MCTS_EVERY_HOURS`、`JAIPUR_DOUZERO_MCTS_PAIRS`、`JAIPUR_DOUZERO_MCTS_SIMULATIONS` 调整；间隔设为 0 可禁用周期评测。首轮约在启动 6 小时后，不是每 6 小时都保证准点。

## 训练后独立评测

训练中的固定种子周期评测用于观察趋势。正式结论使用未参与训练和开发的种子，分别测纯模型对普通 AI、以及**模型根先验 + MCTS 对原 MCTS**；双方交换先后手并固定相同搜索次数。后一项可用 `scripts/benchmark-native.ts` 的 `douzeroMctsFullSale` 对 `guidedBehavior`，并增加 `guidedFullSale` 对照以分辨行动限制的影响。例如在评测节点编译原 MCTS 后：

```bash
node scripts/build-ai-research.mjs
export JAIPUR_DOUZERO_CHECKPOINT=/data/jaipur-douzero-14d-20261008/model-XXXXX.pt
JAIPUR_BENCH_ITERATIONS=1024 node --experimental-strip-types \
  scripts/benchmark-native.ts douzeroMctsFullSale guidedBehavior 3900019000 100 50
```

这里的 `model-XXXXX.pt` 用 `selection.json` 中的 `latestCheckpoint` 替换，也应单独测试 `bestCheckpoint`。建议至少 100 个配对种子（200 场）再讨论是否优于原策略；训练 MSE 下降不能替代胜率。上述最终独立评测可另提任务；训练中的周期 MCTS 评测已计入 330 小时预算。
