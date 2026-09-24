# Linux 容器训练：从随机权重开始

## 一条命令启动

在项目根目录，安装好 Docker Engine 和 Compose v2 后：

```bash
docker compose --profile train up --build train
```

首次启动从随机权重开始，无需拷贝模型、旧训练记录或dev数据。默认新增 **32768场** PPO 自我对局（1024批，每批32场），CPU线程数4。训练容器与游戏网页服务独立，显式指定 `train` 只启动训练服务。Compose没有 `up --train` 参数；这里用 `train` profile。[Docker官方说明](https://docs.docker.com/compose/how-tos/profiles/)

后台启动和查看进度：

```bash
docker compose --profile train up -d --build train
docker compose logs -f train
```

停止：

```bash
docker compose stop train
```

每10手输出筹码比分和印章；每批输出训练指标。完成后自动回放检查全部比赛，不自动部署新模型。

## 调整训练量

```bash
TRAIN_GAMES=4096 TRAIN_THREADS=8 docker compose --profile train up --build train
```

也可复制 `.env.example` 为 `.env` 后修改。`TRAIN_GAMES` 必须是32的正整数倍，表示**本次追加场数**。训练暂时是CPU执行，未接CUDA；增加线程不保证更快，自我对局仍由Node进程执行。

镜像使用Node22、Python3和CPU版PyTorch2.14.0。Node用于规则模拟与策略推理，Python用于梯度更新。镜像只包含训练代码，不打包 `analysis/`、检查点、运行日志或密钥。支持CPU wheel所覆盖的Linux amd64/arm64平台。

## SwanLab实时文字日志

在Linux bash中输入密钥，再启动（避免把密钥直接写入命令历史）：

```bash
read -rsp 'SwanLab API key: ' SWANLAB_API_KEY; echo
export SWANLAB_API_KEY
docker compose --profile train up --build train
```

或者在已被Git忽略的 `.env` 中设置 `SWANLAB_API_KEY`。默认 `TRAIN_SWANLAB=auto`：有密钥则在线记录，没有密钥则只保存本地日志，训练不会停在交互式登录。`TRAIN_SWANLAB=on` 要求密钥存在，`off` 关闭在线上传。

每10手进度进入SwanLab的**日志**页，同时输出指标图表。SwanLab链接保存在每次运行的 `swanlab-run.json` 中。容器总体结果看 `status.json`，它在训练后回放核验完成后才标记 `completed`。

## 文件与断点续训

宿主机默认输出：

```text
training-runs/
  run-<UTC时间>-<短ID>/
    request.json          # 本次请求（不含密钥）
    config.json           # 实际训练配置、初始化方式、源模型哈希
    model.pt              # 最近完整训练批次的原子检查点
    model.json            # 部署推理权重
    model-016.pt           # 每16轮及本次末轮额外快照
    past.json             # 历史对手
    training.json         # 各批训练指标
    selfplay-games.jsonl  # 完整比赛动作
    container.log         # 本地文字日志
    verification.json    # 训练结束后完整回放核验
    status.json           # completed / interrupted / failed
```

默认 `TRAIN_RESUME=auto`：第一次无检查点时从0训练；再次启动时，读取输出目录中最新运行的完整 `model.pt`，再追加 `TRAIN_GAMES` 场。恢复模型、AdamW、Python/PyTorch随机状态和历史对手；维持源运行的发牌seed基数，并从下一轮继续。

停止或断电最多丢弃未完成的当前批次。恢复会建立新的运行目录，不覆盖旧记录；`verification.json` 只核验这次追加的比赛。发生突然崩溃时，旧目录可能没有最终status或仍有部分日志，以原子保存的model.pt为恢复依据。

明确从随机权重重开：

```bash
TRAIN_RESUME=none TRAIN_RANDOM_SEED=1234 docker compose --profile train up --build train
```

指定已有检查点所在运行目录（替换示例目录名）：

```bash
TRAIN_RESUME=run-20260924T120000-abcd1234 docker compose --profile train up --build train
```

指定目录名相对于容器 `/runs`。`TRAIN_OUTPUT_DIR=/data/jaipur-training` 可更换宿主机挂载目录；恢复时应挂载原有目录。`docker compose up` 遇到已经运行的服务不会并行再开一份；多任务应使用不同Compose项目名和不同输出目录。

## 本版训练设置

这是公开历史GRU策略／价值模型的fresh PPO，从随机网络直接开始，没有行为克隆预训练和外部教师。每批32场，对手包括当前模型、一个近期历史快照及normal；仍使用整场±1奖励。

容器默认 `INFORMATION_BALANCED_SEATS=1`，已解耦对手类型与座位：normal在每批覆盖两个座位，两批合计平衡。旧历史实验的采集脚本默认仍保留原模式以便复现；设置0可显式复现原始座位安排。其余网络、PPO超参数和单历史快照机制未改动。

训练不调用1秒树搜索。后续棋力应在独立种子上评测，训练loss和自我对局50%胜率均不能代替棋力结论。

## 本机验证范围

已使用同一入口在宿主机运行从0训练32场，再自动恢复追加32场，共12055次行动全部回放通过；同时检查了优化器恢复、下一批种子不重复以及normal训练双方座位覆盖。无需任何旧模型或dev文件。当前开发环境没有Docker可执行程序，因此未在本机实际构建或启动镜像；Linux上的镜像构建仍需拉取基础镜像及PyTorch依赖。
