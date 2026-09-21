import type { Presentation } from "../game/presentation.ts";
import { sum } from "../game/data.ts";
export function SaleReceipt({
  receipt,
  actor,
}: {
  receipt: Presentation | null;
  actor: number;
}) {
  return (
    <div
      className="sale-receipt"
      aria-label={
        receipt
          ? `上笔收入：${receipt.coins.join(" + ") || "0"} 卢比${receipt.bonus === "hidden" ? "，另有秘密奖励" : receipt.bonus !== null ? `，奖励 ${receipt.bonus} 卢比` : ""}`
          : "尚无出售收入"
      }
    >
      {receipt && (
        <>
          <span className="receipt-label">
            上笔收入 · 货物 +{sum(receipt.coins)}
          </span>
          <div className="receipt-coins">
            {receipt.coins.map((value, i) => (
              <span
                key={i}
                className={`receipt-coin ${receipt.outgoing[0]}`}
                data-motion-anchor={`payment-${actor}-${i}`}
              >
                {value}
              </span>
            ))}
            {receipt.bonus !== null && (
              <span
                className="receipt-coin receipt-bonus"
                data-motion-anchor={`payment-${actor}-${receipt.coins.length}`}
                title="奖励筹码"
              >
                {receipt.bonus === "hidden" ? "?" : receipt.bonus}
                <small>奖</small>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
