import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Eye,
  Minimize2,
  MousePointer2,
  PanelTopOpen,
  X,
} from "lucide-react";
import { TUTORIAL_STEPS } from "../game/tutorial.ts";
import { sum } from "../game/data.ts";
import type { Presentation } from "../game/presentation.ts";

type Rect = { left: number; top: number; width: number; height: number };

function mergeSpotlights(boxes: Rect[]) {
  const merged: Rect[] = [];
  for (const box of boxes) {
    let current = { ...box };
    for (let i = 0; i < merged.length;) {
      const other = merged[i];
      if (
        current.left <= other.left + other.width &&
        current.left + current.width >= other.left &&
        current.top <= other.top + other.height &&
        current.top + current.height >= other.top
      ) {
        const right = Math.max(
          current.left + current.width,
          other.left + other.width,
        );
        const bottom = Math.max(
          current.top + current.height,
          other.top + other.height,
        );
        current.left = Math.min(current.left, other.left);
        current.top = Math.min(current.top, other.top);
        current.width = right - current.left;
        current.height = bottom - current.top;
        merged.splice(i, 1);
        i = 0;
      } else i++;
    }
    merged.push(current);
  }
  return merged;
}

// Only the guide floats above the real game. Cards, scores and controls remain
// the exact same React tree used by a normal match.
export function Tutorial({
  step,
  paused,
  feedback,
  canContinue,
  spicePrices,
  saleReceipt,
  onHistory,
  onNext,
  onExit,
  onComplete,
  onRestart,
}: {
  step: number;
  paused: boolean;
  feedback: string;
  canContinue: boolean;
  spicePrices: number[];
  saleReceipt: Presentation | null;
  onHistory: () => void;
  onNext: () => void;
  onExit: () => void;
  onComplete: () => void;
  onRestart: () => void;
}) {
  const guide = TUTORIAL_STEPS[step];
  const [rects, setRects] = useState<Rect[]>([]);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const panel = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [blockedClick, setBlockedClick] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const restore = useRef<HTMLButtonElement>(null);
  const hidden = paused || guide.kind === "opponent";
  const afterOpponent = TUTORIAL_STEPS[step - 1]?.kind === "opponent-result";
  useLayoutEffect(() => {
    if (hidden) return;
    if (minimized) {
      restore.current?.focus({ preventScroll: true });
      return;
    }
    setBlockedClick(false);
    const targets = [
      ...document.querySelectorAll<HTMLElement>(guide.target),
    ].filter(
      (target) =>
        target.getBoundingClientRect().width > 0 &&
        target.getBoundingClientRect().height > 0,
    );
    if (!targets.length) return;
    // Guide changes must never scroll or restyle the table beneath the overlay.
    title.current?.focus({ preventScroll: true });
    let frame = 0;
    function measure() {
      const bounds = targets.map((target) => target.getBoundingClientRect());
      const boxes = bounds.map((b) => ({
        left: b.left - 6,
        top: b.top - 6,
        width: b.width + 12,
        height: b.height + 12,
      }));
      const clear =
        guide.kind === "select" || guide.kind === "confirm"
          ? document
              .querySelector<HTMLElement>(".action-panel .clear-button")
              ?.getBoundingClientRect()
          : undefined;
      const clearAlreadyHighlighted =
        clear &&
        boxes.some(
          (b) =>
            b.left <= clear.left &&
            b.top <= clear.top &&
            b.left + b.width >= clear.right &&
            b.top + b.height >= clear.bottom,
        );
      const highlighted = mergeSpotlights(
        clear && !clearAlreadyHighlighted
          ? [
              ...boxes,
              {
                left: clear.left - 4,
                top: clear.top - 4,
                width: clear.width + 8,
                height: clear.height + 8,
              },
            ]
          : boxes,
      );
      setRects(highlighted);
      // The reset button is interactive too; never place the coach over it.
      const left = Math.min(...highlighted.map((b) => b.left));
      const right = Math.max(...highlighted.map((b) => b.left + b.width));
      const top = Math.min(...highlighted.map((b) => b.top));
      const bottom = Math.max(...highlighted.map((b) => b.top + b.height));
      const width = panel.current?.offsetWidth ?? 360;
      const height = panel.current?.offsetHeight ?? 220;
      const margin = 16,
        gap = 20;
      const clampX = (x: number) =>
        Math.max(margin, Math.min(window.innerWidth - width - margin, x));
      const clampY = (y: number) =>
        Math.max(margin, Math.min(window.innerHeight - height - margin, y));
      if (
        window.innerWidth > 760 &&
        window.innerWidth - right > width + gap + margin
      ) {
        setPosition({ left: right + gap, top: clampY(top) });
      } else if (window.innerWidth > 760 && left > width + gap + margin) {
        setPosition({ left: left - width - gap, top: clampY(top) });
      } else if (top > height + gap + margin) {
        setPosition({ left: clampX(right - width), top: top - height - gap });
      } else {
        setPosition({
          left: clampX(right - width),
          top:
            bottom + gap + height < window.innerHeight - margin
              ? bottom + gap
              : window.innerHeight - height - margin,
        });
      }
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    measure();
    const observer = new ResizeObserver(schedule);
    targets.forEach((target) => observer.observe(target));
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step, hidden, minimized, guide.target]);
  if (hidden) return null;
  if (minimized)
    return (
      <div className="tutorial-overlay">
        <button
          ref={restore}
          className="tutorial-restore"
          aria-label="展开教程"
          aria-expanded={false}
          title={`继续：${guide.title}`}
          onClick={() => setMinimized(false)}
        >
          <PanelTopOpen size={16} />
          展开教程
        </button>
      </div>
    );
  const reading = !guide.kind || guide.kind === "opponent-result";
  const bonusResult = guide.id === "bulk-bonus";
  const showSaleExample =
    bonusResult || guide.id === "sell-select" || guide.id === "sell-confirm";
  const coins = bonusResult ? (saleReceipt?.coins ?? []) : spicePrices;
  const bonus =
    bonusResult && typeof saleReceipt?.bonus === "number"
      ? saleReceipt.bonus
      : null;
  return (
    <div className="tutorial-overlay">
      <svg
        className="tutorial-shade"
        aria-hidden="true"
        width="100%"
        height="100%"
      >
        <path
          className="tutorial-input-shield"
          fill="#17251f"
          fillRule="evenodd"
          opacity="0.48"
          d={`M0 0H100000V100000H0Z ${rects.map((r) => `M${r.left} ${r.top}h${r.width}v${r.height}h${-r.width}Z`).join(" ")}`}
          onClick={() => setBlockedClick(true)}
        />
      </svg>
      <div
        className="tutorial-popover"
        ref={panel}
        style={position}
        role="region"
        aria-label="新手教程提示"
      >
        <div className="tutorial-popover-top">
          <span>
            {guide.kind === "opponent-result" ? (
              <Eye size={15} />
            ) : (
              <MousePointer2 size={15} />
            )}
            {guide.kind === "finish"
              ? "练习完成"
              : guide.kind === "opponent-result"
                ? "米拉行动结束，先看记录"
                : bonusResult
                  ? "成组出售，多赚奖励"
                  : afterOpponent
                    ? "米拉行动结束，轮到你了"
                    : guide.kind
                      ? "跟着亮起的区域动手试试"
                      : "收市与胜负"}
          </span>
          <div className="tutorial-window-controls">
            <button
              aria-label="最小化教程"
              title="收起提示，查看完整牌桌"
              aria-expanded={true}
              onClick={() => setMinimized(true)}
            >
              <Minimize2 size={17} />
            </button>
            <button
              aria-label="退出新手教程"
              title="退出教程，返回主页"
              onClick={onExit}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <h2 ref={title} tabIndex={-1}>
          {guide.title}
        </h2>
        <p>{guide.text}</p>
        {showSaleExample && (
          <div
            className="tutorial-sale-example"
            aria-label="同样三张香料的收入对比"
          >
            <div>
              <span>分三次，每次卖 1 张</span>
              <strong>
                {sum(coins)} <small>卢比</small>
              </strong>
            </div>
            <div className="tutorial-bulk-income">
              <span>{bonusResult ? "你刚才一次卖了 3 张" : "一次卖 3 张"}</span>
              <strong>
                {bonusResult && bonus !== null
                  ? sum(coins) + bonus
                  : sum(coins)}
                <small>{bonusResult ? "卢比" : " + 1–3 奖励"}</small>
              </strong>
            </div>
            <p>
              {bonusResult && bonus !== null
                ? `货物 ${coins.join(" + ")} = ${sum(coins)}，额外奖励 +${bonus}！`
                : "同样的货物分，成组卖才多拿一枚奖励。"}
            </p>
            {bonusResult && (
              <>
                <dl className="tutorial-bonus-tiers">
                  <div>
                    <dt>3 张同售</dt>
                    <dd>+1–3</dd>
                  </div>
                  <div>
                    <dt>4 张同售</dt>
                    <dd>+4–6</dd>
                  </div>
                  <div>
                    <dt>5 张及以上</dt>
                    <dd>+8–10</dd>
                  </div>
                </dl>
                <small>
                  每笔取对应档位的一枚奖励，领完即止。以上对比假设对手没有抢走筹码；等着凑牌，也可能错过高价。
                </small>
              </>
            )}
          </div>
        )}
        {guide.tradeoff && (
          <aside className="tutorial-tradeoff" aria-label="教学操作的实战取舍">
            <strong>本步练规则，实战要权衡</strong>
            <p>{guide.tradeoff}</p>
          </aside>
        )}
        {(feedback || blockedClick) && (
          <p className="tutorial-feedback" role="status">
            {blockedClick
              ? "请点击亮起的牌或按钮，其他位置这一步暂不操作。"
              : feedback}
          </p>
        )}
        {guide.kind === "opponent-result" && (
          <button
            className="text-button tutorial-history-link"
            onClick={onHistory}
          >
            打开完整行动记录
          </button>
        )}
        <div className="tutorial-popover-bottom">
          <small>
            练习对局
            <br />
            不影响比赛存档
          </small>
          {guide.kind === "finish" ? (
            <button className="primary" onClick={onComplete}>
              正式开市
              <ArrowRight size={16} />
            </button>
          ) : reading || guide.kind === "select" || guide.kind === "mode" ? (
            <button
              className="primary"
              onClick={onNext}
              disabled={!canContinue}
            >
              {guide.kind === "opponent-result" ? "看懂了，继续" : "下一步"}
              <ArrowRight size={16} />
            </button>
          ) : (
            <span className="tutorial-action-cue">
              请操作亮起的{guide.kind === "confirm" ? "确认按钮" : "控件"}
            </span>
          )}
        </div>
        {guide.kind === "finish" && (
          <button className="text-button" onClick={onRestart}>
            再练一次
          </button>
        )}
      </div>
    </div>
  );
}
