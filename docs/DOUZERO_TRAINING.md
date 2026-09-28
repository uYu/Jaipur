# DouZero 式 Jaipur 模型：CPU / GPU 自我对局训练

训练入口为 [`scripts/launch-douzero.sh`](../scripts/launch-douzero.sh)。模型采用当前公开历史 LSTM + 行动条件 Q 网络；每个训练样本来自**已完成整场比赛**中实际执行的行动，目标是行动方的整场胜负 `+1/-1`。`--device` 选择**权重更新**设备；自我对局行动评分始终在 CPU 上进行，每次更新后从训练模型同步一次权重。16 条游戏轨道由 Node.js 同步推进，游戏规则和公开手牌后验也由 CPU 处理。这样可以先验证 GPU 训练收益，推理部署以后再单独优化。

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

从零训练可直接运行仓库根目录的 `train.sh`：默认 CUDA、1000 万样本、每 128 场更新一次、每 50 轮评估和保存一次检查点，写入新的 `output/jaipur-douzero-10m-fresh` 目录。脚本不传 `--resume`；若该目录已有 `config.json`，会拒绝覆盖。设置 `SWANLAB_API_KEY` 并安装 `swanlab==0.10.1` 后，训练开始时会自动在线记录，无需另开回填进程。可以用 `JAIPUR_DOUZERO_OUTPUT` 改输出目录。

`--actors N --actor-lanes M` 使用 N 个 CPU worker 并行推进比赛，再由主进程合并行动评分请求；默认 `N=1` 保持原来的串行流程。在本机的一轮 128 场对照中，串行版 18,600 个样本耗时 14.8 秒，4 个 worker、每个 16 条轨道的并行版 18,064 个样本耗时 12.2 秒，样本吞吐约提高 18%；这只是单轮吞吐测试，不代表棋力提高。Mac 训练可设置 `JAIPUR_DOUZERO_DEVICE=cpu JAIPUR_DOUZERO_ACTORS=4 JAIPUR_DOUZERO_ACTOR_LANES=16`。

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

已启动但未启用 SwanLab 的训练，可在服务器另开终端安装 `swanlab==0.10.1`，通过环境变量提供 API Key，然后运行 `python scripts/dmc-swanlab.py 输出目录 --follow`。该命令先上传 `training.jsonl` 的已有记录，再跟随新记录，直到出现 `completion.json`；只上传汇总指标和配置，不上传完整对局或模型文件。运行地址写入输出目录的 `swanlab-run.json`。

项目名通过 `JAIPUR_SWANLAB_PROJECT` 设置；不要在进程环境里直接设置 `SWANLAB_PROJECT`，因为新版 SwanLab SDK 把它解析为内部结构化配置。训练脚本会默认使用 `jaipur-douzero`。

开发集固定用于选检查点，**不能当最终胜率**。大量训练完成后应使用新的配对种子、交换先后手，与普通 AI、旧 DMC 和困难搜索 AI 分别做完整对局评估；未通过评估前不要替换网页 AI。

本机 CPU 冒烟及从其检查点续训均已通过；本机没有 CUDA GPU，因此 CUDA 前向和训练须在 GPU 服务器的 `--smoke` 命令上确认。
