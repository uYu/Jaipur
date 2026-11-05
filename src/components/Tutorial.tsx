import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Eye, MousePointer2, X } from "lucide-react";
import { TUTORIAL_STEPS } from "../game/tutorial.ts";

type Rect = { left: number; top: number; width: number; height: number };

// Only the guide floats above the real game. Cards, scores and controls remain
// the exact same React tree used by a normal match.
export function Tutorial({
  step,
  paused,
  feedback,
  onHistory,
  onNext,
  onExit,
  onComplete,
  onRestart,
}: {
  step: number;
  paused: boolean;
  feedback: string;
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
  const hidden = paused || guide.kind === "opponent";
  useLayoutEffect(() => {
    if (hidden) return;
    setBlockedClick(false);
    const targets = [
      ...document.querySelectorAll<HTMLElement>(guide.target),
    ].filter(
      (target) =>
        target.getBoundingClientRect().width > 0 &&
        target.getBoundingClientRect().height > 0,
    );
    if (!targets.length) return;
    targets.forEach((target) => target.classList.add("tutorial-focus-target"));
    targets[0].scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "instant",
    });
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
      const highlighted =
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
          : boxes;
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
      targets.forEach((target) =>
        target.classList.remove("tutorial-focus-target"),
      );
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [step, hidden, guide.target]);
  if (hidden) return null;
  const reading = !guide.kind || guide.kind === "opponent-result";
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
      {rects.map((rect, i) => (
        <div key={i} className="tutorial-spotlight-frame" style={rect} />
      ))}
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
                ? "先看最近行动"
                : guide.kind
                  ? "跟着亮框动手试试"
                  : "收市与胜负"}
          </span>
          <button
            aria-label="退出新手教程"
            title="退出教程，返回主页"
            onClick={onExit}
          >
            <X size={17} />
          </button>
        </div>
        <h2 ref={title} tabIndex={-1}>
          {guide.title}
        </h2>
        <p>{guide.text}</p>
        {(feedback || blockedClick) && (
          <p className="tutorial-feedback" role="status">
            {blockedClick
              ? "请点亮框内的牌或按钮，其他位置这一步暂不操作。"
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
          ) : reading ? (
            <button className="primary" onClick={onNext}>
              {guide.kind === "opponent-result" ? "看懂了，继续" : "下一步"}
              <ArrowRight size={16} />
            </button>
          ) : (
            <span className="tutorial-action-cue">
              请操作亮框中的{guide.kind === "confirm" ? "确认按钮" : "控件"}
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
