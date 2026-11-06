import { useLayoutEffect, useRef, useState } from "react";
import type { Presentation } from "../game/presentation.ts";
import { actionCaption } from "../game/presentation.ts";
import type { Card } from "../game/types.ts";
import { LABEL, sum } from "../game/data.ts";
import { lastActionOrder } from "../game/receipts.ts";
import { GoodsArt } from "./Art.tsx";
import { useFeedbackLifetime } from "../hooks/useFeedbackLifetime.ts";
import {
  Coins,
  Award,
  Hand,
  ArrowLeftRight,
  ArrowDownToLine,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

function GoodsText({ cards }: { cards: Card[] }) {
  return [...new Set(cards)].map((good) => (
    <span
      key={good}
      className={`ledger-good ${good} ${cards.filter((c) => c === good).length === 1 ? "single-good" : ""}`}
      title={`${LABEL[good]}×${cards.filter((c) => c === good).length}`}
    >
      <GoodsArt good={good} cardFace />
      <span className="ledger-item-name">{LABEL[good]}</span>
      <span className="ledger-item-value">
        ×{cards.filter((c) => c === good).length}
      </span>
    </span>
  ));
}

function Income({ action }: { action: Presentation }) {
  return (
    <>
      <span className="ledger-income">
        <Coins aria-hidden="true" />
        <b className="ledger-item-name">{sum(action.coins)}</b>
        <span className="ledger-item-value">卢比</span>
      </span>
      {action.bonus !== null && (
        <span className="ledger-bonus">
          <Award aria-hidden="true" />
          <span className="ledger-item-name">
            {Math.min(action.outgoing.length, 5)} 张
          </span>
          <span className="ledger-item-value">奖励</span>
        </span>
      )}
    </>
  );
}

function TradeFlow({ action }: { action: Presentation }) {
  return (
    <div className="ledger-trade-flow">
      <span
        className="ledger-trade-paid"
        aria-label={action.outgoing.length ? "付出" : "行动"}
      >
        {action.outgoing.length ? (
          <>
            <span className="ledger-simple-verb">
              {action.type === "sell" ? "卖货" : "换牌"}
            </span>
            <GoodsText cards={action.outgoing} />
          </>
        ) : (
          <span className="ledger-simple-verb">
            {action.type === "camels" ? "收驼" : "拿取"}
          </span>
        )}
      </span>
      <span className="ledger-trade-direction" aria-hidden="true">
        {action.outgoing.length > 0 && (
          <ArrowRight className="ledger-trade-arrow" size={14} />
        )}
      </span>
      <span className="ledger-trade-received" aria-label="收获">
        {action.type === "sell" ? (
          <Income action={action} />
        ) : (
          <GoodsText cards={action.incoming} />
        )}
      </span>
    </div>
  );
}

export function ActionSummary({ action }: { action: Presentation }) {
  const Icon = {
    take: Hand,
    camels: ArrowDownToLine,
    exchange: ArrowLeftRight,
    sell: Coins,
  }[action.type];
  const verb = { take: "拿取", camels: "收驼", exchange: "交换", sell: "卖出" }[
    action.type
  ];
  return (
    <div className="action-summary" aria-label={actionCaption(action)}>
      <span className="action-summary-verb">
        <Icon size={17} aria-hidden="true" />
        {verb}
      </span>
      <span className="action-summary-goods">
        <GoodsText
          cards={action.outgoing.length ? action.outgoing : action.incoming}
        />
        {action.type === "exchange" && (
          <>
            <ArrowRight
              className="action-summary-arrow"
              size={15}
              aria-hidden="true"
            />
            <GoodsText cards={action.incoming} />
          </>
        )}
        {action.type === "sell" && (
          <>
            <ArrowRight
              className="action-summary-arrow"
              size={15}
              aria-hidden="true"
            />
            <span className="action-summary-income">
              <Coins size={16} aria-hidden="true" />
              <b>{sum(action.coins)}</b> 卢比
            </span>
            {action.bonus !== null && (
              <span className="action-summary-bonus">
                <Award size={15} aria-hidden="true" />
                奖励 ×1{" "}
                <small>
                  {action.bonus === "hidden"
                    ? "面值保密"
                    : `+${action.bonus} 卢比`}
                </small>
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export function ActionRow({
  actor,
  action,
  latest = false,
  turn,
  notify = false,
  compact = false,
  flash = false,
  paused = false,
}: {
  actor: number;
  action: Presentation | null;
  latest?: boolean;
  turn?: number | null;
  notify?: boolean;
  compact?: boolean;
  flash?: boolean;
  paused?: boolean;
}) {
  const flashing = useFeedbackLifetime(paused || !flash) && flash;
  const Actor = compact ? "th" : "span";
  const actorLabel = (
    <Actor className="ledger-actor">
      <b>{actor === 0 ? "你" : "米拉"}</b>
      {turn != null && <small>{compact ? `#${turn}` : `第${turn}手`}</small>}
      {latest && (
        <span className="ledger-latest">{compact ? "·" : "最新"}</span>
      )}
    </Actor>
  );
  if (compact)
    return (
      <tr
        className={`compact-action ${actor === 0 ? "ledger-you" : "ledger-opponent"} ${notify ? "action-notice" : ""} ${flashing ? "action-flash" : ""}`}
        aria-label={action ? actionCaption(action) : undefined}
        title={latest ? "最新行动" : undefined}
      >
        {actorLabel}
        {action ? (
          <td className="ledger-trade">
            <TradeFlow action={action} />
          </td>
        ) : (
          <td className="ledger-empty">尚未行动</td>
        )}
      </tr>
    );
  return (
    <div
      className={`ledger-row ${actor === 0 ? "ledger-you" : "ledger-opponent"} ${latest ? "latest-action" : ""} ${notify ? "action-notice" : ""}`}
    >
      {actorLabel}
      <span
        className={`ledger-description ${action ? "" : "ledger-empty"}`}
        aria-label={action ? actionCaption(action) : undefined}
      >
        {action ? <TradeFlow action={action} /> : "尚未行动"}
      </span>
    </div>
  );
}

export function LastActions({
  actions,
  latestActor,
  turns,
  settled = true,
  onHistory,
  status,
  turnNumber,
  active = false,
  paused = false,
}: {
  actions: [Presentation | null, Presentation | null];
  latestActor: number | null;
  turns: [number | null, number | null];
  settled?: boolean;
  onHistory: () => void;
  status?: string;
  turnNumber?: number;
  active?: boolean;
  paused?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLTableElement>(null);
  const iconMeasure = useRef<HTMLTableElement>(null);
  const [iconsOnly, setIconsOnly] = useState(false);
  const [dense, setDense] = useState(false);
  useLayoutEffect(() => {
    const update = () => {
      if (container.current && measure.current) {
        const columnWidth =
          container.current.querySelector<HTMLElement>(".ledger-trade-received")
            ?.clientWidth ?? container.current.clientWidth;
        const widestGroup = (table: HTMLTableElement | null) =>
          Math.max(
            0,
            ...Array.from(
              table?.querySelectorAll<HTMLElement>(
                ".ledger-trade-paid, .ledger-trade-received",
              ) ?? [],
            ).map((group) => group.getBoundingClientRect().width),
          );
        setIconsOnly(widestGroup(measure.current) > columnWidth + 1);
        setDense(widestGroup(iconMeasure.current) > columnWidth + 1);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (container.current) observer.observe(container.current);
    if (measure.current) observer.observe(measure.current);
    if (iconMeasure.current) observer.observe(iconMeasure.current);
    return () => observer.disconnect();
  }, [actions, turns]);
  const rows = lastActionOrder(latestActor).map((actor) => (
    <ActionRow
      key={`${actor}:${turns[actor] ?? 0}`}
      actor={actor}
      action={actions[actor]}
      latest={latestActor === actor}
      turn={turns[actor]}
      notify={settled && latestActor === 1 && actor === 1}
      compact
      flash={
        settled && latestActor === actor && actions[actor]?.type !== "sell"
      }
      paused={paused}
    />
  ));
  return (
    <section className="action-ledger" aria-label="双方上步行动">
      <div className="ledger-heading">
        {status && (
          <span className="ledger-status" role="status">
            <i className={`status-dot ${active ? "your-turn" : ""}`} />
            {status}
          </span>
        )}
        {turnNumber !== undefined && (
          <span className="ledger-turn-number">第 {turnNumber} 手</span>
        )}
      </div>
      <button
        className="ledger-open"
        aria-label="查看完整行动记录"
        aria-haspopup="dialog"
        title="点击查看全部历史行动"
        onClick={onHistory}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>
      <div className="compact-ledger" ref={container}>
        <table
          className={`compact-ledger-table ${iconsOnly ? "icons-only" : ""} ${dense ? "dense-icons" : ""}`}
        >
          <tbody>{rows}</tbody>
        </table>
        <div className="ledger-measure" aria-hidden="true">
          <table ref={measure} className="compact-ledger-table">
            <tbody>{rows}</tbody>
          </table>
          <table ref={iconMeasure} className="compact-ledger-table icons-only">
            <tbody>{rows}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
