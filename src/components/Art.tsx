import type { Card } from "../game/types.ts";
import { GoodsGlyph } from "./GoodsGlyph.tsx";
export function PremiumChipRim() {
  return (
    <svg className="premium-chip-rim" viewBox="0 0 40 40" aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r="19"
        fill="var(--card-bg)"
        stroke="currentColor"
        strokeWidth=".9"
        strokeOpacity=".75"
      />
      <circle
        cx="20"
        cy="20"
        r="16.4"
        fill="none"
        stroke="currentColor"
        strokeWidth=".65"
        opacity=".65"
      />
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="none"
        stroke="currentColor"
        strokeWidth=".6"
        strokeDasharray="1 7"
        opacity=".5"
      />
    </svg>
  );
}
export function JaipurMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 28h26M5 28V13l3-4 3 4v15M21 28V13l3-4 3 4v15M11 28V12c0-4 3-5 5-9 2 4 5 5 5 9v16" />
        <path d="M14 28v-8a2 2 0 0 1 4 0v8M8 16v2m16-2v2M16 11v2" />
      </g>
    </svg>
  );
}

export function GoodsArt({
  good,
  cardFace = false,
}: {
  good: Card;
  cardFace?: boolean;
}) {
  return <GoodsGlyph good={good} cardFace={cardFace} />;
}
