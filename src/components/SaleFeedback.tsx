import type { Presentation } from "../game/presentation.ts";
import { saleFeedbackText } from "../game/action-feedback.ts";
import { GoodsArt } from "./Art.tsx";
import { LABEL } from "../game/data.ts";
import {
  FEEDBACK_DURATION_MS,
  useFeedbackLifetime,
} from "../hooks/useFeedbackLifetime.ts";

export function SaleFeedback({
  action,
  paused,
}: {
  action: Presentation;
  paused: boolean;
}) {
  const visible = useFeedbackLifetime(paused);
  const text = saleFeedbackText(action);
  const bonusTier = Math.min(action.outgoing.length, 5);
  if (!visible) return null;
  return (
    <div
      className="sale-feedback"
      role="status"
      aria-atomic="true"
      data-paused={paused}
      style={{ animationDuration: `${FEEDBACK_DURATION_MS}ms` }}
    >
      <span className="sale-feedback-title" aria-label={text.title}>
        <span>{action.actor === 0 ? "你" : "米拉"}卖出</span>
        <span
          className={`sale-feedback-good ${action.outgoing[0]}`}
          role="img"
          aria-label={LABEL[action.outgoing[0]]}
        >
          <GoodsArt good={action.outgoing[0]} cardFace />
        </span>
        <span>×{action.outgoing.length}</span>
      </span>
      <strong>{text.income}</strong>
      <div
        className="sale-feedback-coins"
        role="group"
        aria-label={`货物筹码 ${action.coins.join(" + ")} 卢比${action.bonus !== null ? `；${bonusTier}张奖励${action.bonus === "hidden" ? "面值保密" : `${action.bonus} 卢比`}` : ""}`}
      >
        {action.coins.map((value, i) => (
          <span
            className={`sale-feedback-coin ${action.outgoing[0]}`}
            key={i}
            aria-hidden="true"
          >
            {value}
          </span>
        ))}
        {action.bonus !== null && (
          <>
            {action.coins.length > 0 && (
              <span className="sale-feedback-plus" aria-hidden="true">
                ＋
              </span>
            )}
            <span
              className="sale-feedback-reward"
              aria-hidden="true"
              title={`${bonusTier}张奖励${action.bonus === "hidden" ? "，面值保密" : ""}`}
            >
              <span className="sale-feedback-tier">{bonusTier}张奖励</span>
              <span className="sale-feedback-reward-value">
                <b>{action.bonus === "hidden" ? "?" : action.bonus}</b>
                <small>卢比</small>
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
