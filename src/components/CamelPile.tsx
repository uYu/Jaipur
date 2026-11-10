import { useSkin } from "./Skin.tsx";
import { GoodsArt } from "./Art.tsx";
import { Minus, Plus } from "lucide-react";
import { TableNumber } from "./TableNumber.tsx";
import { PixelArt } from "./PixelArt.tsx";
import { TutorialTapCue } from "./TutorialTapCue.tsx";

/** A visible herd, or a fixed decorative stack when its size is private. */
export function CamelPile({
  count,
  motionAnchor,
}: {
  count: number | null;
  motionAnchor?: string;
}) {
  const { t, skin, labels } = useSkin();
  const privateHerd = count === null;
  const layers = privateHerd ? 3 : Math.max(1, Math.min(3, count));
  return (
    <span
      className={`camel-pile${privateHerd ? " camel-pile-private" : ""}${count === 0 ? " camel-pile-empty" : ""}`}
      role="img"
      aria-label={
        privateHerd ? t("对手驼队，数量保密") : t`驼队，共 ${count} 头骆驼`
      }
      data-motion-anchor={motionAnchor}
    >
      <span className="camel-pile-stack" aria-hidden="true">
        {Array.from({ length: layers }, (_, index) => (
          <span className="camel-pile-card camel" key={index}>
            {index === layers - 1 && (
              <>
                <GoodsArt good="camel" cardFace />
                <PixelArt name="camel" />
                {skin === "hardware" && (
                  <span className="hardware-pickup-label">{labels.camel}</span>
                )}
              </>
            )}
          </span>
        ))}
      </span>
      <b className="camel-pile-count" aria-hidden="true">
        <TableNumber value={privateHerd ? "?" : count!} />
      </b>
    </span>
  );
}

export function CamelPayment({
  count,
  selected,
  active,
  onChange,
  exampleTap = false,
}: {
  count: number;
  selected: number;
  active: boolean;
  onChange?: (count: number) => void;
  exampleTap?: boolean;
}) {
  const { t } = useSkin();
  return (
    <span
      className="camel-payment-control"
      data-selected={selected > 0}
      role="group"
      aria-label={t("选择骆驼付款")}
    >
      <span className="camel-choice-payment">
        <span className="camel-choice-stepper">
          <button
            aria-label={t("减少付出骆驼")}
            disabled={!active || selected === 0}
            onClick={() => onChange?.(selected - 1)}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <output aria-label={t("已选付出骆驼数量")} aria-live="polite">
            <span>{t("付出骆驼:")}</span> <TableNumber value={selected} />
          </output>
          <button
            aria-label={t`增加付出骆驼，已选 ${selected} 头，共 ${count} 头`}
            disabled={!active || selected >= count}
            onClick={() => onChange?.(selected + 1)}
          >
            <Plus size={14} aria-hidden="true" />
            {exampleTap && <TutorialTapCue />}
          </button>
        </span>
      </span>
    </span>
  );
}
