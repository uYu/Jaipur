import { createContext, useContext, useLayoutEffect, useRef } from "react";

export const NumberMotion = createContext({ paused: false, reduced: false });

/** Animate the actual old and new values; prices never count through invented
 * intermediate denominations. The accessible value updates immediately. */
export function TableNumber({ value }: { value: number | string }) {
  const previous = useRef(value);
  const oldFace = useRef<HTMLSpanElement>(null);
  const current = useRef<HTMLSpanElement>(null);
  const motions = useRef<Animation[]>([]);
  const { paused, reduced } = useContext(NumberMotion);
  useLayoutEffect(() => {
    if (reduced) {
      motions.current.forEach((a) => a.cancel());
      previous.current = value;
      return;
    }
    if (previous.current === value) return;
    const old = oldFace.current!,
      next = current.current!;
    const from = previous.current;
    previous.current = value;
    motions.current.forEach((a) => a.cancel());
    if (typeof next.animate !== "function") return;
    old.textContent = String(from);
    const direction =
      typeof from === "number" && typeof value === "number" && value < from
        ? -1
        : 1;
    motions.current = [
      old.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: `translateY(${-direction * 45}%)` },
        ],
        { duration: 160, easing: "ease-out" },
      ),
      next.animate(
        [
          { opacity: 0, transform: `translateY(${direction * 45}%)` },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 160, easing: "ease-out" },
      ),
    ];
    if (paused) motions.current.forEach((a) => a.pause());
  }, [value, reduced]);
  useLayoutEffect(() => {
    motions.current.forEach((a) => {
      if (Number(a.currentTime ?? 0) < 160) paused ? a.pause() : a.play();
    });
  }, [paused]);
  useLayoutEffect(() => () => motions.current.forEach((a) => a.cancel()), []);
  return (
    <span className="table-number" data-value={value}>
      <span className="table-number-old" ref={oldFace} aria-hidden="true" />
      <span className="table-number-current" ref={current}>
        {value}
      </span>
    </span>
  );
}
