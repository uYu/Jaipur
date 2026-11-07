import { useId, useState } from "react";
import {
  ArrowLeftRight,
  Award,
  Check,
  Coins,
  Hand,
  Info,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
} from "lucide-react";
import { selectCamels } from "../game/selection.ts";
import type { Selection } from "../game/selection.ts";
import {
  ACTION_INSTRUCTIONS,
  selectionGuide,
} from "../game/selection-guide.ts";
import type { State } from "../game/types.ts";

export function ActionPanel({
  state,
  selection,
  active,
  onSelectionChange,
  onClear,
  onConfirm,
  hint,
  confirmationBlocked = false,
  camelPaymentAllowed = true,
  status,
  turnNumber,
}: {
  state: State;
  selection: Selection;
  active: boolean;
  onSelectionChange: (selection: Selection) => void;
  onClear: () => void;
  onConfirm: () => void;
  hint?: string;
  confirmationBlocked?: boolean;
  camelPaymentAllowed?: boolean;
  status?: string;
  turnNumber?: number;
}) {
  const guide = selectionGuide(state, selection);
  const { action, error, hasSelection } = guide;
  const overview = active && !hasSelection && !hint;
  const reward = active && !hint ? guide.bonusPreview : null;
  const reasonId = useId();
  const [attempt, setAttempt] = useState(0);
  const blockedReason =
    active && hasSelection
      ? error || !action
        ? guide.hint
        : confirmationBlocked
          ? hint || "先点教程「下一步」，核对预览后再确认。"
          : ""
      : "";
  const player = state.players[0];
  const { market, hand, camels } = selection;
  const canPayCamels =
    camelPaymentAllowed &&
    player.camels > 0 &&
    (market.some((i) => state.market[i] !== "camel") ||
      hand.length > 0 ||
      camels > 0);
  const Icon = blockedReason
    ? Info
    : guide.intent === "sell"
      ? Coins
      : guide.intent === "exchange"
        ? ArrowLeftRight
        : guide.intent === "idle"
          ? MousePointer2
          : Hand;
  const description = (
    <div
      className={`action-description direct-guidance ${active && guide.problem ? "has-error" : ""}`}
      aria-live="polite"
      data-ready={active && !!action && !error}
      data-choosing={!hasSelection}
      data-overview={overview}
      data-explaining={!!blockedReason || !!hint}
      data-reward={!!reward}
    >
      {overview ? (
        <div className="action-overview">
          {ACTION_INSTRUCTIONS.map(({ intent, label, text }) => {
            const GuideIcon = {
              take: Hand,
              sell: Coins,
              exchange: ArrowLeftRight,
            }[intent];
            return (
              <span className="action-instruction" key={intent}>
                <strong>
                  <GuideIcon size={14} aria-hidden="true" />
                  {label}
                </strong>
                <span>{text}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <>
          <Icon
            className="selection-intent-icon"
            size={16}
            aria-hidden="true"
          />
          <b>{active ? guide.title : (status ?? "等待对手行动")}</b>
        </>
      )}
      {turnNumber !== undefined && (
        <small className="action-turn-count" aria-label={`第 ${turnNumber} 手`}>
          第 {turnNumber} 手
        </small>
      )}
      {!overview && (blockedReason || hint) && (
        <span
          className={blockedReason ? "invalid" : "selection-next-step"}
          id={reasonId}
          key={`${blockedReason}-${attempt}`}
          aria-hidden={!active}
          style={{ visibility: active ? "visible" : "hidden" }}
        >
          {blockedReason || hint}
        </span>
      )}
      {reward && (
        <span className="selection-reward">
          <Award size={14} aria-hidden="true" />
          <span>
            {reward.tier === 5 ? "5+" : reward.tier}张奖励筹码 ×1（{reward.min}–
            {reward.max}卢比）
          </span>
        </span>
      )}
    </div>
  );
  return (
    <section
      className="action-panel direct-selection"
      aria-label="交易操作栏"
      data-ready={active && !!action && !error}
      data-intent={guide.intent}
      data-blocked={!!blockedReason}
      data-overview={overview}
    >
      {description}
      {canPayCamels && (
        <div
          className="camel-picker"
          role="group"
          aria-label={`用骆驼付款，共 ${player.camels} 头`}
        >
          <span className="camel-picker-label">骆驼付款</span>
          <div className="camel-payment" data-active="true">
            <button
              aria-label="减少付出骆驼"
              disabled={!active || !camels}
              onClick={() =>
                onSelectionChange(selectCamels(state, selection, camels - 1))
              }
            >
              <Minus size={16} aria-hidden="true" />
            </button>
            <output aria-label="已选付出骆驼数量" aria-live="polite">
              <span>{camels}</span>
            </output>
            <button
              aria-label="增加付出骆驼"
              disabled={!active || camels >= player.camels}
              onClick={() =>
                onSelectionChange(selectCamels(state, selection, camels + 1))
              }
            >
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <button
        className="clear-button"
        aria-label="清空选择"
        title="清空已选卡牌和骆驼"
        disabled={!active || !hasSelection}
        onClick={onClear}
      >
        <RotateCcw size={16} aria-hidden="true" />
        <span>重选</span>
      </button>
      <button
        className="primary confirm"
        disabled={!active || (!hasSelection && !action)}
        aria-disabled={!!blockedReason || !active || (!hasSelection && !action)}
        aria-describedby={blockedReason ? reasonId : undefined}
        onClick={() => {
          if (blockedReason) setAttempt((value) => value + 1);
          else onConfirm();
        }}
      >
        <Check size={16} aria-hidden="true" />
        {action?.type === "camels"
          ? "收下全部骆驼"
          : action?.type === "sell"
            ? "确认出售"
            : action?.type === "exchange"
              ? "确认交换"
              : action?.type === "take"
                ? "确认拿取"
                : hasSelection
                  ? "继续选牌"
                  : "请先选牌"}
      </button>
    </section>
  );
}
