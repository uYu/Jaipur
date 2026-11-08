import { useEffect, useState } from "react";
import type { Card, Save } from "../game/types.ts";
import { GoodsArt } from "./Art.tsx";
import { LABEL } from "../game/data.ts";
import { replayBoardIndex } from "../game/replay-position.ts";
import type { ReplayMoment } from "../game/replay-position.ts";
import type { ReplayMove } from "../game/replay-value.ts";
import type { ReplayValuePoint } from "../game/replay-value.ts";
import "../replay-value.css";
import "../replay-layout.css";
import { ArrowRight, Coins, Hand, ArrowDownToLine } from "lucide-react";

const cache = new WeakMap<Save, ReplayValuePoint[]>();
const format = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;

function ReviewGoods({ cards }: { cards: Card[] }) {
  return (
    <span className="review-goods">
      {[...new Set(cards)].map((good) => {
        const count = cards.filter((g) => g === good).length;
        return (
          <span
            key={good}
            className={`review-good ${good}`}
            role="img"
            aria-label={`${LABEL[good]} ${count} 张`}
            title={`${LABEL[good]} ×${count}`}
          >
            <GoodsArt good={good} cardFace />
            <span className="review-good-name">{LABEL[good]}</span>
            <b>×{count}</b>
          </span>
        );
      })}
    </span>
  );
}
function ReviewMove({ move }: { move: ReplayMove }) {
  const Icon =
    move.type === "sell"
      ? Coins
      : move.type === "camels"
        ? ArrowDownToLine
        : Hand;
  return (
    <div
      className="review-move"
      aria-label={
        move.type === "exchange"
          ? "交换：付出换入"
          : move.type === "sell"
            ? "卖出"
            : "拿取"
      }
    >
      {move.give.length > 0 && <ReviewGoods cards={move.give} />}
      {move.type === "exchange" ? (
        <ArrowRight className="review-move-direction" aria-hidden="true" />
      ) : (
        <Icon className="review-move-direction" aria-hidden="true" />
      )}
      {move.take.length > 0 && <ReviewGoods cards={move.take} />}
    </div>
  );
}
function ReviewChoice({
  label,
  move,
  value,
  recommended = false,
}: {
  label: string;
  move: ReplayMove;
  value: number;
  recommended?: boolean;
}) {
  return (
    <div className={`review-choice ${recommended ? "is-recommended" : ""}`}>
      <b className="review-choice-label">{label}</b>
      <ReviewMove move={move} />
      <strong
        className="review-choice-value"
        aria-label={`模型评分 ${format(value)}`}
      >
        {format(value)}
      </strong>
    </div>
  );
}

export function ReplayValueChart({
  save,
  index,
  moment,
  onSeek,
}: {
  save: Save;
  index: number;
  moment: ReplayMoment;
  onSeek: (index: number) => void;
}) {
  const [points, setPoints] = useState<ReplayValuePoint[]>(
    () => cache.get(save) ?? [],
  );
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const cached = cache.get(save);
    setPoints(cached ?? []);
    setError("");
    if (cached) return;
    const worker = new Worker(
      new URL("../game/replay-value.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({ data }) => {
      if (data.error) {
        setError(data.error);
        worker.terminate();
        return;
      }
      setPoints(data.points);
      if (data.complete) {
        cache.set(save, data.points);
        worker.terminate();
      }
    };
    worker.onerror = () => {
      setError("模型分析未完成，请重试");
      worker.terminate();
    };
    worker.postMessage(save);
    return () => worker.terminate();
  }, [save, retry]);
  const total = save.events.length;
  const point = points[index];
  const viewedIndex = replayBoardIndex(index, moment);
  const viewedPoint = points[viewedIndex];
  const previous = points[index - 1];
  const delta =
    point?.value != null &&
    previous?.value != null &&
    point.round === previous.round
      ? point.value - previous.value
      : null;
  const extent = Math.max(1, ...points.map((p) => Math.abs(p.value ?? 0)));
  const x = (i: number) => 34 + (i / Math.max(1, total)) * 628;
  const y = (v: number) => 64 - (v / extent) * 46;
  let path = "";
  points.forEach((p, i) => {
    if (p.value === null) return;
    const connected =
      i > 0 && points[i - 1].value !== null && points[i - 1].round === p.round;
    path += `${connected ? "L" : "M"}${x(p.index)},${y(p.value)} `;
  });
  const drops = points
    .filter((p) => p.decision && p.decision.loss >= 0.05)
    .sort((a, b) => b.decision!.loss - a.decision!.loss)
    .slice(0, 3);
  const complete = points.length === total + 1;
  return (
    <details className="replay-value" open>
      <summary>
        <span>你的 Value 曲线</span>
        <strong>
          {viewedPoint?.value == null ? "—" : format(viewedPoint.value)}
        </strong>
        <small>越高越好</small>
      </summary>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((r) => r + 1)}>重试分析</button>
        </p>
      ) : (
        <>
          <div className="replay-value-plot">
            <svg
              viewBox="0 0 680 132"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {[extent, 0, -extent].map((v) => (
                <g key={v}>
                  <line
                    x1="34"
                    x2="662"
                    y1={y(v)}
                    y2={y(v)}
                    className={v === 0 ? "value-zero" : "value-grid"}
                  />
                  <text x="26" y={y(v) + 4} textAnchor="end">
                    {v.toFixed(1)}
                  </text>
                </g>
              ))}
              <path d={path} className="value-line" />
              {points
                .filter(
                  (p) =>
                    p.decision && p.decision.loss >= 0.05 && p.value !== null,
                )
                .map((p) => (
                  <circle
                    key={p.index}
                    cx={x(p.index)}
                    cy={y(p.value!)}
                    r="3"
                    className="value-drop"
                  />
                ))}
              <line
                x1={x(viewedIndex)}
                x2={x(viewedIndex)}
                y1="12"
                y2="113"
                className="value-cursor"
              />
              {viewedPoint?.value != null && (
                <circle
                  cx={x(viewedIndex)}
                  cy={y(viewedPoint.value)}
                  r="4"
                  className="value-current"
                />
              )}
              <text x="34" y="130">
                开市
              </text>
              <text x="662" y="130" textAnchor="end">
                第 {total} 步
              </text>
            </svg>
            <input
              type="range"
              min="0"
              max={total}
              value={index}
              aria-label="沿价值曲线查看局面"
              aria-valuetext={`第 ${index} 步行动${moment === "before" ? "前" : "后"}，Value ${viewedPoint?.value == null ? "待评估" : format(viewedPoint.value)}`}
              onChange={(e) => onSeek(Number(e.target.value))}
            />
          </div>
          <section
            className="replay-value-review"
            aria-label="本手复盘"
            aria-live="polite"
          >
            <div className="review-heading">
              <b>
                {index === 0
                  ? "开市局面"
                  : `第 ${index} 步 · ${point?.actor === 0 ? "你的行动" : point?.actor === 1 ? "米拉的行动" : "新一轮"}`}
              </b>
              {point?.decision ? (
                <span
                  className={point.decision.loss >= 0.005 ? "value-fell" : ""}
                >
                  {point.decision.loss >= 0.005
                    ? `比建议低 ${point.decision.loss.toFixed(2)}`
                    : "符合模型偏好"}
                </span>
              ) : (
                delta !== null && (
                  <span className={delta < -0.005 ? "value-fell" : ""}>
                    变化 {format(delta)}
                  </span>
                )
              )}
            </div>
            {point?.decision ? (
              <div className="review-comparison">
                <ReviewChoice
                  label="你这一手"
                  move={point.decision.chosenMove}
                  value={point.decision.actualValue}
                />
                <ReviewChoice
                  label="模型建议"
                  move={point.decision.recommendedMove}
                  value={point.decision.bestValue}
                  recommended
                />
              </div>
            ) : point?.move ? (
              <ReviewMove move={point.move} />
            ) : (
              <p className="review-empty">
                {point?.value == null
                  ? "等待你的首个决策"
                  : "拖动曲线，或点击下一步查看交易"}
              </p>
            )}
          </section>
          {!complete && (
            <p className="replay-value-progress" role="status">
              模型分析中 {Math.max(0, points.length - 1)} / {total} · 可继续回放
            </p>
          )}
          <div className="replay-value-extras">
            {drops.length > 0 && (
              <details className="replay-value-priorities">
                <summary>优先复盘 · {drops.length} 手</summary>
                <div className="replay-value-drops">
                  {drops.map((p) => (
                    <button
                      key={p.index}
                      onClick={(event) => {
                        onSeek(p.index);
                        const disclosure =
                          event.currentTarget.closest("details");
                        if (disclosure) disclosure.open = false;
                        window.scrollTo({ top: 0, behavior: "auto" });
                      }}
                    >
                      第 {p.index} 步 <b>−{p.decision!.loss.toFixed(2)}</b>
                    </button>
                  ))}
                </div>
              </details>
            )}
            <details className="replay-value-help">
              <summary>怎么看评分</summary>
              <p>
                牌桌默认显示这一手行动前，可切换查看行动后的变化。曲线光标与右上
                Value
                对应当前牌桌时点；对照栏的两个评分对应你这一手和模型建议。固定你的视角，越高越好。轮到你时取模型最佳行动
                Q 值；你行动后显示所选行动 Q
                值；对手行动后重新评估。红点表示你的选择低于模型最佳值至少
                0.05，点击“优先复盘”查看。仅用你当时可见的信息；轮初尚未轮到你时留空，轮末用真实胜负
                ±1（平局 0），各轮断开。模型为高难对手
                v147126，其偏好仅供复盘参考。
              </p>
            </details>
          </div>
        </>
      )}
    </details>
  );
}
