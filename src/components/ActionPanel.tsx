import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  Coins,
  Hand,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { LABEL, sum } from "../game/data.ts";
import { selectCamels, selectedAction } from "../game/selection.ts";
import type { ActionMode, Selection } from "../game/selection.ts";
import type { State } from "../game/types.ts";
import { CamelPile } from "./CamelPile.tsx";

export function ActionPanel({
  state,
  selection,
  active,
  onSelectionChange,
  onClear,
  onConfirm,
  hint,
  confirmationBlocked = false,
  tabletop = false,
  status,
  turnNumber,
  mode,
  onModeChange,
  chooseModeEnabled = active,
  allowedMode,
  descriptionTarget,
}: {
  state: State;
  selection: Selection;
  active: boolean;
  onSelectionChange: (selection: Selection) => void;
  onClear: () => void;
  onConfirm: () => void;
  hint?: string;
  confirmationBlocked?: boolean;
  tabletop?: boolean;
  status?: string;
  turnNumber?: number;
  mode: ActionMode | null;
  onModeChange: (mode: ActionMode | null) => void;
  chooseModeEnabled?: boolean;
  allowedMode?: ActionMode;
  descriptionTarget?: HTMLElement | null;
}) {
  const { market, hand, camels } = selection;
  const hasSelection = market.length > 0 || hand.length > 0 || camels > 0;
  const canRestartAction = chooseModeEnabled && mode !== null;
  const { action, error } = active
    ? selectedAction(state, selection, mode)
    : { action: null, error: "" };
  const player = state.players[0];
  const soldValue =
    action?.type === "sell"
      ? sum(state.tokens[action.good].slice(0, action.count))
      : 0;
  const choosing = active || chooseModeEnabled;
  const showChoices = !mode || !!allowedMode;
  const modeLabel =
    mode === "take" ? "拿取" : mode === "sell" ? "出售" : "交换";
  const instruction =
    mode === "take"
      ? "选 1 张货物，或全部骆驼"
      : mode === "sell"
        ? "点选要出售的同类手牌"
        : mode === "exchange"
          ? "选市场货物，再选付款"
          : "轮到你了，先选行动";
  const description = (
    <div
      className={`action-description ${error ? "has-error" : ""}`}
      aria-live="polite"
      data-ready={!!action && !error}
      data-choosing={showChoices}
    >
      {!showChoices && (
        <button
          className="change-action"
          aria-label="更换行动"
          title="更换行动会清空当前选择"
          disabled={!chooseModeEnabled}
          onClick={() => onModeChange(null)}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          {modeLabel}
        </button>
      )}
      <b>
        {!choosing
          ? (status ?? "等待对手行动")
          : action?.type === "camels"
            ? `收下市场全部 ${market.length} 头骆驼`
            : action?.type === "exchange"
              ? tabletop
                ? `换入 ${market.length} 张 · 付出 ${hand.length} 张 + ${camels} 驼`
                : `换入 ${market.length} 张 · 付出 ${hand.length} 张货物 + ${camels} 头骆驼`
              : action?.type === "sell"
                ? `出售 ${hand.length} 张${LABEL[action.good]}${tabletop ? ` · ${soldValue} 卢比${action.count >= 3 && state.bonus[Math.min(action.count, 5) as 3 | 4 | 5].length ? " + 奖励" : ""}` : ""}`
                : action?.type === "take"
                  ? `拿取 1 张${LABEL[state.market[action.index]]}`
                  : instruction}
      </b>
      {tabletop && showChoices && turnNumber !== undefined && (
        <small className="action-turn-count">第 {turnNumber} 手</small>
      )}
      <span className={error ? "invalid" : ""}>
        {error ||
          hint ||
          (action?.type === "sell"
            ? `获得 ${soldValue} 卢比${action.count >= 3 ? "，并在奖励堆有剩余时领取奖励" : ""}`
            : action?.type === "exchange"
              ? "数量已配平，可以确认交换；再次点击可取消选牌"
              : action?.type === "camels"
                ? "骆驼加入你的驼队，不占手牌上限"
                : action?.type === "take"
                  ? "拿取只选一张货物；要拿多张，请改选交换"
                  : "先选行动，再选卡牌。确认前可以切换行动，原选择会清空。")}
      </span>
    </div>
  );
  return (
    <section
      className="action-panel"
      aria-label="交易操作栏"
      data-ready={!!action && !error}
      data-mode={mode ?? "choose"}
      data-choosing={showChoices}
    >
      <div className="action-modes" role="group" aria-label="选择本手行动">
        {(
          [
            { value: "take", label: "拿取", Icon: Hand },
            { value: "sell", label: "出售", Icon: Coins },
            { value: "exchange", label: "交换", Icon: ArrowLeftRight },
          ] as const
        ).map(({ value, label, Icon }) => (
          <button
            key={value}
            className={`action-mode action-mode-${value}`}
            aria-pressed={mode === value}
            aria-label={`选择${label}行动`}
            disabled={
              !chooseModeEnabled || (!!allowedMode && allowedMode !== value)
            }
            onClick={() => onModeChange(value)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {tabletop
        ? descriptionTarget && createPortal(description, descriptionTarget)
        : description}
      <div
        className="camel-picker"
        role="group"
        aria-label={
          mode === "exchange" ? `付出骆驼，共 ${player.camels} 头` : "你的驼队"
        }
      >
        <span className="camel-picker-label">
          {tabletop ? (
            <CamelPile count={player.camels} motionAnchor="your-herd" />
          ) : (
            "骆驼"
          )}
        </span>
        <div className="camel-payment" data-active={mode === "exchange"}>
          <button
            aria-label="减少付出骆驼"
            disabled={!active || !camels}
            onClick={() =>
              onSelectionChange(
                selectCamels(state, selection, camels - 1, mode),
              )
            }
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <output aria-label="已选付出骆驼数量" aria-live="polite">
            {tabletop && <small>付出</small>}
            <span>{camels}</span>
          </output>
          <button
            aria-label="增加付出骆驼"
            disabled={!active || camels >= player.camels}
            onClick={() =>
              onSelectionChange(
                selectCamels(state, selection, camels + 1, mode),
              )
            }
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <button
        className="clear-button"
        aria-label={canRestartAction ? "重新选择行动" : "清空选择"}
        title={
          canRestartAction
            ? "重新选择行动"
            : hasSelection
              ? "清空已选卡牌"
              : "尚未选牌"
        }
        disabled={!active || (!canRestartAction && !hasSelection)}
        onClick={() => (canRestartAction ? onModeChange(null) : onClear())}
      >
        <RotateCcw size={17} />
        <span>重选</span>
      </button>
      <button
        className="primary confirm"
        disabled={!active || !action || !!error || confirmationBlocked}
        onClick={onConfirm}
      >
        <Check size={17} />
        {action?.type === "camels"
          ? "收下全部骆驼"
          : mode === "sell"
            ? "确认出售"
            : mode === "exchange"
              ? "确认交换"
              : mode === "take"
                ? "确认拿取"
                : "确认交易"}
      </button>
    </section>
  );
}
