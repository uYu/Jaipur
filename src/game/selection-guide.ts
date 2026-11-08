import { BONUS_VALUES, LABEL, sum } from "./data.ts";
import type { State } from "./types.ts";
import { selectedAction } from "./selection.ts";
import type { Selection } from "./selection.ts";

export const ACTION_INSTRUCTIONS = [
  { intent: "take", label: "拿货", text: "拿1张市场货物，或收全部骆驼" },
  { intent: "sell", label: "卖货", text: "卖同类手牌得分，3张起有奖励" },
  {
    intent: "exchange",
    label: "交换",
    text: "选至少2张市场货物，等量手牌或骆驼换",
  },
] as const;

/** Incomplete choices are instructions; the engine still decides legality. */
export function selectionGuide(state: State, selection: Selection) {
  const result = selectedAction(state, selection);
  const { action, error } = result;
  const { market, hand, camels } = selection;
  const hasSelection = market.length + hand.length + camels > 0;
  let title = `${ACTION_INSTRUCTIONS[0].label}：${ACTION_INSTRUCTIONS[0].text}`;
  let hint = ACTION_INSTRUCTIONS.slice(1)
    .map(({ label, text }) => `${label}：${text}`)
    .join("\n");
  let problem = false;
  let bonusPreview: { tier: 3 | 4 | 5; min: number; max: number } | null = null;
  const intent = action?.type ?? (hasSelection ? "exchange" : "idle");

  if (!action && hasSelection) {
    title = `已选 ${hand.length} 张手牌`;
    hint = "继续选市场货物来交换；出售需同类。";
  } else if (action?.type === "exchange") {
    title = `换入 ${market.length} 张 · 付出 ${hand.length} 张 + ${camels} 驼`;
    const payment = hand.length + camels;
    if (market.length < 2)
      hint = `再选 ${Math.max(2, payment) - market.length} 张市场货物，交换至少拿 2 张。`;
    else if (payment < market.length)
      hint = `再选 ${market.length - payment} 张手牌或骆驼付款。`;
    else if (payment > market.length)
      hint = `再选 ${payment - market.length} 张市场货物，或减少付款。`;
    else if (error) {
      hint = error;
      problem = true;
    } else hint = "数量已配平，确认后交换；点牌可取消。";
  } else if (action?.type === "sell") {
    const value = sum(state.tokens[action.good].slice(0, action.count));
    const tier = Math.min(action.count, 5) as 3 | 4 | 5;
    const bonus = action.count >= 3 && state.bonus[tier].length > 0;
    title = `出售 ${action.count} 张${LABEL[action.good]} · ${value} 卢比`;
    if (bonus && !error) {
      bonusPreview = {
        tier,
        min: Math.min(...BONUS_VALUES[tier]),
        max: Math.max(...BONUS_VALUES[tier]),
      };
    }
    if (error && action.count < 2) {
      hint = `至少再选 1 张${LABEL[action.good]}，可一次出售 2 张或更多。`;
    } else if (error) {
      hint = error;
      problem = true;
    } else hint = "可加选同类凑奖励；选市场牌可交换。";
  } else if (action?.type === "take") {
    title = `拿取 1 张${LABEL[state.market[action.index]]}`;
    hint = "再选一张市场货物，就能用手牌或骆驼交换。";
    if (error) {
      hint = error;
      problem = true;
    }
  } else if (action?.type === "camels") {
    title = `收下市场全部 ${market.length} 头骆驼`;
    hint = "进入驼队，不占手牌；确认后收下。";
  }
  return {
    ...result,
    title,
    hint,
    problem,
    intent,
    hasSelection,
    bonusPreview,
  };
}
