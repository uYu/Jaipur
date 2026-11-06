import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Flight } from "../game/flights.ts";
import { Card } from "./Card.tsx";
import { GoodsArt, JaipurMark } from "./Art.tsx";
import { useReducedMotion } from "../hooks/useReducedMotion.ts";
export function ActionAnimation({
  flights,
  duration,
  paused,
  elapsed,
  settling = false,
  saleTravel = false,
  tableTravel = false,
}: {
  flights: Flight[];
  duration: number;
  paused: boolean;
  elapsed: number;
  settling?: boolean;
  saleTravel?: boolean;
  tableTravel?: boolean;
}) {
  const reduced = useReducedMotion();
  const tabletop = tableTravel || saleTravel;
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
      const usedOpponentCards = new Set<HTMLElement>();
      flights.forEach((flight, i) => {
        const sourceGroup = find(flight.from);
        // Outgoing opponent cards become public through the action. Choose
        // generic back positions without reading the concealed hand order.
        const fanCards =
          tabletop && flight.from === "opponent-hand"
            ? sourceGroup?.querySelectorAll<HTMLElement>(".opponent-hand-card")
            : undefined;
        const fanSource = fanCards?.length
          ? (Array.from(fanCards).find(
              (card) =>
                !usedOpponentCards.has(card) &&
                !card.classList.contains("card-back") &&
                !!flight.good &&
                card.classList.contains(flight.good),
            ) ??
            Array.from(fanCards).find((card) => !usedOpponentCards.has(card)))
          : undefined;
        if (fanSource) usedOpponentCards.add(fanSource);
        const source = fanSource
            ? fanSource
            : tabletop && flight.from.endsWith("-herd")
              ? (sourceGroup?.querySelector<HTMLElement>(
                  ".camel-pile-card:last-child",
                ) ?? sourceGroup)
              : sourceGroup,
          target = find(flight.to),
          sprite = layer.current?.children[i] as HTMLElement;
        if (!source || !target || !sprite) return;
        const fromBack = fanSource
          ? fanSource.classList.contains("card-back")
          : tabletop && flight.from.endsWith("-herd")
            ? false
            : flight.fromBack;
        const toBack =
          tabletop && flight.to.endsWith("-herd") ? false : flight.toBack;
        const a = source.getBoundingClientRect(),
          b = target.getBoundingClientRect();
        const coin = flight.coin !== undefined;
        const width = coin
          ? 34
          : tabletop ||
              flight.from.startsWith("market-") ||
              flight.from.startsWith("hand-")
            ? a.width
            : 64;
        const height = coin
          ? 34
          : tabletop || source.classList.contains("card")
            ? a.height
            : width * 1.43;
        const saleStackStep =
          saleTravel && flight.to === "sale"
            ? Math.min(1.5, b.width * 0.03)
            : 0;
        const saleStackSpan =
          saleStackStep *
          Math.max(0, flights.filter((item) => item.to === "sale").length - 1);
        const measureElement = find("hand-measure");
        const measure = measureElement?.getBoundingClientRect();
        const targetFanCards =
          tabletop && flight.to === "opponent-hand"
            ? target.querySelectorAll<HTMLElement>(".opponent-hand-card")
            : undefined;
        const targetFanCard = targetFanCards?.[0];
        const targetHerdCard =
          tabletop && flight.to.endsWith("-herd")
            ? target.querySelector<HTMLElement>(".camel-pile-card:last-child")
            : null;
        const objectTarget = targetFanCard ?? targetHerdCard;
        const targetWidth = coin
          ? b.width
          : objectTarget
            ? objectTarget.offsetWidth
            : flight.to.startsWith("market-") || flight.to.startsWith("hand-")
              ? b.width
              : flight.to === "sale"
                ? b.width - saleStackSpan
                : flight.to === "your-hand"
                  ? (measure?.width ?? Math.min(78, b.width / 5))
                  : 46;
        const spread = coin
          ? 0
          : saleTravel && flight.to === "sale"
            ? (flight.slot ?? 0) * saleStackStep - saleStackSpan / 2
            : tabletop && flight.to.endsWith("-herd")
              ? ((flight.slot ?? 0) -
                  (flights.filter((item) => item.to === flight.to).length - 1) /
                    2) *
                Math.min(1.2, b.width * 0.025)
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
        const lastFanCard =
          targetFanCards?.[targetFanCards.length - 1]?.getBoundingClientRect();
        const fanLanding = lastFanCard
          ? Math.min(
              b.right - targetWidth / 2,
              lastFanCard.right -
                targetWidth / 2 +
                ((flight.slot ?? 0) + 1) * targetWidth * 0.22,
            )
          : b.left + b.width / 2;
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
            : targetFanCard
              ? fanLanding
              : b.left + b.width / 2 + spread;
        const targetY =
          flight.to === "your-hand"
            ? b.top +
              paddingTop +
              (measure?.height ?? targetWidth * 1.43) / 2 +
              (singleRow ? 0 : Math.floor((flight.slot ?? 0) / columns)) *
                ((measure?.height ?? targetWidth * 1.43) + gap)
            : b.top +
              b.height / 2 +
              (saleTravel || targetHerdCard ? spread : 0);
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
        if (!tabletop && flight.hideSource && !hidden.has(source)) {
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
          : objectTarget
            ? objectTarget.offsetHeight
            : flight.to.startsWith("market-") ||
                flight.to.startsWith("hand-") ||
                flight.to === "sale"
              ? b.height - saleStackSpan
              : flight.to === "your-hand"
                ? (measure?.height ?? targetWidth * 1.43)
                : targetWidth * 1.43;
        const start = Math.min(0.95, flight.start),
          end = Math.min(0.99, flight.end),
          middle =
            tabletop && flight.from === "deck"
              ? start + (end - start) * 0.75
              : tabletop && fromBack
                ? start + (end - start) * 0.2
                : tabletop && toBack
                  ? start + (end - start) * 0.8
                  : (start + end) / 2;
        const landing = `translate(${tx - x}px, ${ty - y}px) scale(${targetWidth / width}, ${targetHeight / height})`;
        // The real hand is compacted once on settlement. Let incoming sprites
        // fade at the edge so they cannot cover retained cards in old slots.
        const vanishAtEnd =
          (flight.to === "sale" && !saleTravel) ||
          (settling && flight.to === "your-hand");
        const fadeAtLanding = tabletop && vanishAtEnd;
        const arrivalOpacity = fadeAtLanding ? 1 : vanishAtEnd ? 0 : 1;
        const fadeEnd = Math.min(1, end + 110 / duration);
        const frames =
          reduced || flight.from === flight.to
            ? [
                { offset: 0, opacity: 0, transform: landing },
                { offset: start, opacity: 0, transform: landing },
                {
                  offset: Math.min(start + 0.16, end),
                  opacity: arrivalOpacity,
                  transform: landing,
                },
                ...(fadeAtLanding
                  ? [{ offset: end, opacity: 1, transform: landing }]
                  : []),
                ...(fadeAtLanding
                  ? [{ offset: fadeEnd, opacity: 0, transform: landing }]
                  : []),
                {
                  offset: 1,
                  opacity: vanishAtEnd ? 0 : 1,
                  transform: landing,
                },
              ]
            : [
                {
                  offset: 0,
                  opacity: start ? 0 : 1,
                  transform: "translate(0,0) scale(1)",
                },
                ...(tabletop
                  ? [
                      {
                        offset: Math.max(0, start - 0.001),
                        opacity: 0,
                        transform: "translate(0,0) scale(1)",
                      },
                    ]
                  : []),
                {
                  offset: start,
                  opacity: 1,
                  transform: "translate(0,0) scale(1)",
                  easing: "cubic-bezier(0.22, 0.68, 0, 1)",
                },
                {
                  offset: end,
                  opacity: arrivalOpacity,
                  transform: landing,
                },
                ...(fadeAtLanding
                  ? [{ offset: fadeEnd, opacity: 0, transform: landing }]
                  : []),
                {
                  offset: 1,
                  opacity: vanishAtEnd ? 0 : 1,
                  transform: landing,
                },
              ];
        const back = sprite.querySelector<HTMLElement>(".flight-back");
        if (typeof sprite.animate !== "function") {
          Object.assign(sprite.style, {
            transform: landing,
            opacity: vanishAtEnd ? "0" : "1",
          });
          if (back) back.style.opacity = toBack ? "1" : "0";
          return;
        }
        const hideDeparture = flight.hideSource || !!fanCards?.length;
        if (
          (tabletop && hideDeparture) ||
          (!tabletop && reduced && flight.hideSource)
        ) {
          // Keep real cards readable during the hold, then remove each one
          // exactly as its travelling copy leaves. Cancellation restores them.
          const leaveAt = tabletop ? start : Math.min(0.2, end);
          const departure = source.animate(
            [
              { offset: 0, opacity: 1 },
              ...(tabletop
                ? [{ offset: Math.max(0, leaveAt - 0.001), opacity: 1 }]
                : []),
              { offset: leaveAt, opacity: 0 },
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
            back.style.opacity = toBack ? "1" : "0";
            return;
          }
          back.style.opacity = "";
          const flip = back.animate(
            [
              { offset: 0, opacity: fromBack ? 1 : 0 },
              { offset: middle - 0.01, opacity: fromBack ? 1 : 0 },
              { offset: middle + 0.01, opacity: toBack ? 1 : 0 },
              { offset: 1, opacity: toBack ? 1 : 0 },
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
  }, [flights, duration, reduced, settling, saleTravel, tabletop]);
  useLayoutEffect(() => {
    animations.current.forEach((a) => (paused ? a.pause() : a.play()));
  }, [paused]);
  return createPortal(
    <div
      ref={layer}
      className={`flight-layer${tabletop ? " table-travel" : ""}${saleTravel ? " sale-travel" : ""}`}
      aria-hidden="true"
    >
      {flights.map((flight, i) => (
        <div
          key={i}
          className={`flight-sprite ${flight.good ?? flight.coinGood ?? ""} ${flight.coin !== undefined ? "flight-coin" : "flight-card"} ${tabletop && flight.from.startsWith("bonus-face-") ? `flight-bonus flight-bonus-${flight.from.slice(11)}` : ""} ${flight.from.startsWith("market-") || (tabletop && flight.from === "deck") ? "flight-market" : ""}`}
        >
          {flight.good ? (
            <>
              <Card
                good={flight.good}
                disabled
                small={flight.from.startsWith("hand-")}
              />
              <div className="flight-back">
                {tabletop ? <JaipurMark /> : "✳"}
              </div>
            </>
          ) : tabletop ? (
            <>
              {flight.coinGood && <GoodsArt good={flight.coinGood} cardFace />}
              <b className="flight-coin-value">{flight.coin}</b>
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
