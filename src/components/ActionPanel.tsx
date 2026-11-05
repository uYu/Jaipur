import { Check, RotateCcw } from "lucide-react";
import { LABEL, sum } from "../game/data.ts";
import { selectCamels, selectedAction } from "../game/selection.ts";
import type { Selection } from "../game/selection.ts";
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
}: {
  state: State;
  selection: Selection;
  active: boolean;
  onSelectionChange: (selection: Selection) => void;
  onClear: () => void;
  onConfirm: () => void;
  hint?: string;
  confirmationBlocked?: boolean;
}) {
  const { market, hand, camels } = selection;
  const { action, error } = active
    ? selectedAction(state, selection)
    : { action: null, error: "" };
  const player = state.players[0];
  const soldValue =
    action?.type === "sell"
      ? sum(state.tokens[action.good].slice(0, action.count))
      : 0;
  return (
    <section className="action-panel" aria-label="交易操作栏">
      <div
        className={`action-description ${error ? "has-error" : ""}`}
        aria-live="polite"
      >
        <b>
          {action?.type === "camels"
            ? `收下市场全部 ${market.length} 头骆驼`
            : action?.type === "exchange"
              ? `换入 ${market.length} 张 · 付出 ${hand.length} 张货物 + ${camels} 头骆驼`
              : action?.type === "sell"
                ? `出售 ${hand.length} 张${LABEL[action.good]}`
                : action?.type === "take"
                  ? `拿取 1 张${LABEL[state.market[action.index]]}`
                  : "直接点选卡牌，决定这笔生意"}
        </b>
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
                    ? "继续点选市场与手牌可组成交换；再次点击取消"
                    : "点市场拿取，点手牌出售；两边选牌进行交换，下方加减选择付出骆驼")}
        </span>
      </div>
      <div
        className="camel-picker"
        role="group"
        aria-label={`付出骆驼，共 ${player.camels} 头`}
      >
        <span className="camel-picker-label">骆驼</span>
        <button
          aria-label="减少付出骆驼"
          disabled={!active || !camels}
          onClick={() =>
            onSelectionChange(selectCamels(state, selection, camels - 1))
          }
        >
          −
        </button>
        <output aria-label="已选付出骆驼数量" aria-live="polite">
          {camels}
        </output>
        <button
          aria-label="增加付出骆驼"
          disabled={!active || camels >= player.camels}
          onClick={() =>
            onSelectionChange(selectCamels(state, selection, camels + 1))
          }
        >
          +
        </button>
      </div>
      <button
        className="clear-button"
        aria-label="清空选择"
        title="清空选择"
        disabled={!active}
        onClick={onClear}
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
          : action?.type === "sell"
            ? "确认出售"
            : action?.type === "exchange"
              ? "确认交换"
              : action?.type === "take"
                ? "确认拿取"
                : "确认交易"}
      </button>
    </section>
  );
}
