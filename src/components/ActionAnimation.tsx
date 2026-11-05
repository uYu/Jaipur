import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Flight } from "../game/flights.ts";
import { Card } from "./Card.tsx";
import { useReducedMotion } from "../hooks/useReducedMotion.ts";
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
  const reduced = useReducedMotion();
  const layer = useRef<HTMLDivElement>(null),
    animations = useRef<Animation[]>([]),
    frozen = useRef(paused);
  frozen.current = paused;
  useLayoutEffect(() => {
    const hidden = new Map<HTMLElement, string>();
    const find = (name: string) => {
      const visible = (selector: string) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
          (element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          },
        );
      return (
        visible(`[data-motion-anchor="${name}"]`) ??
        visible(`[data-motion-fallback="${name}"]`)
      );
    };
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
        const height = coin
          ? 34
          : source.classList.contains("card")
            ? a.height
            : width * 1.43;
        const measureElement = find("hand-measure");
        const measure = measureElement?.getBoundingClientRect();
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
        const singleRow =
          flight.to === "your-hand" &&
          getComputedStyle(target).flexWrap === "nowrap";
        const overlap =
          singleRow && measureElement
            ? Number.parseFloat(getComputedStyle(measureElement).marginLeft) ||
              0
            : 0;
        const targetStyle = getComputedStyle(target);
        const paddingLeft = Number.parseFloat(targetStyle.paddingLeft) || 0;
        const paddingTop = Number.parseFloat(targetStyle.paddingTop) || 0;
        const targetX =
          flight.to === "your-hand"
            ? Math.min(
                b.right - targetWidth / 2 - paddingLeft,
                b.left +
                  paddingLeft -
                  (singleRow ? target.scrollLeft : 0) +
                  targetWidth / 2 +
                  (singleRow
                    ? (flight.slot ?? 0)
                    : (flight.slot ?? 0) % columns) *
                    (targetWidth + gap + overlap),
              )
            : b.left + b.width / 2 + spread;
        const targetY =
          flight.to === "your-hand"
            ? b.top +
              paddingTop +
              (measure?.height ?? targetWidth * 1.43) / 2 +
              (singleRow ? 0 : Math.floor((flight.slot ?? 0) / columns)) *
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
          if (!reduced || typeof source.animate !== "function")
            source.style.visibility = "hidden";
        }
        if (flight.hideTarget && !hidden.has(target)) {
          hidden.set(target, target.style.visibility);
          target.style.visibility = "hidden";
        }
        const targetHeight = coin
          ? b.height
          : flight.to.startsWith("market-") ||
              flight.to.startsWith("hand-") ||
              flight.to === "sale"
            ? b.height
            : flight.to === "your-hand"
              ? (measure?.height ?? targetWidth * 1.43)
              : targetWidth * 1.43;
        const start = Math.min(0.95, flight.start),
          end = Math.min(0.99, flight.end),
          middle = (start + end) / 2;
        const landing = `translate(${tx - x}px, ${ty - y}px) scale(${targetWidth / width}, ${targetHeight / height})`;
        const frames =
          reduced || flight.from === flight.to
            ? [
                { offset: 0, opacity: 0, transform: landing },
                { offset: start, opacity: 0, transform: landing },
                {
                  offset: Math.min(start + 0.16, end),
                  opacity: flight.to === "sale" ? 0 : 1,
                  transform: landing,
                },
                {
                  offset: 1,
                  opacity: flight.to === "sale" ? 0 : 1,
                  transform: landing,
                },
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
                  easing: "cubic-bezier(0.22, 0.68, 0, 1)",
                },
                {
                  offset: end,
                  opacity: flight.to === "sale" ? 0 : 1,
                  transform: landing,
                },
                {
                  offset: 1,
                  opacity: flight.to === "sale" ? 0 : 1,
                  transform: landing,
                },
              ];
        const back = sprite.querySelector<HTMLElement>(".flight-back");
        if (typeof sprite.animate !== "function") {
          Object.assign(sprite.style, {
            transform: landing,
            opacity: flight.to === "sale" ? "0" : "1",
          });
          if (back) back.style.opacity = flight.toBack ? "1" : "0";
          return;
        }
        if (reduced && flight.hideSource) {
          const departure = source.animate(
            [
              { offset: 0, opacity: 1 },
              { offset: Math.min(0.2, end), opacity: 0 },
              { offset: 1, opacity: 0 },
            ],
            { duration, fill: "both" },
          );
          departure.currentTime = time;
          if (frozen.current) departure.pause();
          animations.current.push(departure);
        }
        const motion = sprite.animate(frames, {
          duration,
          fill: "both",
          easing: "linear",
        });
        motion.currentTime = time;
        if (frozen.current) motion.pause();
        animations.current.push(motion);
        if (back) {
          if (reduced) {
            back.style.opacity = flight.toBack ? "1" : "0";
            return;
          }
          back.style.opacity = "";
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
  }, [flights, duration, reduced]);
  useLayoutEffect(() => {
    animations.current.forEach((a) => (paused ? a.pause() : a.play()));
  }, [paused]);
  return createPortal(
    <div ref={layer} className="flight-layer" aria-hidden="true">
      {flights.map((flight, i) => (
        <div
          key={i}
          className={`flight-sprite ${flight.good ?? flight.coinGood ?? ""} ${flight.coin !== undefined ? "flight-coin" : "flight-card"} ${flight.from.startsWith("market-") ? "flight-market" : ""}`}
        >
          {flight.good ? (
            <>
              <Card
                good={flight.good}
                disabled
                small={flight.from.startsWith("hand-")}
              />
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
