import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Flight } from "../game/flights.ts";
import { Card } from "./Card.tsx";
import { GoodsArt, JaipurMark } from "./Art.tsx";
import { handSlotOffset } from "../game/hand-layout.ts";
import { useReducedMotion } from "../hooks/useReducedMotion.ts";
export function ActionAnimation({
  flights,
  duration,
  paused,
  elapsed,
  settling = false,
  saleTravel = false,
  tableTravel = false,
  rememberOpponent = false,
}: {
  flights: Flight[];
  duration: number;
  paused: boolean;
  elapsed: number;
  settling?: boolean;
  saleTravel?: boolean;
  tableTravel?: boolean;
  rememberOpponent?: boolean;
}) {
  const reduced = useReducedMotion();
  const tabletop = tableTravel || saleTravel;
  const layer = useRef<HTMLDivElement>(null),
    animations = useRef<Animation[]>([]),
    frozen = useRef(paused);
  frozen.current = paused;
  useLayoutEffect(() => {
    const hidden = new Map<HTMLElement, string>();
    let time = elapsed;
    const build = () => {
      if (animations.current.length)
        time = Number(animations.current[0].currentTime ?? time);
      animations.current.forEach((a) => a.cancel());
      animations.current = [];
      // Read the board once, before changing any sprite or starting animations.
      // Interleaving these operations forces layout once per travelling card.
      const boxes = new Map<HTMLElement, DOMRect>();
      const styles = new Map<HTMLElement, CSSStyleDeclaration>();
      const anchors = new Map<string, HTMLElement | undefined>();
      const rect = (element: HTMLElement) => {
        if (!boxes.has(element))
          boxes.set(element, element.getBoundingClientRect());
        return boxes.get(element)!;
      };
      const style = (element: HTMLElement) => {
        if (!styles.has(element))
          styles.set(element, getComputedStyle(element));
        return styles.get(element)!;
      };
      const find = (name: string) => {
        if (!anchors.has(name)) {
          const visible = (selector: string) =>
            Array.from(document.querySelectorAll<HTMLElement>(selector)).find(
              (element) => rect(element).width > 0 && rect(element).height > 0,
            );
          anchors.set(
            name,
            visible(`[data-motion-anchor="${name}"]`) ??
              visible(`[data-motion-fallback="${name}"]`),
          );
        }
        return anchors.get(name);
      };
      const startMotions: (() => void)[] = [];
      const destinationCounts = new Map<string, number>();
      flights.forEach(({ to }) =>
        destinationCounts.set(to, (destinationCounts.get(to) ?? 0) + 1),
      );
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
          tabletop &&
          (flight.to.endsWith("-herd") ||
            (rememberOpponent &&
              flight.to === "opponent-hand" &&
              flight.from.startsWith("market-")))
            ? false
            : flight.toBack;
        const a = rect(source),
          b = rect(target);
        const coin = flight.coin !== undefined;
        const handTarget =
          tabletop &&
          (flight.to === "your-hand" || flight.to === "opponent-hand");
        // The deck is a narrow stack, not a card face. A dealt card starts at
        // its destination's aspect ratio instead of stretching out of the deck.
        const cardBox = tabletop && flight.from === "deck" ? b : a;
        const width = coin
          ? 34
          : tabletop ||
              flight.from.startsWith("market-") ||
              flight.from.startsWith("hand-")
            ? cardBox.width
            : 64;
        const height = coin
          ? 34
          : tabletop || source.classList.contains("card")
            ? cardBox.height
            : width * 1.43;
        const saleStackStep =
          saleTravel && flight.to === "sale"
            ? Math.min(1.5, b.width * 0.03)
            : 0;
        const saleStackSpan =
          saleStackStep * Math.max(0, (destinationCounts.get("sale") ?? 0) - 1);
        const measureElement = find("hand-measure");
        const measure = measureElement ? rect(measureElement) : undefined;
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
          : handTarget
            ? (measure?.width ??
              (objectTarget ? rect(objectTarget).width : undefined) ??
              a.width)
            : objectTarget
              ? rect(objectTarget).width
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
                  ((destinationCounts.get(flight.to) ?? 0) - 1) / 2) *
                Math.min(1.2, b.width * 0.025)
              : (flight.slot ?? 0) * (flight.to === "sale" ? 3 : 7);
        const gap = Number.parseFloat(style(target).columnGap) || 7;
        const columns = Math.max(
          1,
          Math.floor((b.width + gap) / (targetWidth + gap)),
        );
        const singleRow =
          flight.to === "your-hand" && style(target).flexWrap === "nowrap";
        const overlap =
          singleRow && measureElement
            ? Number.parseFloat(style(measureElement).marginLeft) || 0
            : 0;
        const targetStyle = style(target);
        const paddingLeft = Number.parseFloat(targetStyle.paddingLeft) || 0;
        const paddingTop = Number.parseFloat(targetStyle.paddingTop) || 0;
        const lastFanCard = targetFanCards?.length
          ? rect(targetFanCards[targetFanCards.length - 1])
          : undefined;
        const fanLanding = lastFanCard
          ? Math.min(
              b.right - targetWidth / 2,
              lastFanCard.right -
                targetWidth / 2 +
                ((flight.slot ?? 0) + 1) * targetWidth * 0.22,
            )
          : b.left + b.width / 2;
        const targetX = handTarget
          ? b.left +
            paddingLeft +
            targetWidth / 2 +
            handSlotOffset(
              b.width - paddingLeft * 2,
              targetWidth,
              flight.handCount ?? Math.max(1, (flight.slot ?? 0) + 1),
              flight.slot ?? 0,
              gap,
            )
          : flight.to === "your-hand"
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
        const targetY = handTarget
          ? b.top + paddingTop + (measure?.height ?? targetWidth * 1.5) / 2
          : flight.to === "your-hand"
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
        const sourceStyle = style(source);
        const sourcePadding = sourceStyle.padding;
        const sourceRadius = sourceStyle.borderRadius;
        const targetHeight = coin
          ? b.height
          : handTarget
            ? (measure?.height ?? targetWidth * 1.5)
            : objectTarget
              ? rect(objectTarget).height
              : flight.to.startsWith("market-") ||
                  flight.to.startsWith("hand-") ||
                  flight.to === "sale"
                ? b.height - saleStackSpan
                : flight.to === "your-hand"
                  ? (measure?.height ?? targetWidth * 1.43)
                  : targetWidth * 1.43;
        // A landing anchor can include a count badge, stack or money bag.
        // Fit the physical object uniformly; never squash its x/y axes.
        const landingScale = Math.min(
          targetWidth / width,
          targetHeight / height,
        );
        const landing = `translate(${tx - x}px, ${ty - y}px) scale(${landingScale})`;
        // Sparse hands can keep the same positions even when their count changes.
        // Do not replace a stationary real card with a redundant animated copy.
        if (
          flight.layout &&
          Math.abs(tx - x) < 0.1 &&
          Math.abs(ty - y) < 0.1 &&
          Math.abs(targetWidth - width) < 0.1 &&
          Math.abs(targetHeight - height) < 0.1
        ) {
          startMotions.push(() => {
            sprite.style.opacity = "0";
          });
          return;
        }
        if (flight.layout) {
          // Move retained cards themselves: no duplicate SVG face, source fade,
          // or layer swap is needed just to make room in the same hand.
          startMotions.push(() => {
            sprite.style.opacity = "0";
            if (typeof source.animate !== "function") return;
            const start = Math.min(0.95, flight.start);
            const motion = source.animate(
              [
                { offset: 0, transform: "none" },
                {
                  offset: start,
                  transform: "none",
                  easing: reduced
                    ? "steps(1, end)"
                    : "cubic-bezier(0.3, 0, 0.7, 1)",
                },
                {
                  offset: reduced
                    ? Math.min(start + 0.01, flight.end)
                    : flight.end,
                  transform: landing,
                },
                { offset: 1, transform: landing },
              ],
              { duration, fill: "both" },
            );
            motion.currentTime = time;
            if (frozen.current) motion.pause();
            animations.current.push(motion);
          });
          return;
        }
        startMotions.push(() => {
          Object.assign(sprite.style, {
            opacity: "",
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
          });
          // Match the travelling face to the physical card instead of switching
          // padding, corner shape and glyph scale at take-off and landing.
          const face = sprite.querySelector<HTMLElement>(":scope > .card");
          if (tabletop && face) {
            face.style.padding = source.classList.contains("card")
              ? sourcePadding
              : "3px";
            face.style.borderRadius = sourceRadius;
            face.style.boxShadow = "0 2px 5px #102d2633";
          }
          if (!tabletop && flight.hideSource && !hidden.has(source)) {
            hidden.set(source, source.style.visibility);
            if (!reduced || typeof source.animate !== "function")
              source.style.visibility = "hidden";
          }
          if (flight.hideTarget && !hidden.has(target)) {
            hidden.set(target, target.style.visibility);
            target.style.visibility = "hidden";
          }
          const start = Math.min(0.95, flight.start),
            end = Math.min(0.99, flight.end),
            middle =
              tabletop && flight.from === "deck"
                ? start + (end - start) * 0.5
                : tabletop && fromBack
                  ? start + (end - start) * 0.2
                  : tabletop && toBack
                    ? start + (end - start) * 0.8
                    : (start + end) / 2;
          // Tabletop cards hold their final slots until the real board replaces
          // them at exactly the same geometry. No fade-out / reappearance gap.
          const vanishAtEnd =
            (flight.to === "sale" && !saleTravel) ||
            (!tabletop && settling && flight.to === "your-hand");
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
                    easing: "cubic-bezier(0.3, 0, 0.7, 1)",
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
            if (!!fromBack === !!toBack) {
              back.style.opacity = toBack ? "1" : "0";
              return;
            }
            back.style.opacity = "1";
            // Rotate two faces around the same center while translation keeps
            // running. Swapping opacity near a single frame looks like a hitch.
            const halfFlip = Math.min(
              150 / duration,
              middle - start,
              end - middle,
            );
            const flipStart = middle - halfFlip;
            const flipEnd = middle + halfFlip;
            for (const [element, first, last] of [
              [face, fromBack ? 180 : 0, toBack ? 180 : 0],
              [back, fromBack ? 0 : -180, toBack ? 0 : -180],
            ] as const) {
              if (!element) continue;
              const flip = element.animate(
                [
                  { offset: 0, transform: `rotateY(${first}deg)` },
                  { offset: flipStart, transform: `rotateY(${first}deg)` },
                  { offset: flipEnd, transform: `rotateY(${last}deg)` },
                  { offset: 1, transform: `rotateY(${last}deg)` },
                ],
                { duration, fill: "both", easing: "linear" },
              );
              flip.currentTime = time;
              if (frozen.current) flip.pause();
              animations.current.push(flip);
            }
          }
        });
      });
      startMotions.forEach((start) => start());
      // Share one clock for source hiding, travel and flips, including rebuilds.
      const now = document.timeline.currentTime;
      if (!frozen.current && typeof now === "number")
        animations.current.forEach((animation) => {
          animation.startTime = now - time;
        });
    };
    build();
    let resizeFrame = 0;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(build);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", resize);
      animations.current.forEach((a) => a.cancel());
      animations.current = [];
      hidden.forEach((visibility, element) => {
        element.style.visibility = visibility;
      });
    };
  }, [
    flights,
    duration,
    reduced,
    settling,
    saleTravel,
    tabletop,
    rememberOpponent,
  ]);
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
          {flight.layout ? null : flight.good ? (
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
