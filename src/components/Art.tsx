import type { Card } from "../game/types.ts";
import { GoodsGlyph } from "./GoodsGlyph.tsx";
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
