import { useEffect, useRef } from "react";
import {
  Trophy,
  X,
  ArrowRight,
  Coins,
  Award,
  Sigma,
  Home,
  Eye,
} from "lucide-react";
import type { State } from "../game/types.ts";
import type { ActionRecord } from "../game/receipts.ts";
import {
  ACTION_STATISTIC_ROWS,
  actionStatistics,
} from "../game/action-statistics.ts";
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
  history,
}: {
  state: State;
  onClose: () => void;
  onNext?: () => void;
  onNew?: () => void;
  onMenu?: () => void;
  history: readonly ActionRecord[];
}) {
  const ref = useRef<HTMLDialogElement>(null),
    result = state.results.at(-1)!;
  const finished = state.phase === "finished";
  const statistics = actionStatistics(
    history,
    finished ? undefined : state.round,
  );
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
                <dd
                  className="result-camel-breakdown"
                  aria-label={`骆驼 ${state.players[i].camels} 头，骆驼奖励 ${result.camel === i ? 5 : 0} 卢比`}
                >
                  <span>{state.players[i].camels} 头</span>
                  <span>+{result.camel === i ? 5 : 0}</span>
                </dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
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
      <section className="result-action-statistics">
        <table>
          <caption>
            {finished ? "整场行动统计" : `第 ${state.round} 轮行动统计`}（次）
          </caption>
          <thead>
            <tr>
              <th scope="col">行动</th>
              <th scope="col">你</th>
              <th scope="col">米拉</th>
            </tr>
          </thead>
          <tbody>
            {ACTION_STATISTIC_ROWS.map(({ type, label }) => (
              <tr key={type}>
                <th scope="row">{label}</th>
                <td>{statistics[0][type]}</td>
                <td>{statistics[1][type]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
