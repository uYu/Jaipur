import { GOODS } from "./types.ts";
import type { Action, Card, Good, Player, State } from "./types.ts";
import {
  BONUS_VALUES,
  LABEL,
  TOKEN_VALUES,
  makeDeck,
  precious,
  random,
  shuffle,
  sum,
} from "./data.ts";
const emptyPlayer = (): Player => ({
  hand: [],
  camels: 0,
  goods: [],
  bonuses: [],
});
export function newGame(seed: number): State {
  const [r, rng] = random(seed >>> 0);
  return deal({
    seed: seed >>> 0,
    rng,
    round: 0,
    turn: 0,
    current: 0,
    starter: Math.floor(r * 2),
    players: [emptyPlayer(), emptyPlayer()],
    deck: [],
    market: [],
    discard: [],
    tokens: structuredClone(TOKEN_VALUES),
    bonus: structuredClone(BONUS_VALUES),
    seals: [0, 0],
    results: [],
    phase: "playing",
    log: [],
  });
}
function deal(s: State): State {
  const deck = makeDeck();
  for (let i = 0; i < 3; i++) deck.splice(deck.indexOf("camel"), 1);
  [s.deck, s.rng] = shuffle(deck, s.rng);
  s.players = [emptyPlayer(), emptyPlayer()];
  for (const p of s.players)
    for (let i = 0; i < 5; i++) {
      const c = s.deck.pop()!;
      if (c === "camel") p.camels++;
      else p.hand.push(c);
    }
  s.market = ["camel", "camel", "camel", s.deck.pop()!, s.deck.pop()!];
  s.tokens = structuredClone(TOKEN_VALUES);
  s.bonus = structuredClone(BONUS_VALUES);
  for (const n of [3, 4, 5] as const)
    [s.bonus[n], s.rng] = shuffle(s.bonus[n], s.rng);
  s.discard = [];
  s.round++;
  s.turn = 0;
  s.current = s.starter;
  s.phase = "playing";
  s.log.push(`第 ${s.round} 轮开市 · ${s.current === 0 ? "你" : "米拉"}先手`);
  return s;
}
export function nextRound(state: State): State {
  if (state.phase !== "roundEnd") throw new Error("当前不能开始下一轮");
  const s = structuredClone(state);
  const winner = s.results.at(-1)!.winner;
  s.starter = winner === null ? 1 - s.starter : 1 - winner;
  return deal(s);
}
const validIndices = (a: number[], length: number) =>
  Array.isArray(a) &&
  new Set(a).size === a.length &&
  a.every((i) => Number.isInteger(i) && i >= 0 && i < length);
export function actionError(s: State, a: Action): string | null {
  if (s.phase !== "playing") return "本轮已结束";
  const p = s.players[s.current];
  if (a.type === "take") {
    if (
      !Number.isInteger(a.index) ||
      !s.market[a.index] ||
      s.market[a.index] === "camel"
    )
      return "请选择一张市场货物";
    if (p.hand.length >= 7) return "手牌已达 7 张，请先出售或交换";
  } else if (a.type === "camels") {
    if (!s.market.includes("camel")) return "市场里暂时没有骆驼";
  } else if (a.type === "sell") {
    if (
      !GOODS.includes(a.good) ||
      !Number.isInteger(a.count) ||
      a.count < (precious(a.good) ? 2 : 1)
    )
      return "钻石、黄金和白银每次至少出售 2 张";
    if (p.hand.filter((g) => g === a.good).length < a.count)
      return "所选货物不足";
  } else if (a.type === "exchange") {
    if (
      !validIndices(a.market, s.market.length) ||
      !validIndices(a.hand, p.hand.length) ||
      !Number.isInteger(a.camels) ||
      a.camels < 0 ||
      a.camels > p.camels
    )
      return "交换选择无效";
    if (a.market.length < 2) return "交换至少要拿取 2 张货物";
    if (a.market.length !== a.hand.length + a.camels)
      return "拿取和付出的卡牌数量必须相同";
    if (a.market.some((i) => s.market[i] === "camel"))
      return "交换不能拿取骆驼";
    if (a.hand.some((i) => a.market.some((j) => s.market[j] === p.hand[i])))
      return "同一种货物不能同时拿取和付出";
    if (p.hand.length - a.hand.length + a.market.length > 7)
      return "交换后手牌不能超过 7 张";
  } else return "未知行动";
  return null;
}
function finish(s: State, reason: string) {
  const [a, b] = s.players;
  const camel = a.camels === b.camels ? null : a.camels > b.camels ? 0 : 1;
  const scores = s.players.map(
    (p, i) => sum(p.goods) + sum(p.bonuses) + (camel === i ? 5 : 0),
  ) as [number, number];
  const differences = [
    scores[0] - scores[1],
    a.bonuses.length - b.bonuses.length,
    a.goods.length - b.goods.length,
  ];
  const d = differences.find((n) => n !== 0) ?? 0;
  const winner = d === 0 ? null : d > 0 ? 0 : 1;
  if (winner !== null) s.seals[winner]++;
  s.results.push({
    round: s.round,
    scores,
    goods: [sum(a.goods), sum(b.goods)],
    bonuses: [sum(a.bonuses), sum(b.bonuses)],
    camel,
    winner,
    reason,
  });
  s.phase = s.seals.some((n) => n >= 2) ? "finished" : "roundEnd";
  s.log.push(
    `本轮结算 · 你 ${scores[0]} : ${scores[1]} 米拉${winner === null ? " · 平局" : ` · ${winner === 0 ? "你" : "米拉"}获得卓越印章`}`,
  );
}
export function applyAction(state: State, action: Action): State {
  const error = actionError(state, action);
  if (error) throw new Error(error);
  const s = structuredClone(state),
    p = s.players[s.current],
    who = s.current === 0 ? "你" : "米拉";
  let refill = false;
  if (action.type === "take") {
    const [c] = s.market.splice(action.index, 1);
    p.hand.push(c as Good);
    s.log.push(`${who}拿取了 1 张${LABEL[c]}`);
    refill = true;
  }
  if (action.type === "camels") {
    const n = s.market.filter((c) => c === "camel").length;
    p.camels += n;
    s.market = s.market.filter((c) => c !== "camel");
    s.log.push(`${who}收下了 ${n} 头骆驼`);
    refill = true;
  }
  if (action.type === "exchange") {
    const take = action.market.map((i) => s.market[i] as Good),
      give = action.hand.map((i) => p.hand[i]);
    p.hand = p.hand.filter((_, i) => !action.hand.includes(i)).concat(take);
    p.camels -= action.camels;
    s.market = s.market
      .filter((_, i) => !action.market.includes(i))
      .concat(give, ...Array<Card>(action.camels).fill("camel"));
    const describe = (cards: Card[]) =>
      [...new Set(cards)]
        .map((g) => `${cards.filter((c) => c === g).length} ${LABEL[g]}`)
        .join("、");
    s.log.push(
      `${who}用 ${describe([...give, ...Array<Card>(action.camels).fill("camel")])} 换取 ${describe(take)}`,
    );
  }
  if (action.type === "sell") {
    for (let i = 0; i < action.count; i++)
      p.hand.splice(p.hand.indexOf(action.good), 1);
    s.discard.push(...Array<Good>(action.count).fill(action.good));
    const tokens = s.tokens[action.good].splice(0, action.count);
    p.goods.push(...tokens);
    const tier = Math.min(5, action.count) as 3 | 4 | 5;
    const bonus = action.count >= 3 ? s.bonus[tier].pop() : undefined;
    if (bonus !== undefined) p.bonuses.push(bonus);
    s.log.push(
      `${who}出售 ${action.count} 张${LABEL[action.good]} · 货物 ${sum(tokens)} 卢比${bonus !== undefined ? " + 1 枚奖励筹码" : ""}`,
    );
  }
  if (refill)
    while (s.market.length < 5 && s.deck.length) s.market.push(s.deck.pop()!);
  s.turn++;
  if (GOODS.filter((g) => !s.tokens[g].length).length >= 3)
    finish(s, "三类货物筹码售罄");
  else if (s.market.length < 5) finish(s, "牌堆已无法补满市场");
  else s.current = 1 - s.current;
  return s;
}
export function legalActions(
  s: Pick<State, "phase" | "market" | "players" | "current">,
): Action[] {
  if (s.phase !== "playing") return [];
  const p = s.players[s.current],
    out: Action[] = [];
  s.market.forEach((c, index) => {
    if (c !== "camel" && p.hand.length < 7) out.push({ type: "take", index });
  });
  if (s.market.includes("camel")) out.push({ type: "camels" });
  for (const good of GOODS)
    for (
      let count = precious(good) ? 2 : 1;
      count <= p.hand.filter((g) => g === good).length;
      count++
    )
      out.push({ type: "sell", good, count });
  const seen = new Set<string>();
  for (let m = 1; m < 1 << s.market.length; m++) {
    const market = s.market.flatMap((_, i) => (m & (1 << i) ? [i] : []));
    if (market.length < 2 || market.some((i) => s.market[i] === "camel"))
      continue;
    for (let h = 0; h < 1 << p.hand.length; h++) {
      const hand = p.hand.flatMap((_, i) => (h & (1 << i) ? [i] : [])),
        camels = market.length - hand.length;
      if (
        camels < 0 ||
        camels > p.camels ||
        p.hand.length + camels > 7 ||
        hand.some((i) => market.some((j) => s.market[j] === p.hand[i]))
      )
        continue;
      const key = JSON.stringify([
        market.map((i) => s.market[i]).sort(),
        hand.map((i) => p.hand[i]).sort(),
        camels,
      ]);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ type: "exchange", market, hand, camels });
      }
    }
  }
  return out;
}
