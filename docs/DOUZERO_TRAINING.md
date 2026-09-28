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
  --max-updates 2000 --eval-every 50 --dev-pairs 32

# CUDA GPU
CUDA_VISIBLE_DEVICES=0 ./scripts/launch-douzero.sh \
  --device cuda --python .venv/bin/python \
  --output /data/jaipur-douzero-10m-gpu \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --dev-pairs 32
```

`--device auto` 会优先选择 CUDA，其次 MPS，最后 CPU。GPU 服务器想确认**确实用了 GPU 训练**，建议显式指定 `--device cuda`，并检查启动日志的 `device: "cuda"`、`actorDevice: "cpu"`。

## 续训与结果

中断后读取上一目录的 `selection.json`，其中 `latestCheckpoint` 用于继续训练；`bestCheckpoint` 是按开发集选出的候选。续训写到**新**输出目录，并从检查点恢复网络、优化器和随机数状态：

```sh
./scripts/launch-douzero.sh --device cuda --python .venv/bin/python \
  --output /data/jaipur-douzero-continued \
  --resume /data/jaipur-douzero-10m-gpu/model-123.pt \
  --target-samples 10000000 --games-per-update 128 \
  --max-updates 2000 --eval-every 50 --dev-pairs 32
```

`--target-samples` 在续训目录重新计数；旧检查点的版本号用于区分新旧对局种子。`progress.json` 报告当前批次进度，`training.jsonl` 保存每次更新和开发对局，`completion.json` 表示达到目标，`selfplay-games.jsonl` 保存可重放的完整比赛。默认不保存重复的训练张量；需要逐批审计时加 `--save-batches`，会明显增加磁盘占用。每次更新仍保存模型检查点，大规模运行应预留数 GB 空间。

开发集固定用于选检查点，**不能当最终胜率**。大量训练完成后应使用新的配对种子、交换先后手，与普通 AI、旧 DMC 和困难搜索 AI 分别做完整对局评估；未通过评估前不要替换网页 AI。

本机 CPU 冒烟及从其检查点续训均已通过；本机没有 CUDA GPU，因此 CUDA 前向和训练须在 GPU 服务器的 `--smoke` 命令上确认。
