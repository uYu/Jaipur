# 738 与 612：扩大独立直接对战

方案在评测前固定于 [PLAN.md](PLAN.md)：512 个新配对种子，交换座位，共 1,024 场完整比赛。双方均为纯 DMC，直接评分全部合法行动。

新模型 `model-738.pt` 对旧最佳 `model-612.pt` 为 **542:482**，胜率 **52.93%**。按种子为新模型 2:0 **139** 个、1:1 **264** 个、旧模型 2:0 **109** 个。预先指定的配对双侧精确检验 `p=0.0653`，未达到 `p<0.05` 的判据。结果有小幅正向趋势，但还不足以声称稳定提升；保留 612 为已有研究基准，不切换默认 AI。

[verification.json](verification.json)独立回放了全部 **1,024 场、117,733 次行动**，核对动作合法、完整终局、胜负及种子座位配对；截断为 0。[原始逐局日志](new-versus-old.games.jsonl)和[机器汇总](new-versus-old.json)保留全部证据。纯 DMC 的直接对战不能代替 1 秒 MCTS 融合评测。

汇总指标已上传至私有 [SwanLab 实验](https://swanlab.cn/@franzyu/jaipur-dmc/runs/msoe8ul5)；原始对局日志仍留本地。

复现需安装 PyTorch 和 NumPy：

```sh
JAIPUR_PYTHON=/path/to/python \
node --experimental-strip-types scripts/evaluate-dmc.ts \
  analysis/dmc-resume-fast-2026-09-24/model-738.pt \
  analysis/dmc-resume-confirm-repro/new-versus-old \
  3700000000 512 analysis/dmc-10m-2026-09-24/model-612.pt
```

上面的种子已用于评测，重复运行不产生新的独立证据。
