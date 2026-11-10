import { useSkin } from "./Skin.tsx";
import { useEffect, useState } from "react";
import type { Card, Save } from "../game/types.ts";
import { GoodsArt } from "./Art.tsx";
import { DEFAULT_DOUZERO_VERSION } from "../game/douzero-browser.ts";
import { replayBoardIndex } from "../game/replay-position.ts";
import type { ReplayMoment } from "../game/replay-position.ts";
import type {
  ReplayDecision,
  ReplayMove,
  ReplayValuePoint,
} from "../game/replay-value.ts";
import "../replay-value.css";
import "../replay-layout.css";
import { ArrowRight, Coins, Hand, ArrowDownToLine } from "lucide-react";

const cache = new WeakMap<Save, ReplayValuePoint[]>();
const priorityDrop = 2.5;
// A round return is P(win) − P(loss), so this credits a draw as half a win.
const winPercent = (value: number) =>
  50 * (1 + Math.max(-1, Math.min(1, value)));
const roundPercent = (value: number) => Number(value.toFixed(1));
const formatPercent = (value: number) => `${roundPercent(value)}%`;
const formatChange = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)} 个百分点`;
const decisionDrop = (decision: ReplayDecision) =>
  roundPercent(winPercent(decision.bestValue) - winPercent(decision.actualValue));

function ReviewGoods({ cards }: { cards: Card[] }) {
  const { labels } = useSkin();
  return (
    <span className="review-goods">
      {[...new Set(cards)].map((good) => {
        const count = cards.filter((g) => g === good).length;
        return (
          <span
            key={good}
            className={`review-good ${good}`}
            role="img"
            aria-label={`${labels[good]} ${count} 张`}
            title={`${labels[good]} ×${count}`}
          >
            <GoodsArt good={good} cardFace />
            <span className="review-good-name">{labels[good]}</span>
            <b>×{count}</b>
          </span>
        );
      })}
    </span>
  );
}
function ReviewMove({ move }: { move: ReplayMove }) {
  const { t } = useSkin();
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
          ? t("交换：付出换入")
          : move.type === "sell"
            ? t("卖出")
            : t("拿取")
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
  const estimate = formatPercent(winPercent(value));
  return (
    <div className={`review-choice ${recommended ? "is-recommended" : ""}`}>
      <b className="review-choice-label">{label}</b>
      <ReviewMove move={move} />
      <strong
        className="review-choice-value"
        aria-label={`本轮预估胜率 ${estimate}`}
      >
        {estimate}
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
  const { t } = useSkin();
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
  const estimate =
    viewedPoint?.value == null ? null : winPercent(viewedPoint.value);
  const previous = points[index - 1];
  const delta =
    point?.value != null &&
    previous?.value != null &&
    point.round === previous.round
      ? roundPercent(winPercent(point.value) - winPercent(previous.value))
      : null;
  const loss = point?.decision ? decisionDrop(point.decision) : null;
  const x = (i: number) => 34 + (i / Math.max(1, total)) * 628;
  const y = (percent: number) => 110 - percent * 0.92;
  let path = "";
  points.forEach((p, i) => {
    if (p.value === null) return;
    const connected =
      i > 0 && points[i - 1].value !== null && points[i - 1].round === p.round;
    path += `${connected ? "L" : "M"}${x(p.index)},${y(winPercent(p.value))} `;
  });
  const marked = points.flatMap((p) => {
    const loss = p.decision ? decisionDrop(p.decision) : 0;
    return loss >= priorityDrop ? [{ index: p.index, value: p.value, loss }] : [];
  });
  const drops = [...marked].sort((a, b) => b.loss - a.loss).slice(0, 3);
  const complete = points.length === total + 1;
  return (
    <details className="replay-value" open>
      <summary>
        <span>本轮预估胜率</span>
        <strong>{estimate === null ? "—" : formatPercent(estimate)}</strong>
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
              {[100, 50, 0].map((v) => (
                <g key={v}>
                  <line
                    x1="34"
                    x2="662"
                    y1={y(v)}
                    y2={y(v)}
                    className={v === 50 ? "value-zero" : "value-grid"}
                  />
                  <text x="26" y={y(v) + 4} textAnchor="end">
                    {formatPercent(v)}
                  </text>
                </g>
              ))}
              <path d={path} className="value-line" />
              {marked.map((p) =>
                p.value === null ? null : (
                  <circle
                    key={p.index}
                    cx={x(p.index)}
                    cy={y(winPercent(p.value))}
                    r="3"
                    className="value-drop"
                  />
                ),
              )}
              <line
                x1={x(viewedIndex)}
                x2={x(viewedIndex)}
                y1="12"
                y2="113"
                className="value-cursor"
              />
              {estimate !== null && (
                <circle
                  cx={x(viewedIndex)}
                  cy={y(estimate)}
                  r="4"
                  className="value-current"
                />
              )}
              <text x="34" y="130">
                {t("开市")}
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
              aria-label="沿胜率曲线查看局面"
              aria-valuetext={`第 ${index} 步行动${moment === "before" ? "前" : "后"}，本轮预估胜率 ${estimate === null ? "待评估" : formatPercent(estimate)}`}
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
                  ? t("开市局面")
                  : `第 ${index} 步 · ${point?.actor === 0 ? "你的行动" : point?.actor === 1 ? t("米拉的行动") : "新一轮"}`}
              </b>
              {loss !== null ? (
                <span className={loss > 0 ? "value-fell" : ""}>
                  {loss > 0
                    ? `比建议低 ${loss} 个百分点`
                    : "符合模型偏好"}
                </span>
              ) : (
                delta !== null && (
                  <span className={delta < 0 ? "value-fell" : ""}>
                    变化 {formatChange(delta)}
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
                    <button key={p.index} onClick={() => onSeek(p.index)}>
                      第 {p.index} 步 <b>−{p.loss} 点</b>
                    </button>
                  ))}
                </div>
              </details>
            )}
            <details className="replay-value-help">
              <summary>怎么看胜率</summary>
              <p>
                百分比是模型对你赢下本轮的估计，平局按半胜计入。模型只使用你当时可见的信息。轮到你时按模型建议估计，行动后按实际选择估计，对手行动后重新评估。轮末按实际结果显示，赢为
                100%，平局为 50%，输为 0%。
              </p>
              <p>
                红点表示你的选择比模型建议低至少 {priorityDrop} 个百分点。估计来自高难模型
                v{DEFAULT_DOUZERO_VERSION}，供复盘参考。
              </p>
            </details>
          </div>
        </>
      )}
    </details>
  );
}
