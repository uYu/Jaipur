import { GoodsArt } from "./Art.tsx";
import { Minus, Plus } from "lucide-react";
import { TableNumber } from "./TableNumber.tsx";

/** A visible herd, or a fixed decorative stack when its size is private. */
export function CamelPile({
  count,
  motionAnchor,
}: {
  count: number | null;
  motionAnchor?: string;
}) {
  const privateHerd = count === null;
  const layers = privateHerd ? 3 : Math.max(1, Math.min(3, count));
  return (
    <span
      className={`camel-pile${privateHerd ? " camel-pile-private" : ""}${count === 0 ? " camel-pile-empty" : ""}`}
      role="img"
      aria-label={
        privateHerd ? "对手驼队，数量保密" : `驼队，共 ${count} 头骆驼`
      }
      data-motion-anchor={motionAnchor}
    >
      <span className="camel-pile-stack" aria-hidden="true">
        {Array.from({ length: layers }, (_, index) => (
          <span className="camel-pile-card camel" key={index}>
            {index === layers - 1 && <GoodsArt good="camel" cardFace />}
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
}: {
  count: number;
  selected: number;
  active: boolean;
  onChange?: (count: number) => void;
}) {
  return (
    <span
      className="camel-payment-control"
      data-selected={selected > 0}
      role="group"
      aria-label="选择骆驼付款"
    >
      <span className="camel-choice-payment">
        <span className="camel-choice-stepper">
          <button
            aria-label="减少付出骆驼"
            disabled={!active || selected === 0}
            onClick={() => onChange?.(selected - 1)}
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <output aria-label="已选付出骆驼数量" aria-live="polite">
            <span>付出骆驼:</span> <TableNumber value={selected} />
          </output>
          <button
            aria-label={`增加付出骆驼，已选 ${selected} 头，共 ${count} 头`}
            disabled={!active || selected >= count}
            onClick={() => onChange?.(selected + 1)}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </span>
      </span>
    </span>
  );
}
