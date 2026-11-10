import { Cpu } from "lucide-react";
import { HardwareArt } from "./HardwareArt.tsx";
import { useSkin } from "./Skin.tsx";
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
        strokeWidth="1.4"
      />
      <circle
        cx="20"
        cy="20"
        r="17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeDasharray="4.25 9.4945"
        transform="rotate(-12 20 20)"
      />
      <circle
        cx="20"
        cy="20"
        r="15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth=".9"
        opacity=".8"
      />
    </svg>
  );
}
export function JaipurMark() {
  const { skin } = useSkin();
  if (skin === "hardware") return <Cpu aria-hidden="true" />;
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
  const { skin } = useSkin();
  if (skin === "hardware") return <HardwareArt name={good} className="goods-art" />;
  return <GoodsGlyph good={good} cardFace={cardFace} />;
}
