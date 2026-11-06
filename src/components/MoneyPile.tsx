import { Coins } from "lucide-react";

/** A fixed decorative stack; its geometry never encodes a private balance. */
export function MoneyPile({
  amount,
  actor,
}: {
  amount: number | null;
  actor: 0 | 1;
}) {
  const hidden = amount === null;
  return (
    <span
      className={`money-pile${hidden ? " money-pile-private" : ""}`}
      role="img"
      aria-label={
        hidden
          ? "米拉的钱堆，收入保密，收市揭晓"
          : `${actor === 0 ? "你的" : "米拉的"}钱堆，${amount} 卢比`
      }
    >
      <span
        className="money-pile-coins"
        data-motion-anchor={`money-${actor}`}
        aria-hidden="true"
      >
        <i className="money-pile-coin" />
        <i className="money-pile-coin" />
        <i className="money-pile-coin money-pile-face">
          <Coins size={14} strokeWidth={1.6} />
        </i>
      </span>
      <strong className="money-pile-value" aria-hidden="true">
        {hidden ? "?" : amount}
      </strong>
    </span>
  );
}
