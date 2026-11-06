import type { Card } from "../game/types.ts";
import type { Presentation } from "../game/presentation.ts";
import { actionCaption } from "../game/presentation.ts";
import { LABEL } from "../game/data.ts";
import { GoodsArt } from "./Art.tsx";
import {
  FEEDBACK_DURATION_MS,
  useFeedbackLifetime,
} from "../hooks/useFeedbackLifetime.ts";

function Goods({ cards }: { cards: Card[] }) {
  return [...new Set(cards)].map((good) => {
    const count = cards.filter((card) => card === good).length;
    return (
      <span
        className={`trade-feedback-good ${good}`}
        key={good}
        title={`${LABEL[good]} ×${count}`}
      >
        <GoodsArt good={good} cardFace />
        <b>×{count}</b>
      </span>
    );
  });
}

export function TradeFeedback({
  action,
  paused,
}: {
  action: Presentation;
  paused: boolean;
}) {
  const visible = useFeedbackLifetime(paused);
  if (!visible || action.type === "sell") return null;
  const verb = { take: "拿牌", camels: "收驼", exchange: "换牌" }[action.type];
  return (
    <div
      className="trade-feedback"
      role="status"
      aria-label={`${action.actor === 0 ? "你" : "米拉"}：${actionCaption(action)}`}
      data-paused={paused}
      style={{ animationDuration: `${FEEDBACK_DURATION_MS}ms` }}
    >
      <b className="trade-feedback-title">
        {action.actor === 0 ? "你" : "米拉"}
        {verb}
      </b>
      <div className="trade-feedback-flow" aria-hidden="true">
        {action.type === "exchange" && (
          <div>
            <span>付出</span>
            <Goods cards={action.outgoing} />
          </div>
        )}
        <div>
          {action.type === "exchange" && <span>换入</span>}
          <Goods cards={action.incoming} />
        </div>
      </div>
    </div>
  );
}
