import type { Card as CardType } from "../game/types.ts";
import { LABEL, precious } from "../game/data.ts";
import { GoodsArt } from "./Art.tsx";
import { Check } from "lucide-react";

function PremiumFoil() {
  return (
    <svg
      className="premium-foil"
      viewBox="0 0 54 70"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="premium-foil-frame"
        d="M18 1H5L1 5v60l4 4h44l4-4V5l-4-4H36"
      />
      <path
        className="premium-foil-corners"
        d="M5 13V6h7m30 0h7v7M5 57v7h7m30 0h7v-7"
      />
      <path className="premium-foil-crest" d="m27 0 3 4-3 4-3-4Z" />
      <path className="premium-foil-frame" d="M19 4h3m10 0h3" />
    </svg>
  );
}
export function Card({
  good,
  selected = false,
  onClick,
  disabled = false,
  small = false,
  motionId,
  arriving = false,
  departing = false,
}: {
  good: CardType;
  motionId?: string;
  arriving?: boolean;
  departing?: boolean;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const premium = good !== "camel" && precious(good);
  return (
    <button
      data-motion-anchor={motionId}
      className={`card ${good} ${selected ? "selected" : ""} ${small ? "small" : ""} ${premium ? "premium-card" : ""} ${arriving ? "market-arrived" : ""} ${departing ? "card-departing" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={
        premium
          ? "高级货物 · 至少 2 张起售"
          : good === "camel"
            ? "骆驼 · 不占手牌"
            : "普通货物 · 1 张起售"
      }
      aria-label={`${LABEL[good]}${premium ? "，高级货物，至少 2 张起售" : ""}${selected ? "，已选中" : ""}`}
      aria-pressed={selected}
    >
      {premium && <PremiumFoil />}
      {premium && (
        <span className="premium-badge">
          <span className="premium-badge-label">高级</span>
          <span className="premium-badge-minimum" aria-hidden="true">
            2张起售
          </span>
        </span>
      )}
      <GoodsArt good={good} cardFace />
      <span className="card-name">{LABEL[good]}</span>
      <span className="card-sale-rule">
        {good === "camel" ? "不占手牌" : premium ? "2张起售" : "1张起售"}
      </span>
      {selected && (
        <span className="selected-check" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
