import { useEffect, useRef } from "react";
import { Trophy, X, ArrowRight } from "lucide-react";
import type { State } from "../game/types.ts";
export function resultTitle(state: State) {
  if (state.phase === "finished")
    return state.seals[0] >= 2 ? "你赢得了整场比赛！" : "米拉赢得了整场比赛";
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
}: {
  state: State;
  onClose: () => void;
  onNext?: () => void;
  onNew?: () => void;
  onMenu?: () => void;
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
            ? `${state.seals[0] >= 2 ? "你" : "米拉"}率先获得两枚卓越印章，成为大君的御用商人。`
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
        <small>先得 2 枚获胜</small>
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
                <dt>货物收入</dt>
                <dd>{result.goods[i]}</dd>
              </div>
              <div>
                <dt>批量奖励</dt>
                <dd>{result.bonuses[i]}</dd>
              </div>
              <div>
                <dt>驼队奖励</dt>
                <dd>{result.camel === i ? 5 : 0}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
      <p className="result-reason">
        {result.reason} · 驼队：你 {state.players[0].camels} / 米拉{" "}
        {state.players[1].camels}
      </p>
      {result.scores[0] === result.scores[1] && (
        <p className="result-tie">
          同分时依次比较奖励筹码枚数、货物筹码枚数。
          <br />
          奖励筹码：你 {state.players[0].bonuses.length} / 米拉{" "}
          {state.players[1].bonuses.length}；货物筹码：你{" "}
          {state.players[0].goods.length} / 米拉 {state.players[1].goods.length}
          。
        </p>
      )}
      <div className="result-actions">
        {!finished && onNext ? (
          <button className="primary" autoFocus onClick={onNext}>
            开始下一轮
            <ArrowRight size={17} />
          </button>
        ) : finished && onNew ? (
          <button className="primary" autoFocus onClick={onNew}>
            再来一场
            <ArrowRight size={17} />
          </button>
        ) : (
          <button className="primary" autoFocus onClick={onClose}>
            继续查看回放
          </button>
        )}
        {onMenu && (
          <button className="secondary" onClick={onMenu}>
            返回主菜单
          </button>
        )}
        <button className="text-button" onClick={onClose}>
          查看牌桌
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
