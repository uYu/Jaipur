# 从零自我对局训练（研究版）

这个流程从**随机初始化的策略/价值网络**开始，不读取旧 DMC 模型、人工棋谱或固定教师训练集。每代由当前最佳模型引导 MCTS 自我对局，学习搜索访问分布与整场胜负。学习模型每代接着上一代的权重继续训练；每隔 `--gate-every` 代，才让最新学习模型与当前最佳模型交换先后手对战，达到门槛才升版。默认在第 10、20、30… 代做升版对局。每隔 `--arena-every` 代，用相同模拟次数对照原 MCTS（关闭神经策略先验），结果写入 `run.json`；默认在第 100、200、300… 代评测。

它借鉴 [AlphaGo Zero](https://www.nature.com/articles/nature24270) 的随机初始化、自我对局、搜索策略标签、胜负目标和候选升版闭环。**Jaipur 是暗牌游戏，当前不是完整 AlphaGo Zero**：网络只读取玩家可见的公开信念特征，策略先验接在确定化 MCTS 的根节点；价值头虽然训练了整场胜负，但尚未在叶节点估值。搜索内部仍用原有启发式先验与 rollout。不能把确定化世界的真实对手手牌直接送入价值头。暗信息博弈的公共信念搜索可参考 [ReBeL](https://papers.nips.cc/paper_files/paper/2020/file/c61f571dbd2fb949d3fe5ae1608dd48b-Paper.pdf)。

## 模型规模先导试验

正式训练前直接复用已有的一批搜索对局数据，**不再跑自我对局或 MCTS 对战**。三种网络从随机权重训练同一数据，比较验证集损失、行动吻合率、参数量与纯网络前向耗时：

```sh
python3 scripts/ablate-belief-size.py \
  --train-data output/jaipur-belief-size-pilot-20260930/data/train.jsonl \
  --validation-data output/jaipur-belief-size-pilot-20260930/data/validation.jsonl \
  --directory output/jaipur-belief-size-fast \
  --widths 16 64 128 256 512 1024 --epochs 50 \
  --select-objective policy
```

这批数据此前由不接神经先验的 MCTS 生成，规模筛选不会重新生成。`results.json` 给出策略交叉熵、胜负 BCE、搜索首选行动吻合率、训练耗时和纯网络速度。当前搜索只使用策略头，因此检查点按策略验证损失挑选，价值 BCE 仅作为诊断。离线结果只能选较合理的容量，不能直接代表自我对局后的棋力；正式训练中仍按计划定期对原 MCTS 测胜率。策略和价值各是一层隐藏层的 MLP，总参数量为 `312 × hidden + 2`。

2026-09-30 的七档实测与选择依据见 `analysis/belief-zero-scale-2026-09-30/README.md`。1024 是**离线策略指标**和成本的当前折中；随后对无模型先验 MCTS 的 80 场复核为 38:42，没有显示实战提升。正式长训尚未启动。

## 正式训练命令

```sh
python3 scripts/run-belief-zero.py \
  --directory output/jaipur-zero-from-scratch \
  --hidden 1024 --generations 1000 \
  --games-per-generation 128 --validation-games 16 \
  --simulations-per-tree 128 --workers 4 \
  --epochs 15 --replay-generations 5 \
  --gate-every 10 --gate-pairs 100 --gate-threshold 0.55 \
  --arena-every 10 --arena-pairs 50
```

这组正式参数训练 1000 代；第 10、20、…、1000 代做升版比赛和原 MCTS 对照，共各 100 次。原 MCTS 每次用 50 组种子交换先后手，**共 100 场**；升版比赛维持每次 100 组配对种子，共 200 场。脚本的 `--arena-every` 默认仍为 100，以上正式命令显式覆盖为 10。

Python 环境须装 `torch`、`numpy`；Node.js 至少 22.13，并需本机 C++ 编译器。`--workers` 控制并行自我对局进程。每步搜索次数是 `8 × --simulations-per-tree`，候选升版和原 MCTS 对照逐步校验次数一致。`run.json` 的 `learner` 是每代继续更新的模型，`champion` 是自我对局使用的最佳模型；未到升版轮时 `gate` 为 `null`，即使一次升版未通过，下一代也从最新 `learner` 继续训练。输出包含每代模型、训练/验证对局、定期比赛记录及可恢复的 `run.json`；二进制只在模型参加自我对局或评测时编译。中断后用相同参数重跑命令；也可以只增大 `--generations` 延长训练。已完成的代不会重训，中断的代会重新生成。请为正式训练使用新的输出目录，不要把先导试验目录作为起点。

若极少数比赛连续换牌超过 700 手，该比赛会丢弃并计入 `selfplay.truncated`；单批超过约 5%（或全批没有完成比赛）则失败，避免把不完整对局当作胜负训练样本。训练/验证种子及升版/原 MCTS 评测种子使用互不重叠的区间。

旧模型对照的经验表明，离线损失下降不保证胜率提升；升版只看交换先后手的对局门槛，原 MCTS 对照作为独立进度指标。上述正式长训目前尚未启动。

本机两代完整计时见 `analysis/belief-zero-timing-2026-09-30/README.md`。每代的 `timings` 字段记录实际发生的采样、准备、训练、编译、比赛及总耗时；非升版轮不会出现升版比赛计时。正式规模的耗时估计来自小配置外推，应以正式运行的实际 `timings` 更新。

## 后台训练并上传 SwanLab

先在仓库根目录准备现有虚拟环境：`.venv/bin/python -m pip install numpy torch swanlab==0.10.1`。下面是 zsh 命令；密钥通过交互输入，不会写入脚本、训练配置或 shell 历史。请在两个 `nohup` 命令执行前保持同一个终端会话。若在服务器使用其他 Python 环境，将两处 `.venv/bin/python` 换成该环境的 Python 路径。

```zsh
read -s "SWANLAB_API_KEY?SwanLab API key: "
echo
export SWANLAB_API_KEY
mkdir -p output/jaipur-zero-from-scratch

nohup .venv/bin/python scripts/run-belief-zero.py \
  --directory output/jaipur-zero-from-scratch \
  --hidden 1024 --generations 1000 \
  --games-per-generation 128 --validation-games 16 \
  --simulations-per-tree 128 --workers 4 \
  --epochs 15 --replay-generations 5 \
  --gate-every 10 --gate-pairs 100 --gate-threshold 0.55 \
  --arena-every 10 --arena-pairs 50 \
  > output/jaipur-zero-from-scratch/train.log 2>&1 < /dev/null &

nohup .venv/bin/python scripts/track-belief-zero-swanlab.py \
  output/jaipur-zero-from-scratch --follow \
  > output/jaipur-zero-from-scratch/swanlab.log 2>&1 < /dev/null &
```

跟踪器先补传 `run.json` 中已完成的代，再随训练上传新代的采样数、验证损失、升版胜率、原 MCTS 胜率和阶段耗时。两个进程相互独立；跟踪器故障不会打断训练。SwanLab 运行地址和最后已上传代保存在 `output/jaipur-zero-from-scratch/swanlab-run.json`。跟踪器可用相同命令重启并从已上传代继续；正式训练完成 1000 代后自行退出。查看运行状态：

```sh
tail -f output/jaipur-zero-from-scratch/train.log
cat output/jaipur-zero-from-scratch/swanlab-run.json
```

只补传现有记录时，省略 `--follow`。跟踪器只上传汇总指标和训练配置，不上传原始对局、模型权重或 API 密钥。若训练需要超过 1000 代，使用相同参数并提高 `--generations` 续训，然后重新启动跟踪器。
