import { Coins } from "lucide-react";

function MoneyBag() {
  return (
    <svg viewBox="4 2 24 28" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m11 4 5 2 5-2-2 7h-6Z" fill="#d9c28e" />
        <path
          d="M13 11C9 15 5 19 6 24c1 6 19 6 20 0 1-5-3-9-7-13Z"
          fill="#e8d8b1"
        />
        <path d="M12 11h8m-7 8h6m-6 4h6m-3-7v10" />
      </g>
    </svg>
  );
}

/** A fixed decorative stack; its geometry never encodes a private balance. */
export function MoneyPile({
  amount,
  actor,
  tabletop = false,
  goodsOnly = false,
}: {
  amount: number | null;
  actor: 0 | 1;
  tabletop?: boolean;
  goodsOnly?: boolean;
}) {
  const hidden = amount === null;
  return (
    <span
      className={`money-pile${hidden ? " money-pile-private" : ""}${tabletop ? " money-pile-tabletop" : ""}`}
      role="img"
      data-digits={hidden ? undefined : String(amount).length}
      aria-label={
        hidden
          ? "米拉的钱堆，收入保密，收市揭晓"
          : goodsOnly
            ? `米拉的货物得分，${amount} 卢比，不含奖励筹码`
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
          {tabletop ? <MoneyBag /> : <Coins size={16} strokeWidth={1.6} />}
        </i>
      </span>
      <strong className="money-pile-value" aria-hidden="true">
        {hidden ? "?" : amount}
      </strong>
    </span>
  );
}
