import type { Card as CardType } from "../game/types.ts";
import { ENGLISH, LABEL, precious } from "../game/data.ts";
import { GoodsArt } from "./Art.tsx";
export function Card({
  good,
  selected = false,
  onClick,
  disabled = false,
  small = false,
  motionId,
  notice,
}: {
  good: CardType;
  motionId?: string;
  notice?: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const premium = good !== "camel" && precious(good);
  return (
    <button
      data-motion-anchor={motionId}
      className={`card ${good} ${selected ? "selected" : ""} ${small ? "small" : ""} ${premium ? "premium-card" : ""} ${notice && notice !== "取走" ? "market-arrived" : ""}`}
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
      {premium ? (
        <span className="premium-badge">高级</span>
      ) : (
        <span className="card-corner">{good === "camel" ? "∞" : "Ⅰ"}</span>
      )}
      <GoodsArt good={good} cardFace />
      <span className="card-name">{LABEL[good]}</span>
      {premium ? (
        <span className="card-sale-rule">2 张起售</span>
      ) : (
        <span className="card-en">{ENGLISH[good]}</span>
      )}
      {selected && <span className="selected-check">✓</span>}
      {notice && <span className="market-card-notice">{notice}</span>}
    </button>
  );
}
