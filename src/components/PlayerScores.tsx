import type { CSSProperties, ReactNode } from "react";
import type { Good, State } from "../game/types.ts";
import type { Presentation } from "../game/presentation.ts";
import {
  playerCardsDisplay,
  playerScoreDisplay,
} from "../game/score-display.ts";
import { GOODS } from "../game/types.ts";
import { LABEL } from "../game/data.ts";
import { SaleReceipt } from "./SaleReceipt.tsx";
import {
  Award,
  Coins,
  GalleryVerticalEnd,
  LockKeyhole,
  Trophy,
} from "lucide-react";
import { GoodsArt, JaipurMark } from "./Art.tsx";
import { SaleFeedback } from "./SaleFeedback.tsx";
import { CamelPile } from "./CamelPile.tsx";
import { MoneyPile } from "./MoneyPile.tsx";

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
  sales,
  paused = false,
  revealOpponent = false,
  actor: selectedActor,
}: {
  state: State;
  receipts: [Presentation | null, Presentation | null];
  onInspect: () => void;
  sales?: readonly ({ id: string; action: Presentation } | null)[];
  paused?: boolean;
  revealOpponent?: boolean;
  actor?: 0 | 1;
}) {
  const actors: readonly (0 | 1)[] =
    selectedActor === undefined ? [0, 1] : [selectedActor];
  return (
    <section
      className={`mobile-player-scores${selectedActor === undefined ? "" : " player-scores-single"}`}
      aria-label={
        selectedActor === undefined
          ? "双方得分"
          : selectedActor === 0
            ? "你的座位"
            : "米拉的座位"
      }
    >
      {actors.map((actor) => {
        const player = state.players[actor];
        const own = actor === 0;
        const score = playerScoreDisplay(state, actor, revealOpponent);
        const receipt = receipts[actor];
        const sale = sales?.[actor];
        const revealHerd = own || revealOpponent || state.phase !== "playing";
        return (
          <div
            key={actor}
            className={`player-score-slot player-seat ${own ? "slot-you seat-you" : "slot-opponent seat-opponent"}${selectedActor !== undefined ? " seat-with-herd-pile" : ""}`}
          >
            <button
              className={`player-score-card ${own ? "score-you" : "score-opponent"} ${state.current === actor && state.phase === "playing" ? "score-active" : ""}`}
              onClick={onInspect}
              aria-label={`查看${own ? "你的" : "米拉的"}得分明细`}
              aria-haspopup="dialog"
              data-motion-anchor={own ? "your-score" : "opponent-score"}
            >
              <span className="score-card-heading">
                <span className="score-card-identity">
                  <b>{own ? "你" : "米拉"}</b>
                </span>
                <span
                  className="score-card-seals"
                  aria-label={`胜局 ${state.seals[actor]}/${state.targetSeals ?? 2}`}
                >
                  <ScoreIcon kind="wins" />
                  <span className="score-seals-label">胜局</span>{" "}
                  <b>
                    {state.seals[actor]}/{state.targetSeals ?? 2}
                  </b>
                </span>
              </span>
              <span className="score-card-stats">
                <span
                  className="score-stat score-stat-hand"
                  data-motion-anchor={
                    own || selectedActor === 1 ? undefined : "opponent-hand"
                  }
                  aria-label={`手牌 ${player.hand.length}/7 张`}
                >
                  <span className="score-stat-title">
                    <ScoreIcon kind="hand" />
                    <span className="score-stat-label">手牌</span>
                  </span>
                  <strong>
                    {player.hand.length}
                    <small>/7</small>
                  </strong>
                </span>
                <span
                  className="score-stat score-stat-income"
                  aria-label={
                    score.hidden
                      ? "得分保密，收市揭晓"
                      : `得分 ${score.total} 卢比`
                  }
                >
                  {selectedActor !== undefined ? (
                    <MoneyPile amount={score.total} actor={actor} />
                  ) : (
                    <>
                      <span className="score-stat-title">
                        <ScoreIcon kind={score.hidden ? "private" : "income"} />
                        <span className="score-stat-label">得分</span>
                      </span>
                      <strong
                        className={score.hidden ? "score-private" : undefined}
                      >
                        {score.hidden ? (
                          <span className="score-private-label">保密</span>
                        ) : (
                          score.total
                        )}
                      </strong>
                    </>
                  )}
                </span>
                <span
                  className="score-stat score-stat-herd"
                  data-motion-anchor={
                    own
                      ? selectedActor === 0
                        ? undefined
                        : "your-herd"
                      : selectedActor === 1
                        ? undefined
                        : "opponent-herd"
                  }
                  aria-label={
                    revealHerd ? `骆驼 ${player.camels} 头` : "驼队数量保密"
                  }
                >
                  <span className="score-stat-title">
                    <ScoreIcon kind="herd" />
                    <span className="score-stat-label">骆驼</span>
                  </span>
                  <strong className={!revealHerd ? "score-private" : undefined}>
                    {revealHerd ? (
                      player.camels
                    ) : (
                      <>
                        <span className="score-private-label">保密</span>
                        <LockKeyhole
                          className="score-private-glyph"
                          size={12}
                          aria-hidden="true"
                        />
                      </>
                    )}
                  </strong>
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
            {selectedActor === 1 && (
              <div className="opponent-cards-and-herd">
                <OpponentHandFan
                  hand={
                    revealOpponent || state.phase !== "playing"
                      ? player.hand
                      : null
                  }
                  count={player.hand.length}
                />
                <CamelPile
                  count={revealHerd ? player.camels : null}
                  motionAnchor="opponent-herd"
                />
              </div>
            )}
            {sale && (
              <SaleFeedback
                key={sale.id}
                action={sale.action}
                paused={paused}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}

function OpponentHandFan({
  hand,
  count,
}: {
  hand: readonly Good[] | null;
  count: number;
}) {
  return (
    <span
      className="opponent-hand-fan"
      data-motion-anchor="opponent-hand"
      role="group"
      aria-label={`米拉的手牌，共 ${count} 张${hand === null ? "，内容保密" : "，已公开"}`}
      style={{ "--fan-count": Math.max(1, count) } as CSSProperties}
    >
      {count === 0 ? (
        <span className="opponent-hand-empty">暂无手牌</span>
      ) : (
        Array.from({ length: count }, (_, index) => {
          const good = hand?.[index];
          return (
            <span
              key={index}
              className={`opponent-hand-card${good === undefined ? " card-back" : ` ${good}`}`}
              data-motion-anchor={`opponent-hand-${index}`}
              role="img"
              aria-label={good === undefined ? "背面朝上的手牌" : LABEL[good]}
              style={
                {
                  "--fan-index": index,
                  "--fan-count": count,
                } as CSSProperties
              }
            >
              {good === undefined ? (
                <span className="opponent-card-back-mark" aria-hidden="true">
                  <JaipurMark />
                </span>
              ) : (
                <GoodsArt good={good} cardFace />
              )}
            </span>
          );
        })
      )}
    </span>
  );
}

export function PlayerReserve({
  state,
  actor,
  onInspect,
  revealOpponent = false,
}: {
  state: State;
  actor: 0 | 1;
  onInspect: () => void;
  revealOpponent?: boolean;
}) {
  const cards = playerCardsDisplay(state, actor, revealOpponent);
  const score = playerScoreDisplay(state, actor, revealOpponent);
  const own = actor === 0;
  return (
    <div
      className="player-reserve"
      role="group"
      aria-label={own ? "你的驼队与钱堆" : "米拉的驼队与钱堆"}
    >
      <CamelPile
        count={cards.camels}
        motionAnchor={own ? "your-herd" : "opponent-herd"}
      />
      <button
        className={`reserve-money reserve-money-${own ? "own" : "opponent"}`}
        onClick={onInspect}
        aria-label={`查看${own ? "你的" : "米拉的"}得分明细`}
        aria-haspopup="dialog"
        data-motion-anchor={own ? "your-score" : "opponent-score"}
      >
        <MoneyPile amount={score.total} actor={actor} tabletop />
      </button>
    </div>
  );
}

export function OpponentSeat({
  state,
  onInspect,
  revealOpponent = false,
  actionSummary,
}: {
  state: State;
  onInspect: () => void;
  revealOpponent?: boolean;
  actionSummary?: ReactNode;
}) {
  const cards = playerCardsDisplay(
    state,
    1,
    revealOpponent || state.phase !== "playing",
  );
  return (
    <section className="player-seat seat-opponent" aria-label="米拉的座位">
      {actionSummary}
      <div
        className="opponent-cards-and-herd"
        style={
          { "--hand-count": Math.max(1, cards.handCount) } as CSSProperties
        }
      >
        <OpponentHandFan hand={cards.hand} count={cards.handCount} />
        <PlayerReserve
          state={state}
          actor={1}
          onInspect={onInspect}
          revealOpponent={revealOpponent}
        />
      </div>
    </section>
  );
}

function HandSummary({ hand }: { hand: Good[] | null }) {
  if (hand === null) return <p className="score-hand-note">手牌内容保密</p>;
  if (!hand.length) return <p className="score-hand-note">暂无手牌</p>;
  return (
    <div className="score-hand-cards">
      {GOODS.map((good) => {
        const count = hand.filter((card) => card === good).length;
        return count ? (
          <span
            key={good}
            className={`score-hand-good ${good}`}
            aria-label={`${LABEL[good]} ${count} 张`}
          >
            <GoodsArt good={good} cardFace />
            <span>{LABEL[good]}</span>
            <b>×{count}</b>
          </span>
        ) : null;
      })}
    </div>
  );
}

export function ScoreDetails({
  state,
  receipts,
  revealOpponent = false,
}: {
  state: State;
  receipts: [Presentation | null, Presentation | null];
  revealOpponent?: boolean;
}) {
  return (
    <div className="player-score-details">
      {([0, 1] as const).map((actor) => {
        const own = actor === 0;
        const name = own ? "你" : "米拉";
        const score = playerScoreDisplay(state, actor, revealOpponent);
        const cards = playerCardsDisplay(state, actor, revealOpponent);
        const settled = state.phase !== "playing";
        const camelPoints =
          settled && !score.hidden
            ? score.total! - score.goods! - score.bonus!
            : null;
        return (
          <section key={actor} className={own ? "score-you" : "score-opponent"}>
            <header className="score-detail-heading">
              <h3>{name}</h3>
              <span>{own ? "本方" : "对手"}</span>
            </header>
            <section
              className="score-detail-inventory"
              aria-label={`${name}的手牌与驼队`}
            >
              <dl className="score-detail-counts">
                <div>
                  <dt>
                    <ScoreIcon kind="hand" />
                    手牌
                  </dt>
                  <dd>{cards.handCount} / 7 张</dd>
                </div>
                <div>
                  <dt>
                    <ScoreIcon kind="herd" />
                    骆驼
                  </dt>
                  <dd>
                    {cards.camels === null ? "数量保密" : `${cards.camels} 头`}
                  </dd>
                </div>
              </dl>
              <HandSummary hand={cards.hand} />
            </section>
            <section
              className="score-detail-finance"
              aria-label={`${name}的收入与得分`}
            >
              <dl>
                <div>
                  <dt>货物{score.hidden ? "筹码" : "收入"}</dt>
                  <dd>
                    {score.hidden
                      ? `${score.goodsTokenCount} 枚`
                      : `${score.goods} 卢比`}
                  </dd>
                </div>
                <div>
                  <dt>奖励{score.hidden ? "筹码" : "收入"}</dt>
                  <dd title={score.hidden ? "奖励面值保密" : undefined}>
                    {score.hidden
                      ? `${score.bonusTokenCount} 枚`
                      : `${score.bonus} 卢比`}
                  </dd>
                </div>
                {camelPoints !== null && (
                  <div>
                    <dt>驼队奖励</dt>
                    <dd>{camelPoints} 卢比</dd>
                  </div>
                )}
                <div className="score-detail-total">
                  <dt>{settled ? "本轮得分" : "当前得分"}</dt>
                  <dd>
                    {score.hidden ? (
                      "保密"
                    ) : (
                      <>
                        {score.total}
                        <small>卢比</small>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
            <section
              className="score-detail-recent"
              aria-label={`${name}的上笔出售收入`}
            >
              <p className="score-last-sale">上笔出售</p>
              <SaleReceipt receipt={receipts[actor]} actor={actor} />
              {!receipts[actor] && (
                <p className="score-no-sale">尚未出售货物</p>
              )}
            </section>
          </section>
        );
      })}
      <p className="score-privacy-note">
        {revealOpponent && state.phase === "playing"
          ? "回放公开双方当时的手牌、驼队和得分；驼队奖励在收市时计算。"
          : state.phase === "playing"
            ? "米拉的累计得分和奖励面值在收市时揭晓。你的当前得分含货物和奖励，驼队奖励在收市时计算。"
            : "本轮得分已揭晓，含货物、奖励，以及驼队领先者获得的 5 卢比。"}
      </p>
    </div>
  );
}
