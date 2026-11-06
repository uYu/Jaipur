import type { Action, Card, Save, State } from "./types.ts";
import type { ActionMode, Selection } from "./selection.ts";
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
  kind?:
    "mode" | "select" | "confirm" | "opponent" | "opponent-result" | "finish";
  mode?: ActionMode;
  lesson?: number;
  tradeoff?: string;
};
export const TUTORIAL_STEPS: GuideStep[] = [
  {
    id: "take-mode",
    title: "先选「拿取」",
    text: "每手先决定做什么，再选牌。这次想从市场拿一张货物：点击「拿取」，再点「下一步」。选择行动还不会成交。",
    target: ".action-mode-take",
    kind: "mode",
    mode: "take",
  },
  {
    id: "take-select",
    title: "先点集市里的这张香料",
    text: "中间这 5 张是双方共用的市场。点击亮起的香料，卡牌会高亮并出现 ✓；选牌还不算成交。教程会为练规则安排一些交易，遇到实战需要权衡的地方会提醒你。",
    target: ".market-table .spice",
    kind: "select",
  },
  {
    id: "take-cancel",
    title: "再点一次，取消选中",
    text: "再点同一张香料，✓ 就会消失。也可以点击亮起的「重选」清空选择，确认前都能改。",
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
    target: ".opponent-panel, .player-seat.seat-opponent",
    kind: "opponent",
  },
  {
    id: "history-1",
    title: "先看记录：米拉卖出了黄金",
    text: "上次行动用图标显示双方的行动、付出与收获。米拉这一行是「卖出 → 黄金 ×2 → 12 卢比」。每笔货物收入可见，但对手累计分和奖励面值不会直接展示，收市才揭晓总分。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "sell-mode",
    title: "现在选「出售」",
    text: "米拉行动完了，轮到你把手里的货物换成筹码。点击「出售」，再点「下一步」选牌。",
    target: ".action-mode-sell",
    kind: "mode",
    mode: "sell",
  },
  {
    id: "sell-select",
    title: "凑满 3 张香料，多拿一枚奖励",
    text: "现在轮到你。逐张点选「你的货摊」里的 3 张香料：只卖 1 或 2 张没有批量奖励，一次卖同种货物至少 3 张才有。这一步其他货物暂时不能选。",
    target: ".hand-cards .spice",
    kind: "select",
  },
  {
    id: "sell-confirm",
    title: "确认出售这 3 张香料",
    text: "这笔有两份收入：货物筹码 11 卢比，另加一枚 3 张奖励（1–3 卢比，成交后揭晓）。点「确认出售」，留意你的收入增加、手牌减少。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 1,
  },
  {
    id: "opponent-2",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel, .player-seat.seat-opponent",
    kind: "opponent",
  },
  {
    id: "history-2",
    title: "记录更新了：丝绸换到 5 卢比",
    text: "米拉本手卖出丝绸 ×1，拿到 5 卢比、货物筹码多了 1 枚。她没有批量奖励，却先抢走了最高价的丝绸筹码：单卖也可能值得。接下来看看你刚才成组出售多赚了多少。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "bulk-bonus",
    title: "你多赚了 2 卢比！",
    text: "你的收入已变成 13 卢比：11 来自香料，2 来自刚领到的批量奖励。是同一种货物在一次交易里卖够张数，才有这份额外收入；分几次累计不算。",
    target: ".your-score, .mobile-player-scores .score-you",
  },
  {
    id: "camel-mode",
    title: "收骆驼，也先选「拿取」",
    text: "拿货物和收骆驼都从「拿取」开始。点击「拿取」，再点「下一步」；接下来会一次收下市场里的全部骆驼。",
    target: ".action-mode-take",
    kind: "mode",
    mode: "take",
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
    tradeoff:
      "收骆驼会翻出新货，但接下来是米拉先挑。你扩充了驼队，也让出了挑新货的先机；实战要考虑会不会替对手补出好牌。",
  },
  {
    id: "opponent-3",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel, .player-seat.seat-opponent",
    kind: "opponent",
  },
  {
    id: "history-3",
    title: "记录告诉你，她拿走了白银",
    text: "米拉这一行显示「拿取 → 无付出 → 白银 ×1」。你收骆驼后翻出的白银被她先拿走了，这是补货让先手的代价。她的整手牌仍保密。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "camel-exchange-mode",
    title: "想拿多张，先选「交换」",
    text: "交换可以同时拿进多张货物，再用手牌或骆驼等量付出。点击「交换」，再点「下一步」，先练用骆驼付款。",
    target: ".action-mode-exchange",
    kind: "mode",
    mode: "exchange",
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
    text: "预览应显示换入 2 张、付出 0 张货物 + 2 头骆驼。点「确认交换」，留意哪些牌换入、哪些牌付出。",
    target: ".action-panel",
    kind: "confirm",
    lesson: 3,
    tradeoff:
      "这步练骆驼付款，但你会从 4 头降到 2 头。米拉若收走这 2 头，就会以 3 比 2 反超，可能抢走收市时的 5 卢比驼队奖励。",
  },
  {
    id: "opponent-4",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel, .player-seat.seat-opponent",
    kind: "opponent",
  },
  {
    id: "history-4",
    title: "你付出的骆驼，被米拉收走了",
    text: "记录里米拉收下了你付出的 2 头骆驼。现在她有 3 头、你有 2 头，驼队优势已经反转。交换付出的牌会留在市场，对手也能拿；实战别只看换进了什么。",
    target: ".action-ledger",
    kind: "opponent-result",
  },
  {
    id: "goods-exchange-mode",
    title: "再选「交换」，试试手牌付款",
    text: "这次用自己的货物换市场货物。点击「交换」，再点「下一步」；选中的手牌会作为付款，不会出售。",
    target: ".action-mode-exchange",
    kind: "mode",
    mode: "exchange",
  },
  {
    id: "goods-exchange-select",
    title: "再试手牌换货：选 2 张皮革",
    text: "不必用骆驼。先从亮起的 3 张皮革里任选 2 张，再用自己的两张丝绸等量支付。",
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
    tradeoff:
      "这笔主要练手牌付款，并不是见到皮革就该换。按当前筹码，两张丝绸可卖 6、两张皮革可卖 7，但交换本身不加分，还要花一回合出售，并把丝绸留给对手取用。",
  },
  {
    id: "opponent-5",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel, .player-seat.seat-opponent",
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
    id: "mixed-exchange-mode",
    title: "最后选「交换」，混合付款",
    text: "一笔交换也能同时用手牌和骆驼付款。点击「交换」，再点「下一步」，亲手试一次。",
    target: ".action-mode-exchange",
    kind: "mode",
    mode: "exchange",
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
    tradeoff:
      "为演示混合付款，我们又换回上一笔送出的丝绸，还要再花一头骆驼。实战反复倒货会耗掉回合和资源，应围绕凑组或抢高价来换，别照搬这段操作。",
  },
  {
    id: "opponent-6",
    title: "米拉正在行动",
    text: "",
    target: ".opponent-panel, .player-seat.seat-opponent",
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
    text: "「0/3 类售罄即收市」是本轮结束进度。任意三种货物的筹码全部领完，立刻收市；只售罄一类或两类还不会结束。点筹码面板可查看每类的余量和后续价格。",
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
    target: ".your-score, .mobile-player-scores .score-you",
  },
  {
    id: "end-match",
    title: "赢下一轮，才会点亮印章",
    text: "当前是「1 局定胜负」，赢本轮就赢比赛。标准赛则先赢两轮、集齐两枚印章获胜。结束时会弹出结算；完全平局会加赛。",
    target:
      ".hand-panel .seals, .mobile-player-scores .score-you .score-card-seals",
  },
  {
    id: "finish",
    title: "准备好，正式开市",
    text: "你已练过四种行动和三种交换付款。忘记细节时，打开顶部菜单可查看「游戏规则」或「行动记录」，也可以返回主菜单。正式比赛每笔确认后的进度会自动保存。",
    target: ".game-tools, .mobile-game-menu > summary",
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
  if (TUTORIAL_STEPS[step].kind === "mode") return step;
  // Finishing an input enables Next; it never advances the guide by itself.
  if (tutorialSelectionReady(step, selection, state)) return step;
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

export function tutorialStepAfterNext(
  step: number,
  selection: Selection,
  state: State,
  mode?: ActionMode | null,
) {
  const guide = TUTORIAL_STEPS[step];
  if (guide.kind === "mode") return mode === guide.mode ? step + 1 : step;
  if (guide.kind === "select")
    return tutorialSelectionReady(step, selection, state) ? step + 1 : step;
  if (!guide.kind || guide.kind === "opponent-result") return step + 1;
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
