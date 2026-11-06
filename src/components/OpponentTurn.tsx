import { ChevronRight } from "lucide-react";
import type { OpponentTurnDetails } from "../game/opponent-turn.ts";
import type { Card } from "../game/types.ts";
import { LABEL } from "../game/data.ts";
import { ActionSummary } from "./LastActions.tsx";
import { GoodsArt } from "./Art.tsx";

function MarketRow({
  cards,
  slots,
  changed,
  after,
}: {
  cards: Card[];
  slots: number[];
  changed: number[];
  after: boolean;
}) {
  return (
    <div className="turn-market-row">
      <span>{after ? "市场后" : "市场前"}</span>
      <div className="turn-market-cards">
        {Array.from({ length: 5 }, (_, slot) => {
          const index = slots.indexOf(slot);
          const good = index < 0 ? undefined : cards[index];
          const marked = changed.includes(slot);
          return (
            <span
              key={slot}
              className={`turn-market-card ${good ?? "empty"} ${marked ? (after ? "market-added" : "market-removed") : ""}`}
              aria-label={
                good
                  ? `${LABEL[good]}${marked ? (after ? "，本手补入或放回" : "，本手取走") : "，未变化"}`
                  : "空位"
              }
            >
              {good ? (
                <>
                  <GoodsArt good={good} cardFace />
                  <span>{LABEL[good]}</span>
                </>
              ) : (
                <span>空位</span>
              )}
              {marked && (
                <b className="market-change-mark" aria-hidden="true">
                  {after ? "+" : "−"}
                </b>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function OpponentTurn({
  details,
  pending,
  thinking,
  onHistory,
}: {
  details: OpponentTurnDetails | null;
  pending: boolean;
  thinking: boolean;
  onHistory: () => void;
}) {
  return (
    <section
      className={`action-ledger opponent-turn ${pending ? "turn-pending" : ""}`}
      aria-label="米拉本手交易"
      aria-busy={pending}
    >
      <div className="opponent-turn-heading">
        <h3>
          米拉 · 本手{" "}
          <span>
            {details
              ? `第 ${details.turn} 手 · ${pending ? "正在结算" : thinking ? "上手已完成" : "已完成"}`
              : "尚未行动"}
          </span>
        </h3>
        <button
          className="turn-history"
          aria-label="查看完整行动记录"
          aria-haspopup="dialog"
          onClick={onHistory}
        >
          <span>历史</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      {details ? (
        <div
          className="opponent-turn-result"
          aria-live="polite"
          aria-atomic="true"
        >
          <ActionSummary action={details.action} />
          <div className="turn-market-comparison" aria-label="市场前后对照">
            <MarketRow
              cards={details.market.before}
              slots={details.market.beforeSlots}
              changed={details.market.removedSlots}
              after={false}
            />
            <MarketRow
              cards={details.market.after}
              slots={details.market.afterSlots}
              changed={details.market.addedSlots}
              after
            />
          </div>
          <div className="turn-public-changes">
            <span>
              货物筹码{" "}
              <b
                key={`score-${details.round}-${details.turn}`}
                className={
                  !pending &&
                  details.goodsTokenCount.before !==
                    details.goodsTokenCount.after
                    ? "turn-value-arrived"
                    : ""
                }
              >
                {details.goodsTokenCount.before} →{" "}
                {details.goodsTokenCount.after}
              </b>{" "}
              枚
            </span>
            <span>
              手牌{" "}
              <b
                key={`hand-${details.round}-${details.turn}`}
                className={
                  !pending &&
                  details.handCount.before !== details.handCount.after
                    ? "turn-value-arrived"
                    : ""
                }
              >
                {details.handCount.before} → {details.handCount.after}
              </b>{" "}
              张
            </span>
            {details.bonusCount.after !== details.bonusCount.before && (
              <span>
                秘密奖励{" "}
                <b>
                  {details.bonusCount.before} → {details.bonusCount.after}
                </b>{" "}
                枚
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="opponent-turn-empty">
          {thinking
            ? "米拉正在挑选这笔生意…"
            : "米拉尚未行动，市场、筹码和手牌数量的前后变化会留在这里。"}
        </p>
      )}
    </section>
  );
}
