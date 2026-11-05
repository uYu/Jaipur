import type { Action, Card, Save, State } from "./types.ts";
import type { Selection } from "./selection.ts";
import { newGame } from "./engine.ts";

// An ordinary deal; neither the deck nor either player's hand is edited.
export const TUTORIAL_SEED = 66980;
export const TUTORIAL_ACTIONS: Action[] = [
  { type: "take", index: 4 },
  { type: "sell", good: "gold", count: 2 },
  { type: "sell", good: "spice", count: 3 },
  { type: "sell", good: "cloth", count: 1 },
  { type: "camels" },
  { type: "take", index: 2 },
  { type: "exchange", market: [0, 1], hand: [], camels: 2 },
  { type: "camels" },
  { type: "exchange", market: [0, 1], hand: [2, 3], camels: 0 },
  { type: "take", index: 2 },
  { type: "exchange", market: [2, 3], hand: [2], camels: 1 },
  { type: "sell", good: "spice", count: 1 },
];
export const createTutorialState = () => newGame(TUTORIAL_SEED, 1);
export const createTutorialSave = (): Save => ({
  version: 1,
  seed: TUTORIAL_SEED,
  targetSeals: 1,
  difficulty: "easy",
  events: [],
});

type GuideStep = {
  id: string;
  title: string;
  text: string;
  target: string;
  kind?: "select" | "confirm" | "opponent" | "opponent-result" | "finish";
  lesson?: number;
};
export const TUTORIAL_STEPS: GuideStep[] = [
  {
    id: "take-select",
    title: "先点集市里的这张香料",
    text: "中间这 5 张是双方共用的市场。点亮框里的香料，卡牌会高亮并出现 ✓；选牌还不算成交。",
    target: ".market-table .spice",
    kind: "select",
  },
  {
    id: "take-cancel",
    title: "再点一次，取消选中",
    text: "再点同一张香料，✓ 就会消失。也可以点亮框里的「重选」清空选择，确认前都能改。",
    target: ".market-table .spice",
    kind: "select",
  },
  {
    id: "take-reselect",
    title: "现在重新选中香料",
    text: "你手里已有 2 张香料，再拿 1 张就能凑成 3 张。请重新点这张香料。",
    target: ".market-table .spice",
    kind: "select",
  },
  {
    id: "take-confirm",
    title: "先看预览，再确认拿取",
    text: "这里应显示「拿取 1 张香料」。点「确认拿取」才会真正拿牌，市场补回一张牌，然后轮到米拉。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 0,
  },
  {
    id: "opponent-1",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel",
    kind: "opponent",
  },
  {
    id: "history-1",
    title: "先看记录：米拉卖出了黄金",
    text: "「最近行动」里米拉这一行，从左到右是行动、付出、收获：卖出 → 黄金 ×2 → 12 卢比。黄金至少 2 张起售；两枚 6 卢比筹码已被她拿走。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "sell-select",
    title: "点选你手里的 3 张香料",
    text: "下方「你的货摊」是自己的手牌，最多 7 张。逐张点亮 3 张香料，就会组成出售；这一步其他货物暂时不能选。",
    target: ".hand-cards .spice",
    kind: "select",
  },
  {
    id: "sell-confirm",
    title: "确认出售这 3 张香料",
    text: "预览显示货物收入 11 卢比；卖 3 张还会拿一枚奖励。点「确认出售」，留意筹码飞进你右侧的收入区。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 1,
  },
  {
    id: "opponent-2",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel",
    kind: "opponent",
  },
  {
    id: "history-2",
    title: "记录更新了：丝绸换到 5 卢比",
    text: "米拉最新一行是「卖出 → 丝绸 ×1 → 5 卢比」。普通货物可以单卖，3 / 4 / 5 张及以上成组出售才有批量奖励。你刚才卖香料得到了 11 + 2 = 13 卢比。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "camel-select",
    title: "点市场里的任意一头骆驼",
    text: "点 1 张会自动选中全部 3 张。收骆驼必须一次全收；它们进入独立驼队，不占 7 张手牌上限。",
    target: ".market-table .camel",
    kind: "select",
  },
  {
    id: "camel-confirm",
    title: "确认收下全部骆驼",
    text: "检查预览里是全部 3 头，再点「收下全部骆驼」。你的驼队会从 1 头变成 4 头，市场随后补牌。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 2,
  },
  {
    id: "opponent-3",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel",
    kind: "opponent",
  },
  {
    id: "history-3",
    title: "记录告诉你，她拿走了白银",
    text: "米拉一行显示「拿取 → 无付出 → 白银 ×1」。她刚拿的牌是公开信息，会保留在这里；她整手牌的内容仍然保密。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "camel-exchange-select",
    title: "选中市场里的 2 张丝绸",
    text: "想一回合拿多张货物，就用交换：至少拿 2 张，拿几张就付出几张。付款可以用手牌、骆驼，或两者混合；我们分别试一遍。",
    target: ".market-table .cloth",
    kind: "select",
  },
  {
    id: "camel-exchange-pay",
    title: "先试用 2 头骆驼付款",
    text: "用操作栏里的「+」把付出数量调到 2；「−」可以减少。数量还没配平时，确认按钮不可用。",
    target: ".camel-picker",
    kind: "select",
  },
  {
    id: "camel-exchange-confirm",
    title: "确认这笔 2 换 2",
    text: "预览应显示换入 2 张、付出 0 张货物 + 2 头骆驼。点「确认交换」，看货物和骆驼双向移动。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 3,
  },
  {
    id: "opponent-4",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel",
    kind: "opponent",
  },
  {
    id: "history-4",
    title: "你付出的骆驼，被米拉收走了",
    text: "记录里米拉收下了 2 头骆驼。交换付出的牌会留在市场，对手也能拿；骆驼不是弃掉的。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "goods-exchange-select",
    title: "再试手牌换货：选 2 张皮革",
    text: "不必用骆驼。先从亮框中的 3 张皮革里任选 2 张，再用自己的两张丝绸等量支付。",
    target: ".market-table .leather",
    kind: "select",
  },
  {
    id: "goods-exchange-pay",
    title: "点你的 2 张丝绸，作为付款",
    text: "点下方手牌里的两张丝绸。市场选的是拿进来的，手牌选的是付出去的；同一种货物不能同时拿取和付出。",
    target: ".hand-cards .cloth",
    kind: "select",
  },
  {
    id: "goods-exchange-confirm",
    title: "确认用 2 张手牌换 2 张货物",
    text: "预览应是换入 2 张、付出 2 张货物 + 0 头骆驼。点「确认交换」，两张丝绸会回到市场，两张皮革进入你的手牌。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 4,
  },
  {
    id: "opponent-5",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel",
    kind: "opponent",
  },
  {
    id: "history-5",
    title: "米拉拿了一张黄金",
    text: "先看最新记录：「拿取 → 无付出 → 黄金 ×1」。现在轮到你，下一笔亲手试试混合支付。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "mixed-exchange-select",
    title: "最后试混合支付：选 2 张丝绸",
    text: "点市场的两张丝绸。这次我们用 1 张手牌 + 1 头骆驼付款，两份支付换两张货物。",
    target: ".market-table .cloth",
    kind: "select",
  },
  {
    id: "mixed-exchange-hand",
    title: "先付出 1 张皮革",
    text: "在自己的手牌里任选 1 张皮革。这一步只选一张，另一份付款留给骆驼。",
    target: ".hand-cards .leather",
    kind: "select",
  },
  {
    id: "mixed-exchange-camel",
    title: "再加上 1 头骆驼",
    text: "点「+」把付出骆驼调到 1。现在 1 张手牌 + 1 头骆驼，与 2 张市场货物数量相同。",
    target: ".camel-picker",
    kind: "select",
  },
  {
    id: "mixed-exchange-confirm",
    title: "确认这笔混合交换",
    text: "预览应显示换入 2 张、付出 1 张货物 + 1 头骆驼。点「确认交换」。骆驼、手牌、混合支付你都亲手做过了。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 5,
  },
  {
    id: "opponent-6",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel",
    kind: "opponent",
  },
  {
    id: "history-6",
    title: "米拉卖了一张香料",
    text: "记录里这次只收到了 2 卢比。前面的高价香料筹码已经被你卖走了，所以价格会随交易变化；要在凑组奖励与抢高价之间取舍。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "end-tokens",
    title: "什么时候收市？先看这里",
    text: "「0/3 类售罄即收市」是本轮结束进度。任意三种货物的筹码全部领完，立刻收市；只售罄一类或两类还不会结束。点面板可展开每类的余量和后续价格。",
    target: ".mobile-supply > summary",
  },
  {
    id: "end-deck",
    title: "另一种收市条件：补不满市场",
    text: "这个数字是牌堆剩余张数。拿货或收骆驼后，如果牌堆已经空了，市场又补不回 5 张，本轮立刻结束；无需等三类筹码售罄。",
    target: ".market-deck",
  },
  {
    id: "end-score",
    title: "收市后，怎样算赢？",
    text: "货物收入 + 批量奖励 + 驼队奖励，合计更多者赢本轮。驼队更多者加 5 卢比，数量相同不加；留在手里的货物一分不算。同分先比奖励枚数，再比货物筹码枚数。",
    target: ".your-score",
  },
  {
    id: "end-match",
    title: "赢下一轮，才会点亮印章",
    text: "当前是「1 局定胜负」，赢本轮就赢比赛。标准赛则先赢两轮、集齐两枚印章获胜。结束时会弹出结算；完全平局会加赛。",
    target: ".hand-panel .seals",
  },
  {
    id: "finish",
    title: "准备好，正式开市",
    text: "你已练过四种行动和三种交换付款。忘记细节时，顶部「游戏规则」可以查；「行动记录」能回看完整交易。「返回菜单」可以离开，正式比赛每笔确认后的进度会自动保存。",
    target: ".game-tools",
    kind: "finish",
  },
];

export function tutorialAccepts(
  lesson: number,
  action: Action,
  market: string[],
  hand: string[] = [],
) {
  if (lesson === 0)
    return action.type === "take" && market[action.index] === "spice";
  if (lesson === 1)
    return (
      action.type === "sell" && action.good === "spice" && action.count === 3
    );
  if (lesson === 2) return action.type === "camels";
  if (action.type !== "exchange" || action.market.length !== 2) return false;
  const takes = (good: string) =>
    action.market.every((i) => market[i] === good);
  if (lesson === 3)
    return takes("cloth") && action.hand.length === 0 && action.camels === 2;
  if (lesson === 4)
    return (
      takes("leather") &&
      action.hand.length === 2 &&
      action.hand.every((i) => hand[i] === "cloth") &&
      action.camels === 0
    );
  if (lesson === 5)
    return (
      takes("cloth") &&
      action.hand.length === 1 &&
      hand[action.hand[0]] === "leather" &&
      action.camels === 1
    );
  return false;
}

function group(step: number) {
  const id = TUTORIAL_STEPS[step].id;
  if (id.startsWith("take-")) return "take";
  if (id.startsWith("sell-")) return "sell";
  if (id.startsWith("camel-exchange-")) return "camels-exchange";
  if (id.startsWith("camel-")) return "camels";
  if (id.startsWith("goods-exchange-")) return "goods-exchange";
  if (id.startsWith("mixed-exchange-")) return "mixed-exchange";
  return "read";
}
export function tutorialAllowsMarket(step: number, good: Card) {
  const g = group(step);
  return g === "take"
    ? good === "spice"
    : g === "camels"
      ? good === "camel"
      : g === "goods-exchange"
        ? good === "leather"
        : (g === "camels-exchange" || g === "mixed-exchange") &&
          good === "cloth";
}
export function tutorialAllowsHand(step: number, good: Card) {
  const g = group(step);
  return g === "sell"
    ? good === "spice"
    : g === "goods-exchange"
      ? good === "cloth"
      : g === "mixed-exchange" && good === "leather";
}
export function normalizeTutorialSelection(
  step: number,
  selection: Selection,
  state: State,
): Selection {
  const g = group(step);
  return {
    market: selection.market.filter((i) =>
      tutorialAllowsMarket(step, state.market[i]),
    ),
    hand: selection.hand.filter((i) =>
      tutorialAllowsHand(step, state.players[0].hand[i]),
    ),
    camels:
      g === "camels-exchange" || g === "mixed-exchange" ? selection.camels : 0,
  };
}
export function tutorialSelectionReady(
  step: number,
  selection: Selection,
  state: State,
) {
  const id = TUTORIAL_STEPS[step].id;
  const { market, hand, camels } = selection;
  const m = (good: string, count: number) =>
    market.length === count && market.every((i) => state.market[i] === good);
  const h = (good: string, count: number) =>
    hand.length === count &&
    hand.every((i) => state.players[0].hand[i] === good);
  if (id === "take-select" || id === "take-reselect")
    return m("spice", 1) && !hand.length && !camels;
  if (id === "take-cancel") return !market.length && !hand.length && !camels;
  if (id === "sell-select") return !market.length && h("spice", 3) && !camels;
  if (id === "camel-select") return m("camel", 3) && !hand.length && !camels;
  if (id === "camel-exchange-select")
    return m("cloth", 2) && !hand.length && !camels;
  if (id === "camel-exchange-pay")
    return m("cloth", 2) && !hand.length && camels === 2;
  if (id === "goods-exchange-select")
    return m("leather", 2) && !hand.length && !camels;
  if (id === "goods-exchange-pay")
    return m("leather", 2) && h("cloth", 2) && !camels;
  if (id === "mixed-exchange-select")
    return m("cloth", 2) && !hand.length && !camels;
  if (id === "mixed-exchange-hand")
    return m("cloth", 2) && h("leather", 1) && !camels;
  if (id === "mixed-exchange-camel")
    return m("cloth", 2) && h("leather", 1) && camels === 1;
  return false;
}
export function tutorialStepAfterSelection(
  step: number,
  selection: Selection,
  state: State,
) {
  if (tutorialSelectionReady(step, selection, state)) return step + 1;
  const id = TUTORIAL_STEPS[step].id;
  const go = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);
  const g = group(step);
  if (id === "take-confirm" && !selection.market.length)
    return go("take-reselect");
  if (id === "sell-confirm" && selection.hand.length !== 3)
    return go("sell-select");
  if (id === "camel-confirm" && !selection.market.length)
    return go("camel-select");
  if (g === "camels-exchange") {
    if (id !== "camel-exchange-select" && selection.market.length !== 2)
      return go("camel-exchange-select");
    if (id === "camel-exchange-confirm" && selection.camels !== 2)
      return go("camel-exchange-pay");
  }
  if (g === "goods-exchange") {
    if (id !== "goods-exchange-select" && selection.market.length !== 2)
      return go("goods-exchange-select");
    if (id === "goods-exchange-confirm" && selection.hand.length !== 2)
      return go("goods-exchange-pay");
  }
  if (g === "mixed-exchange") {
    if (id !== "mixed-exchange-select" && selection.market.length !== 2)
      return go("mixed-exchange-select");
    if (
      (id === "mixed-exchange-camel" || id === "mixed-exchange-confirm") &&
      selection.hand.length !== 1
    )
      return go("mixed-exchange-hand");
    if (id === "mixed-exchange-confirm" && selection.camels !== 1)
      return go("mixed-exchange-camel");
  }
  return step;
}
export function tutorialFeedback(step: number, selection: Selection) {
  const id = TUTORIAL_STEPS[step].id;
  if (id === "sell-select") return `香料已选 ${selection.hand.length} / 3 张`;
  if (id === "goods-exchange-select")
    return `皮革已选 ${selection.market.length} / 2 张`;
  if (id === "goods-exchange-pay")
    return `付出丝绸 ${selection.hand.length} / 2 张`;
  if (id === "camel-exchange-select" || id === "mixed-exchange-select")
    return `丝绸已选 ${selection.market.length} / 2 张`;
  if (id === "camel-exchange-pay") return `付出骆驼 ${selection.camels} / 2 头`;
  if (id === "mixed-exchange-hand")
    return `付出皮革 ${selection.hand.length} / 1 张`;
  if (id === "mixed-exchange-camel")
    return `付出骆驼 ${selection.camels} / 1 头`;
  return "";
}
