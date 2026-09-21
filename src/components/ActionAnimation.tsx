import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Flight } from "../game/flights.ts";
import { GoodsArt } from "./Art.tsx";
import { LABEL } from "../game/data.ts";
export function ActionAnimation({
  flights,
  duration,
  paused,
  elapsed,
}: {
  flights: Flight[];
  duration: number;
  paused: boolean;
  elapsed: number;
}) {
  const layer = useRef<HTMLDivElement>(null),
    animations = useRef<Animation[]>([]),
    frozen = useRef(paused);
  frozen.current = paused;
  useLayoutEffect(() => {
    const hidden = new Map<HTMLElement, string>();
    const find = (name: string) =>
      document.querySelector<HTMLElement>(`[data-motion-anchor="${name}"]`);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let time = elapsed;
    const build = () => {
      if (animations.current.length)
        time = Number(animations.current[0].currentTime ?? time);
      animations.current.forEach((a) => a.cancel());
      animations.current = [];
      flights.forEach((flight, i) => {
        const source = find(flight.from),
          target = find(flight.to),
          sprite = layer.current?.children[i] as HTMLElement;
        if (!source || !target || !sprite) return;
        const a = source.getBoundingClientRect(),
          b = target.getBoundingClientRect();
        const coin = flight.coin !== undefined;
        const width = coin
          ? 34
          : flight.from.startsWith("market-") || flight.from.startsWith("hand-")
            ? a.width
            : 64;
        const height = coin ? 34 : width * 1.43;
        const measure = find("hand-measure")?.getBoundingClientRect();
        const targetWidth = coin
          ? b.width
          : flight.to.startsWith("market-") || flight.to.startsWith("hand-")
            ? b.width
            : flight.to === "sale"
              ? b.width
              : flight.to === "your-hand"
                ? (measure?.width ?? Math.min(78, b.width / 5))
                : 46;
        const spread = coin
          ? 0
          : (flight.slot ?? 0) * (flight.to === "sale" ? 3 : 7);
        const gap = Number.parseFloat(getComputedStyle(target).columnGap) || 7;
        const columns = Math.max(
          1,
          Math.floor((b.width + gap) / (targetWidth + gap)),
        );
        const targetX =
          flight.to === "your-hand"
            ? b.left +
              targetWidth / 2 +
              ((flight.slot ?? 0) % columns) * (targetWidth + gap)
            : b.left + b.width / 2 + spread;
        const targetY =
          flight.to === "your-hand"
            ? b.top +
              (measure?.height ?? targetWidth * 1.43) / 2 +
              Math.floor((flight.slot ?? 0) / columns) *
                ((measure?.height ?? targetWidth * 1.43) + gap)
            : b.top + b.height / 2;
        const x = a.left + window.scrollX + a.width / 2 - width / 2,
          y = a.top + window.scrollY + a.height / 2 - height / 2;
        const tx = targetX + window.scrollX - width / 2,
          ty = targetY + window.scrollY - height / 2;
        Object.assign(sprite.style, {
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
        });
        if (flight.hideSource && !hidden.has(source)) {
          hidden.set(source, source.style.visibility);
          source.style.visibility = "hidden";
        }
        if (flight.hideTarget && !hidden.has(target)) {
          hidden.set(target, target.style.visibility);
          target.style.visibility = "hidden";
        }
        const start = Math.min(0.95, flight.start),
          end = Math.min(0.99, flight.end),
          middle = (start + end) / 2;
        const landing = `translate(${tx - x}px, ${ty - y}px) scale(${targetWidth / width})`;
        const frames =
          reduced || flight.from === flight.to
            ? [
                { opacity: 1, transform: landing },
                { opacity: 1, transform: landing },
              ]
            : [
                {
                  offset: 0,
                  opacity: start ? 0 : 1,
                  transform: "translate(0,0) scale(1)",
                },
                {
                  offset: start,
                  opacity: 1,
                  transform: "translate(0,0) scale(1)",
                },
                {
                  offset: middle,
                  opacity: 1,
                  transform: `translate(${(tx - x) * 0.5}px, ${(ty - y) * 0.5 - 28}px) scale(${(1 + targetWidth / width) * 0.54}) rotate(${flight.to === "sale" ? 8 : -3}deg)`,
                },
                { offset: end, opacity: 1, transform: landing },
                { offset: 1, opacity: 1, transform: landing },
              ];
        const motion = sprite.animate(frames, {
          duration,
          fill: "both",
          easing: "linear",
        });
        motion.currentTime = time;
        if (frozen.current) motion.pause();
        animations.current.push(motion);
        const back = sprite.querySelector<HTMLElement>(".flight-back");
        if (back) {
          const flip = back.animate(
            [
              { offset: 0, opacity: flight.fromBack ? 1 : 0 },
              { offset: middle - 0.01, opacity: flight.fromBack ? 1 : 0 },
              { offset: middle + 0.01, opacity: flight.toBack ? 1 : 0 },
              { offset: 1, opacity: flight.toBack ? 1 : 0 },
            ],
            { duration, fill: "both" },
          );
          flip.currentTime = time;
          if (frozen.current) flip.pause();
          animations.current.push(flip);
        }
      });
    };
    build();
    window.addEventListener("resize", build);
    return () => {
      window.removeEventListener("resize", build);
      animations.current.forEach((a) => a.cancel());
      animations.current = [];
      hidden.forEach((visibility, element) => {
        element.style.visibility = visibility;
      });
    };
  }, [flights, duration]);
  useLayoutEffect(() => {
    animations.current.forEach((a) => (paused ? a.pause() : a.play()));
  }, [paused]);
  return createPortal(
    <div ref={layer} className="flight-layer" aria-hidden="true">
      {flights.map((flight, i) => (
        <div
          key={i}
          className={`flight-sprite ${flight.good ?? flight.coinGood ?? ""} ${flight.coin !== undefined ? "flight-coin" : ""}`}
        >
          {flight.good ? (
            <>
              <GoodsArt good={flight.good} />
              <span>{LABEL[flight.good]}</span>
              <div className="flight-back">✳</div>
            </>
          ) : (
            flight.coin
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}
