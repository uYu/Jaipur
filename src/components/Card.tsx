import type { Card as CardType } from "../game/types.ts";
import { LABEL, precious } from "../game/data.ts";
import { GoodsArt } from "./Art.tsx";
export function Card({
  good,
  selected = false,
  onClick,
  disabled = false,
  small = false,
  motionId,
  notice,
  arriving = false,
  departing = false,
}: {
  good: CardType;
  motionId?: string;
  notice?: string;
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
      className={`card ${good} ${selected ? "selected" : ""} ${small ? "small" : ""} ${premium ? "premium-card" : ""} ${arriving ? "market-arrived" : ""} ${departing ? "card-departing" : ""} ${notice ? "has-notice" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={
        premium
          ? "高级货物 · 至少 2 张起售"
          : good === "camel"
            ? "骆驼 · 不占手牌"
            : "普通货物 · 1 张起售"
      }
      aria-label={`${LABEL[good]}${premium ? "，高级货物，至少 2 张起售" : ""}${selected ? "，已选中" : ""}${notice ? `，${notice}` : ""}`}
      aria-pressed={selected}
    >
      {premium && (
        <span className="premium-badge">
          <span className="premium-badge-label">高级</span>
          <span className="premium-badge-minimum" aria-hidden="true">
            2+
          </span>
        </span>
      )}
      <GoodsArt good={good} cardFace />
      <span className="card-name">{LABEL[good]}</span>
      <span className="card-sale-rule">
        {good === "camel" ? "不占手牌" : premium ? "2张起售" : "1张起售"}
      </span>
      {selected && <span className="selected-check">✓</span>}
      {notice && <span className="market-card-notice">{notice}</span>}
    </button>
  );
}
