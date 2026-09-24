# 1 秒 MCTS 初筛（按用户要求提前停止）

预定配置见 [PLAN.md](PLAN.md)。用户看到前 15/16 局的表现后要求停止，因此第 16 局只进行到第 20 手，没有终局记录，也没有完成预定的座位交换配对。此实验不产出正式的 16 局结论，不据此升版。

- 已完成 15 局：738 根先验融合候选 7 胜，`guidedBehavior` 基线 8 胜。
- `partial-verification.json` 独立重放了这 15 局的 1,584 个合法行动，确认终局和胜负；缺少种子 41008、候选座位 1 的完整对局。
- `live-moves.jsonl` 保存已送入 SwanLab 的每 10 手及轮末比分进展；终端日志采集在用户要求停止时一并中断。
- SwanLab 实验：https://swanlab.cn/@franzyu/jaipur-dmc/runs/o4pbte5c ，其「日志」标签展示逐手进展，运行状态可能显示为中断。

观察到的 7:8 没有显示优势，但样本小且最后一组种子未配对完成，不能作为确定的性能差异结论。

针对 MCTS＋模型的实现与研究目标，另见 [算法对齐审查](ALGORITHM_AUDIT.md)。

用户明确指定的 IJCAI 2021 论文是 AP-MCTS；与本项目实现的逐项差异见 [论文对照](AP_MCTS_COMPARISON.md)。
