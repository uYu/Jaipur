import type { State } from "../game/types.ts";
import type { Presentation } from "../game/presentation.ts";
import { playerScoreDisplay } from "../game/score-display.ts";
import { SaleReceipt } from "./SaleReceipt.tsx";
import {
  Award,
  Coins,
  GalleryVerticalEnd,
  LockKeyhole,
  Trophy,
} from "lucide-react";
import { GoodsArt } from "./Art.tsx";

function ScoreIcon({
  kind,
}: {
  kind: "hand" | "herd" | "wins" | "income" | "bonus" | "private";
}) {
  const Icon = {
    hand: GalleryVerticalEnd,
    wins: Trophy,
    income: Coins,
    bonus: Award,
    private: LockKeyhole,
  };
  const Glyph = kind === "herd" ? null : Icon[kind];
  return (
    <span
      className={`score-icon score-icon-${kind} ${kind === "herd" ? "camel" : ""}`}
      aria-hidden="true"
    >
      {Glyph ? (
        <Glyph size={15} strokeWidth={1.8} />
      ) : (
        <GoodsArt good="camel" cardFace />
      )}
    </span>
  );
}

export function PlayerScores({
  state,
  receipts,
  onInspect,
}: {
  state: State;
  receipts: [Presentation | null, Presentation | null];
  onInspect: () => void;
}) {
  return (
    <section className="mobile-player-scores" aria-label="双方得分">
      {([0, 1] as const).map((actor) => {
        const player = state.players[actor];
        const own = actor === 0;
        const score = playerScoreDisplay(state, actor);
        const receipt = receipts[actor];
        return (
          <button
            key={actor}
            className={`player-score-card ${own ? "score-you" : "score-opponent"} ${state.current === actor && state.phase === "playing" ? "score-active" : ""}`}
            onClick={onInspect}
            aria-label={`查看${own ? "你的" : "米拉的"}得分明细`}
            aria-haspopup="dialog"
            data-motion-anchor={own ? "your-score" : "opponent-score"}
          >
            <span className="score-card-heading">
              <span className="score-card-identity">
                <b>{own ? "你" : "米拉"}</b>
                <small>· {own ? "本方" : "对手"}</small>
              </span>
              <span className="score-card-seals">
                <ScoreIcon kind="wins" />
                胜局{" "}
                <b>
                  {state.seals[actor]}/{state.targetSeals ?? 2}
                </b>
              </span>
            </span>
            <span className="score-card-value">
              <span
                className={`score-value-emblem ${score.hidden ? "score-value-private" : ""}`}
              >
                <ScoreIcon kind={score.hidden ? "private" : "income"} />
              </span>
              {score.hidden ? (
                <>
                  <strong className="score-hidden-value">得分保密</strong>
                  <small className="score-reveal-note">收市揭晓</small>
                </>
              ) : (
                <>
                  <strong>{score.total}</strong>
                  <small>卢比</small>
                </>
              )}
            </span>
            <span className="score-card-meta">
              <span
                className="score-stat score-stat-hand"
                data-motion-anchor={own ? undefined : "opponent-hand"}
                aria-label={`手牌 ${player.hand.length}/7 张`}
              >
                <ScoreIcon kind="hand" />
                手牌 <b>{player.hand.length}/7</b>
              </span>
              <span
                className="score-stat score-stat-herd"
                data-motion-anchor={own ? "your-herd" : "opponent-herd"}
                aria-label={
                  own || state.phase !== "playing"
                    ? `骆驼 ${player.camels} 头`
                    : "驼队数量保密"
                }
              >
                <ScoreIcon kind="herd" />
                {own || state.phase !== "playing" ? (
                  <>
                    <span className="score-stat-label">骆驼</span>{" "}
                    <b>{player.camels}</b>
                  </>
                ) : (
                  <>
                    <span className="score-stat-label">驼队</span>保密
                  </>
                )}
              </span>
            </span>
            {receipt &&
              Array.from(
                {
                  length:
                    receipt.coins.length + (receipt.bonus !== null ? 1 : 0),
                },
                (_, i) => (
                  <i
                    className="score-payment-target"
                    key={i}
                    data-motion-fallback={`payment-${actor}-${i}`}
                    aria-hidden="true"
                  />
                ),
              )}
          </button>
        );
      })}
    </section>
  );
}

export function ScoreDetails({
  state,
  receipts,
}: {
  state: State;
  receipts: [Presentation | null, Presentation | null];
}) {
  return (
    <div className="player-score-details">
      {([0, 1] as const).map((actor) => {
        const own = actor === 0;
        const score = playerScoreDisplay(state, actor);
        const settled = state.phase !== "playing";
        const camelPoints =
          settled && !score.hidden
            ? score.total! - score.goods! - score.bonus!
            : null;
        return (
          <section key={actor} className={own ? "score-you" : "score-opponent"}>
            <h3>{own ? "你 · 本方" : "米拉 · 对手"}</h3>
            <dl>
              <div>
                <dt>
                  <ScoreIcon kind="income" />
                  {score.hidden ? "货物筹码" : "货物收入"}
                </dt>
                <dd>
                  {score.hidden
                    ? `${score.goodsTokenCount} 枚`
                    : `${score.goods} 卢比`}
                </dd>
              </div>
              <div>
                <dt>
                  <ScoreIcon kind="bonus" />
                  {score.hidden ? "奖励筹码" : "奖励收入"}
                </dt>
                <dd>
                  {score.hidden
                    ? `${score.bonusTokenCount} 枚，面值保密`
                    : `${score.bonus} 卢比`}
                </dd>
              </div>
              {camelPoints !== null && (
                <div>
                  <dt>
                    <ScoreIcon kind="herd" />
                    驼队奖励
                  </dt>
                  <dd>{camelPoints} 卢比</dd>
                </div>
              )}
              <div className="score-detail-total">
                <dt>
                  <ScoreIcon kind={score.hidden ? "private" : "income"} />
                  {settled ? "本轮得分" : "当前得分"}
                </dt>
                <dd>
                  {score.hidden ? "得分保密，收市揭晓" : `${score.total} 卢比`}
                </dd>
              </div>
            </dl>
            {!score.hidden && (
              <>
                <p className="score-last-sale">上笔出售收入</p>
                <SaleReceipt receipt={receipts[actor]} actor={actor} />
                {!receipts[actor] && (
                  <p className="score-no-sale">尚未出售货物</p>
                )}
              </>
            )}
          </section>
        );
      })}
      <p className="score-privacy-note">
        {state.phase === "playing"
          ? "米拉的累计得分和奖励面值在收市时揭晓。你的当前得分含货物和奖励，驼队奖励在收市时计算。"
          : "本轮得分已揭晓，含货物、奖励，以及驼队领先者获得的 5 卢比。"}
      </p>
    </div>
  );
}
