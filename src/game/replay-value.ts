import { observe } from "./ai.ts";
import { LABEL } from "./data.ts";
import { dmcAction, dmcActions, dmcState } from "./dmc.ts";
import { dmcHistory } from "./dmc-history.ts";
import type { DmcPublicMove } from "./dmc-history.ts";
import type { DouzeroNetwork } from "./douzero-network.ts";
import { newGame } from "./engine.ts";
import { advance, replay } from "./storage.ts";
import type { Action, Card, Save, State } from "./types.ts";

export type ReplayMove = { type: Action["type"]; give: Card[]; take: Card[] };
export type ReplayDecision = {
  chosenMove: ReplayMove;
  recommendedMove: ReplayMove;
  chosen: string;
  recommended: string;
  actualValue: number;
  bestValue: number;
  loss: number;
};
export type ReplayValuePoint = {
  index: number;
  round: number;
  value: number | null;
  label: string;
  actor: number | null;
  move?: ReplayMove;
  decision?: ReplayDecision;
};

function actionLabel(state: State, action: Action): string {
  const goods = (cards: string[]) =>
    [...new Set(cards)]
      .map(
        (g) =>
          `${LABEL[g as keyof typeof LABEL]}×${cards.filter((c) => c === g).length}`,
      )
      .join("、");
  if (action.type === "take") return `拿取${LABEL[state.market[action.index]]}`;
  if (action.type === "sell")
    return `卖出${LABEL[action.good]}×${action.count}`;
  if (action.type === "camels") return "收取骆驼";
  return `交换${goods([...action.hand.map((i) => state.players[state.current].hand[i]), ...Array<string>(action.camels).fill("camel")])} → ${goods(action.market.map((i) => state.market[i]))}`;
}

function reviewMove(state: State, action: Action): ReplayMove {
  if (action.type === "exchange")
    return {
      type: action.type,
      give: [
        ...action.hand.map((i) => state.players[state.current].hand[i]),
        ...Array<Card>(action.camels).fill("camel"),
      ],
      take: action.market.map((i) => state.market[i]),
    };
  if (action.type === "sell")
    return {
      type: action.type,
      give: Array<Card>(action.count).fill(action.good),
      take: [],
    };
  return {
    type: action.type,
    give: [],
    take:
      action.type === "take"
        ? [state.market[action.index]]
        : state.market.filter((g) => g === "camel"),
  };
}

/** Q(s,a) is a single-round return for the acting player. Only score player 0's
 * decisions, using their contemporary public observation. After their action,
 * carry its Q until the opponent responds; never substitute the opponent's Q
 * or inspect the opponent's private hand. Terminal points use the round result.
 */
export function* replayValuePoints(
  save: Save,
  model: Pick<DouzeroNetwork, "score">,
): Generator<ReplayValuePoint> {
  if (replay(save).phase !== "finished")
    throw Error("比赛结束后才能分析价值曲线");
  let state = newGame(save.seed, save.targetSeals ?? 2);
  let moves: DmcPublicMove[] = [];
  let carriedValue: number | null = null;
  let decision: ReplayDecision | undefined;
  let label = "开市";
  let actor: number | null = null;
  let move: ReplayMove | undefined;
  for (let index = 0; index <= save.events.length; index++) {
    let value: number | null = carriedValue;
    let nextDecision: ReplayDecision | undefined;
    const event = save.events[index];
    if (state.phase !== "playing") {
      const winner = state.results.at(-1)!.winner;
      value = winner === null ? 0 : winner === 0 ? 1 : -1;
    } else if (state.current === 0) {
      const observation = observe(state, save.events.slice(0, index), 0.75);
      const actions = dmcActions(observation);
      const encoded = actions.map((a) => dmcAction(observation, a));
      const scores = model.score(
        dmcHistory(moves, 0),
        dmcState(observation, { ownSeals: 0, opponentSeals: 0, round: 0 }),
        encoded,
      );
      if (scores.length !== actions.length || !scores.every(Number.isFinite))
        throw Error("模型未返回有效评分");
      let best = 0;
      for (let i = 1; i < scores.length; i++)
        if (scores[i] > scores[best]) best = i;
      value = scores[best];
      if (event && event.type !== "next") {
        const chosen = dmcAction(observation, event);
        const at = encoded.findIndex((row) =>
          row.every((x, i) => x === chosen[i]),
        );
        if (at < 0) throw Error("回放行动与模型合法行动不匹配");
        nextDecision = {
          chosenMove: reviewMove(state, event),
          recommendedMove: reviewMove(state, actions[best]),
          chosen: actionLabel(state, event),
          recommended: actionLabel(state, actions[best]),
          actualValue: scores[at],
          bestValue: scores[best],
          loss: Math.max(0, scores[best] - scores[at]),
        };
      }
    }
    yield { index, round: state.round, value, label, actor, move, decision };
    if (!event) break;
    const before = state;
    state = advance(state, event);
    decision = nextDecision;
    if (event.type === "next") {
      actor = null;
      move = undefined;
      moves = [];
      carriedValue = null;
      label = `第 ${state.round} 轮开市`;
    } else {
      actor = before.current;
      move = reviewMove(before, event);
      moves.push({
        actor: before.current,
        action: dmcAction(observe(before), event),
      });
      carriedValue = nextDecision?.actualValue ?? value;
      label = `${before.current === 0 ? "你" : "米拉"} · ${actionLabel(before, event)}`;
    }
  }
}
