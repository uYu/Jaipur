import { useEffect, useRef } from "react";
import {
  Trophy,
  X,
  ArrowRight,
  Coins,
  Award,
  Sigma,
  Layers,
  Hand,
  Home,
  Eye,
} from "lucide-react";
import type { State } from "../game/types.ts";
import { actionCaption, type Presentation } from "../game/presentation.ts";
import { GoodsArt } from "./Art.tsx";

function ScoreSymbol({
  kind,
}: {
  kind: "goods" | "bonus" | "camel" | "total";
}) {
  return (
    <span className={`result-symbol result-symbol-${kind}`} aria-hidden="true">
      {kind === "camel" ? (
        <GoodsArt good="camel" cardFace />
      ) : kind === "goods" ? (
        <Coins />
      ) : kind === "bonus" ? (
        <Award />
      ) : (
        <Sigma />
      )}
    </span>
  );
}

function TokenEquation({
  values,
  total,
  bonus = false,
}: {
  values: number[];
  total: number;
  bonus?: boolean;
}) {
  const counts = new Map<number, number>();
  values.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  const groups = [...counts].sort(([a], [b]) => b - a);
  return (
    <div
      className="result-token-row"
      aria-label={`${bonus ? "奖励" : "货物"}筹码 ${values.length} 枚，合计 ${total} 卢比`}
    >
      <ScoreSymbol kind={bonus ? "bonus" : "goods"} />
      <div className="result-token-equation">
        {groups.length ? (
          groups.map(([value, count], index) => (
            <span className="result-token-term" key={value}>
              {index > 0 && (
                <span className="result-token-plus" aria-hidden="true">
                  ＋
                </span>
              )}
              <span
                className="result-token-factor"
                title={`${value} 卢比 × ${count} 枚`}
                aria-label={`面值 ${value} 卢比，共 ${count} 枚`}
              >
                <span
                  className={`result-token${bonus ? " result-token-bonus" : ""}`}
                >
                  {value}
                </span>
                <span>×{count}</span>
              </span>
            </span>
          ))
        ) : (
          <span className="result-token-empty" title="没有获得此类筹码">
            —
          </span>
        )}
        <span className="result-token-sum">
          ＝ <b>{total}</b>
        </span>
      </div>
    </div>
  );
}
export function resultTitle(state: State) {
  if (state.phase === "finished")
    return state.seals[0] >= (state.targetSeals ?? 2)
      ? "你赢得了整场比赛！"
      : "米拉赢得了整场比赛";
  const winner = state.results.at(-1)?.winner;
  return winner === null
    ? "本轮平局"
    : winner === 0
      ? "你赢得了这一轮！"
      : "米拉赢得了这一轮";
}
export function ResultDialog({
  state,
  onClose,
  onNext,
  onNew,
  onMenu,
  lastAction,
}: {
  state: State;
  onClose: () => void;
  onNext?: () => void;
  onNew?: () => void;
  onMenu?: () => void;
  lastAction?: Presentation;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    result = state.results.at(-1)!;
  const finished = state.phase === "finished";
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`result-dialog ${finished ? "match-finished" : ""}`}
      aria-labelledby="result-title"
      aria-describedby="result-summary"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <button
        className="result-close"
        aria-label="收起结算，查看牌桌"
        autoFocus
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <div className="result-heading">
        <div className="result-medal">
          <Trophy size={38} />
        </div>
        <p className="result-kicker">
          {finished ? "整场比赛结束" : `第 ${state.round} 轮结束`}
        </p>
        <h2 id="result-title">{resultTitle(state)}</h2>
        <p id="result-summary">
          {finished
            ? state.targetSeals === 1
              ? `${result.winner === 0 ? "你" : "米拉"}赢下本局，获得卓越印章。`
              : `${state.seals[0] >= 2 ? "你" : "米拉"}率先获得两枚卓越印章，成为大君的御用商人。`
            : result.winner === null
              ? "本轮不颁发印章，轮换先手继续角逐。"
              : `${result.winner === 0 ? "你" : "米拉"}获得一枚卓越印章；下一轮由${result.winner === 0 ? "米拉" : "你"}先手。`}
        </p>
      </div>
      <div className="result-seals">
        <span>卓越印章</span>
        <b>
          你 {state.seals[0]} <i>:</i> {state.seals[1]} 米拉
        </b>
        <small>
          {state.targetSeals === 1 ? "1 局定胜负" : "先得 2 枚获胜"}
        </small>
      </div>
      <div
        className="result-score-formula"
        role="img"
        aria-label="货物收入加批量奖励加骆驼奖励，等于本轮总分"
        title="货物收入 ＋ 批量奖励 ＋ 骆驼奖励 ＝ 本轮总分"
      >
        <ScoreSymbol kind="goods" />
        <span>＋</span>
        <ScoreSymbol kind="bonus" />
        <span>＋</span>
        <ScoreSymbol kind="camel" />
        <span>＝</span>
        <ScoreSymbol kind="total" />
        <span>总分</span>
      </div>
      <div className="round-scorecards">
        {[0, 1].map((i) => (
          <section
            className={result.winner === i ? "round-winner" : ""}
            key={i}
          >
            <header>
              <b>{i === 0 ? "你" : "米拉"}</b>
              <span>{result.winner === i ? "本轮胜者" : ""}</span>
            </header>
            <div className="round-score">
              {result.scores[i]}
              <small>卢比</small>
            </div>
            <dl>
              <div>
                <dt title="货物筹码的面值之和">
                  <ScoreSymbol kind="goods" />
                  卖货
                </dt>
                <dd>{result.goods[i]}</dd>
              </div>
              <div>
                <dt title="批量奖励筹码的面值之和">
                  <ScoreSymbol kind="bonus" />
                  奖励
                </dt>
                <dd>{result.bonuses[i]}</dd>
              </div>
              <div>
                <dt title="骆驼较多的一方加 5 卢比，平手均不加分">
                  <ScoreSymbol kind="camel" />
                  骆驼
                </dt>
                <dd>{result.camel === i ? 5 : 0}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <div
        className="result-camel-note"
        title="骆驼比较头数，较多的一方共加 5 卢比；平手都不加分"
        aria-label={`骆驼：你 ${state.players[0].camels} 头，米拉 ${state.players[1].camels} 头；${result.camel === null ? "双方不加分" : `${result.camel === 0 ? "你" : "米拉"}加 5 卢比`}`}
      >
        <ScoreSymbol kind="camel" />
        <span>
          你 <b>{state.players[0].camels}</b>
        </span>
        <span>
          {state.players[0].camels === state.players[1].camels
            ? "＝"
            : state.players[0].camels > state.players[1].camels
              ? "＞"
              : "＜"}
        </span>
        <span>
          米拉 <b>{state.players[1].camels}</b>
        </span>
        <ArrowRight size={14} aria-hidden="true" />
        <b className="result-camel-award">
          {result.camel === null
            ? "双方 +0"
            : `${result.camel === 0 ? "你" : "米拉"} +5`}
        </b>
      </div>
      <p className="result-reason">{result.reason}</p>
      {result.scores[0] === result.scores[1] && (
        <div
          className="result-tie"
          title="同分时先比较奖励筹码枚数，再比较货物筹码枚数；数字顺序为你 : 米拉"
          aria-label={`同分比枚数：奖励筹码，你 ${state.players[0].bonuses.length}，米拉 ${state.players[1].bonuses.length}；货物筹码，你 ${state.players[0].goods.length}，米拉 ${state.players[1].goods.length}`}
        >
          <span>同分比枚数</span>
          <ScoreSymbol kind="bonus" />
          <b>
            {state.players[0].bonuses.length} :{" "}
            {state.players[1].bonuses.length}
          </b>
          <ArrowRight size={14} aria-hidden="true" />
          <ScoreSymbol kind="goods" />
          <b>
            {state.players[0].goods.length} : {state.players[1].goods.length}
          </b>
        </div>
      )}
      <details className="result-score-details">
        <summary>筹码明细</summary>
        <div>
          <div className="result-rule-symbols">
            <span
              title="一次卖出至少 3 张同类货物，可领取 1 枚对应奖励，领完则不再发放"
              aria-label="卖出至少 3 张同类货物，可领 1 枚奖励"
            >
              <Layers size={18} aria-hidden="true" />
              <b>3+</b>
              <span>同类</span>
              <ArrowRight size={14} aria-hidden="true" />
              <ScoreSymbol kind="bonus" />
              <b>×1</b>
            </span>
            <span title="未卖出的手牌不计分" aria-label="未卖出手牌，零分">
              <Hand size={18} aria-hidden="true" />
              <span>未售</span>
              <ArrowRight size={14} aria-hidden="true" />
              <b>0</b>
            </span>
          </div>
          {[0, 1].map((i) => (
            <section key={i}>
              <h3>{i === 0 ? "你" : "米拉"}</h3>
              <TokenEquation
                values={state.players[i].goods}
                total={result.goods[i]}
              />
              <TokenEquation
                values={state.players[i].bonuses}
                total={result.bonuses[i]}
                bonus
              />
            </section>
          ))}
          {lastAction && (
            <p className="result-last-action" title="收市前最后一手">
              {lastAction.actor === 0 ? "你" : "米拉"} ·{" "}
              {actionCaption(lastAction)}
            </p>
          )}
        </div>
      </details>
      <div className="result-actions">
        {!finished && onNext ? (
          <button className="primary" onClick={onNext}>
            开始下一轮
            <ArrowRight size={17} />
          </button>
        ) : finished && onNew ? (
          <button className="primary" onClick={onNew}>
            {state.targetSeals === 1 ? "再来一局" : "再来一场"}
            <ArrowRight size={17} />
          </button>
        ) : (
          <button className="primary" onClick={onClose}>
            继续查看回放
          </button>
        )}
        {onMenu && (
          <button
            className="secondary"
            onClick={onMenu}
            aria-label="返回主菜单"
            title="返回主菜单"
          >
            <Home size={16} aria-hidden="true" />
            菜单
          </button>
        )}
        <button
          className="text-button"
          onClick={onClose}
          aria-label="查看牌桌"
          title="查看牌桌"
        >
          <Eye size={16} aria-hidden="true" />
          牌桌
        </button>
      </div>
      {state.results.length > 1 && (
        <details className="round-history">
          <summary>查看全部 {state.results.length} 轮战绩</summary>
          <table>
            <thead>
              <tr>
                <th>轮次</th>
                <th>你</th>
                <th>米拉</th>
                <th>胜者</th>
              </tr>
            </thead>
            <tbody>
              {state.results.map((r) => (
                <tr key={r.round}>
                  <td>{r.round}</td>
                  <td>{r.scores[0]}</td>
                  <td>{r.scores[1]}</td>
                  <td>
                    {r.winner === null
                      ? "平局"
                      : r.winner === 0
                        ? "你"
                        : "米拉"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </dialog>
  );
}
