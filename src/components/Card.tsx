import { useSkin } from "./Skin.tsx";
import type { Card as CardType } from "../game/types.ts";
import { precious } from "../game/data.ts";
import { GoodsArt } from "./Art.tsx";
import { Check } from "lucide-react";
import { hardwareModels } from "../game/skin-copy.ts";
import { PixelArt } from "./PixelArt.tsx";
import { TutorialTapCue } from "./TutorialTapCue.tsx";

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
export function CardFace({ good }: { good: CardType }) {
  const { t, labels, skin } = useSkin();
  const model = skin === "hardware" ? hardwareModels[good] : undefined;
  const premium = good !== "camel" && precious(good);
  return (
    <>
      {premium && <PremiumFoil />}
      {premium && (
        <span className="premium-badge">
          <span className="premium-badge-label">{t("高级")}</span>
          <span className="premium-badge-minimum" aria-hidden="true">
            2张起售
          </span>
        </span>
      )}
      <GoodsArt good={good} cardFace />
      <PixelArt name={good} />
      <span className="card-name">{labels[good]}</span>
      {model && <span className="hardware-card-model">{model}</span>}
      <span className="card-sale-rule">
        {good === "camel" ? t("不占手牌") : premium ? "2张起售" : "1张起售"}
      </span>
    </>
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
  exampleTap = false,
}: {
  good: CardType;
  motionId?: string;
  arriving?: boolean;
  departing?: boolean;
  exampleTap?: boolean;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
}) {
  const { t, labels, skin } = useSkin();
  const model = skin === "hardware" ? hardwareModels[good] : undefined;
  const premium = good !== "camel" && precious(good);
  return (
    <button
      data-motion-anchor={motionId}
      className={`card ${good} ${selected ? "selected" : ""} ${small ? "small" : ""} ${premium ? "premium-card" : ""} ${arriving ? "market-arrived" : ""} ${departing ? "card-departing" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={
        model ? `${labels[good]} · ${model}${premium ? " · 2 张起售" : ""}` : premium
          ? t("高级货物 · 至少 2 张起售")
          : good === "camel"
            ? t("骆驼 · 不占手牌")
            : t("普通货物 · 1 张起售")
      }
      aria-label={`${labels[good]}${premium ? t("，高级货物，至少 2 张起售") : ""}${selected ? "，已选中" : ""}`}
      aria-pressed={selected}
    >
      <CardFace good={good} />
      {exampleTap && <TutorialTapCue />}
      {selected && (
        <span className="selected-check" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
