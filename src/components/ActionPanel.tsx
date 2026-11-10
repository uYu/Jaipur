import { useSkin } from "./Skin.tsx";
import { useId, useState } from "react";
import {
  ArrowLeftRight,
  Award,
  Check,
  Coins,
  Hand,
  Hourglass,
  Info,
  MousePointer2,
  RotateCcw,
} from "lucide-react";
import type { Selection } from "../game/selection.ts";
import {
  ACTION_INSTRUCTIONS,
  selectionGuide,
} from "../game/selection-guide.ts";
import type { Action, State } from "../game/types.ts";
import { CamelPayment } from "./CamelPile.tsx";
import { TutorialTapCue } from "./TutorialTapCue.tsx";

const confirmLabels = {
  camels: "确认收驼",
  sell: "确认出售",
  exchange: "确认交换",
  take: "确认拿取",
};

export function ActionOverview() {
  const { t } = useSkin();
  return (
    <div className="action-overview">
      {ACTION_INSTRUCTIONS.map(({ intent, label, text, short }) => {
        const GuideIcon = {
          take: Hand,
          sell: Coins,
          exchange: ArrowLeftRight,
        }[intent];
        return (
          <span className="action-instruction" key={intent}>
            <strong>
              <GuideIcon size={14} aria-hidden="true" />
              {t(label)}
            </strong>
            <span className="action-instruction-detail">{t(text)}</span>
            <span className="action-instruction-short">{t(short)}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ActionPanel({
  state,
  selection,
  active,
  separateOverview = false,
  onClear,
  onConfirm,
  hint,
  confirmationBlocked = false,
  confirmAs,
  exampleTap = false,
  exampleClearTap = false,
  status,
  turnNumber,
  camelPayment,
  thinking = false,
  settling = false,
}: {
  state: State;
  selection: Selection;
  active: boolean;
  separateOverview?: boolean;
  onClear: () => void;
  onConfirm: () => void;
  hint?: string;
  confirmationBlocked?: boolean;
  confirmAs?: Action["type"];
  exampleTap?: boolean;
  exampleClearTap?: boolean;
  status?: string;
  turnNumber?: number;
  camelPayment: {
    count: number;
    selected: number;
    active: boolean;
    exampleTap?: boolean;
    onChange: (count: number) => void;
  };
  thinking?: boolean;
  settling?: boolean;
}) {
  const copy = useSkin();
  const { t } = copy;
  const guide = selectionGuide(state, selection, copy);
  const { action, error, hasSelection } = guide;
  const overview = active && !hasSelection && !hint;
  const reward =
    active && !hint && !confirmationBlocked ? guide.bonusPreview : null;
  const reasonId = useId();
  const [attempt, setAttempt] = useState(0);
  const blockedReason =
    active && hasSelection && (error || !action) ? guide.hint : "";
  const ready = active && !!action && !blockedReason && !confirmationBlocked;
  const confirmationType = confirmAs ?? action?.type;
  const Icon = thinking
    ? Hourglass
    : blockedReason
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
      className={`action-description direct-guidance ${active && guide.problem ? "has-error" : ""} ${thinking ? "is-thinking" : ""}`}
      aria-live="polite"
      data-ready={ready}
      data-choosing={!hasSelection}
      data-your-turn={active && !hasSelection && !hint}
      data-overview={overview && !separateOverview}
      data-explaining={!!blockedReason || !!hint}
      data-reward={!!reward}
    >
      {overview && !separateOverview ? (
        <ActionOverview />
      ) : (
        <>
          <Icon
            className="selection-intent-icon"
            size={16}
            aria-hidden="true"
          />
          <b>
            {active && !overview
              ? confirmationBlocked
                ? "继续选牌"
                : guide.title
              : (status ?? (overview ? "请先选牌" : "等待对手行动"))}
          </b>
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
            {reward.tier === 5 ? "5+" : reward.tier}{t("张奖励筹码 ×1（")}{reward.min}–
            {reward.max}{t("卢比）")}
          </span>
        </span>
      )}
    </div>
  );
  return (
    <section
      className="action-panel direct-selection"
      aria-label="交易操作栏"
      data-ready={ready}
      data-intent={guide.intent}
      data-blocked={!!blockedReason || confirmationBlocked}
      data-overview={overview}
    >
      {separateOverview ? (
        description
      ) : (
        <div className="action-guidance-slot">
          {/* Reserve the overview's responsive height in every selection state. */}
          <div className="action-guidance-size" aria-hidden="true">
            <ActionOverview />
          </div>
          {description}
        </div>
      )}
      <CamelPayment {...camelPayment} />
      <button
        className="clear-button"
        aria-label="清空选择"
        title={t("清空已选卡牌和骆驼")}
        disabled={!active || !hasSelection}
        onClick={onClear}
      >
        <RotateCcw size={16} aria-hidden="true" />
        <span>重选</span>
        {exampleClearTap && <TutorialTapCue />}
      </button>
      <button
        className="primary confirm"
        disabled={!active || confirmationBlocked || (!hasSelection && !action)}
        aria-disabled={!ready}
        aria-describedby={blockedReason ? reasonId : undefined}
        onClick={() => {
          if (blockedReason) setAttempt((value) => value + 1);
          else onConfirm();
        }}
      >
        <Check size={16} aria-hidden="true" />
        {settling
          ? "正在交易…"
          : thinking
            ? t("等待米拉")
            : confirmationType
              ? t(confirmLabels[confirmationType])
              : hasSelection
                ? "继续选牌"
                : "请先选牌"}
        {exampleTap && ready && <TutorialTapCue />}
      </button>
    </section>
  );
}
