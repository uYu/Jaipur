import { useLayoutEffect, useRef } from "react";
import type { CardDeparture } from "../game/action-feedback.ts";

// Animate the existing cards in place: no cloned SVGs, travel paths or measuring.
export function MobileActionAnimation({
  departures,
  duration,
  elapsed,
  paused,
  departureHoldMs,
}: {
  departures: CardDeparture[];
  duration: number;
  elapsed: number;
  paused: boolean;
  departureHoldMs: number;
}) {
  const animations = useRef<Animation[]>([]);
  const frozen = useRef(paused);
  frozen.current = paused;
  useLayoutEffect(() => {
    for (const { anchor } of departures) {
      const card = document.querySelector<HTMLElement>(
        `.game-shell .card[data-motion-anchor="${anchor}"]`,
      );
      if (!card || typeof card.animate !== "function") continue;
      const animation = card.animate(
        [
          { offset: 0, opacity: 1 },
          { offset: departureHoldMs / duration, opacity: 1 },
          { offset: 1, opacity: 0 },
        ],
        { duration, fill: "both", easing: "linear" },
      );
      animation.currentTime = elapsed;
      if (frozen.current) animation.pause();
      animations.current.push(animation);
    }
    return () => {
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
    };
  }, [departures, duration, departureHoldMs]);
  useLayoutEffect(() => {
    animations.current.forEach((animation) =>
      paused ? animation.pause() : animation.play(),
    );
  }, [paused]);
  return null;
}
