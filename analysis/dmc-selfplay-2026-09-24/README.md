# DouZero 风格 DMC 自我对局试验

## 结果

[SwanLab 实验](https://swanlab.cn/@franzyu/jaipur-dmc/runs/szoxikri) 已补传本次训练与最终评测，共 279 条记录。模型没有升为默认 AI。

从随机权重开始，完成 **1,536 场比赛、179,185 条行动样本、12 次策略更新**；没有超长截断比赛。每轮计时之和约 254 秒，含轮内开发评测，不含启动和初始评测。

开发集固定 4 个种子、交换座位，共 8 场。版本 0、3、6、9、12 的胜负依次为 **0:8、1:7、2:6、2:6、1:7**。按开发对局成绩选择 `model-006.pt`，同分保留较早版本；没有按 MSE 或最终测试集重新选模型。

| 独立测试                                 | 候选胜:负 | 配对种子数 | 候选平均完整决策耗时 |
| ---------------------------------------- | --------- | ---------- | -------------------- |
| 随机初始模型 vs TS 普通 AI               | 0:32      | 16         | 1.26 ms              |
| 选中模型 vs TS 普通 AI                   | 4:28      | 16         | 1.30 ms              |
| 选中模型 vs 随机初始模型                 | 16:0      | 8          | 1.58 ms              |
| 选中模型 vs guidedBehavior，1 秒搜索预算 | 0:2       | 1          | 1.39 ms              |
| 选中模型 vs guidedBehavior，2 秒搜索预算 | 0:2       | 1          | 1.73 ms              |

所有测试均完整打到两枚胜利印章，并交换座位，没有截断。DMC 直接评分全部合法行动，不搜索；1 秒和 2 秒是对手的搜索预算。最后两组样本很小，不能用来精确估计胜率。普通 AI 指 TypeScript `normal`，搜索对手使用现有 `guidedBehavior`，未混入其他战术剪枝实验。

这轮学到了超过随机初始化的策略，但明显弱于普通 AI。尚未验证它作为搜索先验或 rollout 策略是否有收益，不能据此升版。

## 方法与论文差异

采用 [DouZero 论文](https://arxiv.org/pdf/2106.06135) 的 Deep Monte Carlo 核心循环：当前策略以 epsilon-greedy 完成自我对局，把实际终局回报赋给执行过的状态—行动样本，回归 Q 值，再通过最大 Q 值选择动作。没有搜索访问分布、旧 AI 标签或 TD bootstrap。

本次是 CPU 小规模适配：共享座位相对网络 `170→128→128→1`，16 个同步环境，每批 128 场，RMSprop 学习率 1e-4，每批 4 个 epoch。前两批 epsilon=0.2，其后 0.1。输入为 146 维公开观察及已有手牌后验，加 24 维行动编码；没有照搬原论文的历史 LSTM、大网络及 GPU 并行训练规模。

目标为整场比赛胜负，按当时行动玩家视角取 ±1。所有合法卖牌数量、交换组合都保留。超过 700 次行动的比赛丢弃，不伪造终局标签。训练权重随机初始化，但输入使用了已有的公开信息推断代码。

## SwanLab 接入

`scripts/selfplay-dmc.ts` 在设置 `SWANLAB_API_KEY` 或 `SWANLAB_MODE` 时自动启动独立记录进程；每轮保存本地日志后同步云端。云端不可用会明确报错，本地日志可补传。成功与失败结束状态分开记录。

记录分组：`train`（MSE、版本、探索率、样本）、`selfplay`（完整/截断比赛、步数）、`time`、`dev`（胜负与胜率）、`selection`（选中版本）。补传还会收集 `heldout` 和 `initial` 独立评测。

密钥仅从环境变量读取，调用 `swanlab.login(save=False)`；默认私有项目 `jaipur-dmc`。关闭自动 Git、运行环境和终端采集，仅上传显式参数与汇总指标。原始对局、训练张量和模型文件保留在本地。

```sh
python3 -m pip install -r scripts/requirements-dmc.txt
# 在本地 shell 设置 SWANLAB_API_KEY，勿写入代码或提交到 Git。
node --experimental-strip-types scripts/selfplay-dmc.ts analysis/dmc-next 12 128

# 补传一个已完成的目录（每次会新建实验）
python3 scripts/dmc-swanlab.py analysis/dmc-selfplay-2026-09-24 --backfill

# 从指定模型继续，使用新的输出目录
node --experimental-strip-types scripts/selfplay-dmc.ts analysis/dmc-resume 12 128 analysis/dmc-selfplay-2026-09-24/model-006.pt
```

可设置 `SWANLAB_PROJECT`、`SWANLAB_EXPERIMENT_NAME`，或 `SWANLAB_MODE=offline` 离线记录。`JAIPUR_PYTHON` 可指定安装了 Torch 和 SwanLab 的解释器。本次实际使用 `/tmp/jaipur-swanlab-venv/bin/python`，SDK 版本 0.10.1。

## 校验与数据

- `tests/dmc.test.ts`：超过 300 个局面与引擎独立合法动作枚举对比；修改真实隐藏牌与奖励值不改变公开输入。
- `data-verification.json`：独立回放两场训练比赛，核验全部 238 条输入及行动玩家视角终局标签。
- SwanLab 历史补传和实时离线训练均完成实际运行验证；TypeScript 编译通过。
- `training.jsonl`、`selfplay-games.jsonl`、`batch-*.npz` 保存原始训练证据；`selection.json` 保存开发集选择；`evaluation-summary.json` 汇总最终测试。

训练 MSE 来自各轮不同批次，不能当成固定验证集误差曲线；模型升版仍须以充分数量的完整配对对局为依据。
