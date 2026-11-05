import { useLayoutEffect, useRef, useState } from "react";
import type { Presentation } from "../game/presentation.ts";
import { actionCaption } from "../game/presentation.ts";
import type { Card } from "../game/types.ts";
import { LABEL, sum } from "../game/data.ts";
import { lastActionOrder } from "../game/receipts.ts";
import { GoodsArt } from "./Art.tsx";
import {
  Coins,
  Award,
  Hand,
  ArrowLeftRight,
  ArrowDownToLine,
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

function ActionText({
  action,
  compact = false,
}: {
  action: Presentation;
  compact?: boolean;
}) {
  const Cell = compact ? "td" : "span";
  const verb = { take: "拿取", camels: "收驼", exchange: "交换", sell: "卖出" }[
    action.type
  ];
  const Icon = {
    take: Hand,
    camels: ArrowDownToLine,
    exchange: ArrowLeftRight,
    sell: Coins,
  }[action.type];
  return (
    <>
      <Cell className="ledger-verb">
        <Icon aria-hidden="true" />
        {verb}
      </Cell>
      <Cell className="ledger-goods ledger-paid" aria-label="付出">
        {action.outgoing.length ? (
          <GoodsText cards={action.outgoing} />
        ) : (
          <span className="ledger-none">—</span>
        )}
      </Cell>
      <Cell className="ledger-goods ledger-received" aria-label="收获">
        {action.type === "sell" ? (
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
        ) : (
          <GoodsText cards={action.incoming} />
        )}
      </Cell>
    </>
  );
}

export function ActionColumns({ compact = false }: { compact?: boolean }) {
  if (compact)
    return (
      <thead>
        <tr>
          <th aria-label="玩家与行动编号" />
          <th>行动</th>
          <th>付出</th>
          <th>收获</th>
        </tr>
      </thead>
    );
  return (
    <div className="ledger-columns" aria-hidden="true">
      <span>行动</span>
      <span>付出</span>
      <span>收获</span>
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
}: {
  actor: number;
  action: Presentation | null;
  latest?: boolean;
  turn?: number | null;
  notify?: boolean;
  compact?: boolean;
}) {
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
        className={`compact-action ${actor === 0 ? "ledger-you" : "ledger-opponent"} ${notify ? "action-notice" : ""}`}
        aria-label={action ? actionCaption(action) : undefined}
        title={latest ? "最新行动" : undefined}
      >
        {actorLabel}
        {action ? (
          <ActionText action={action} compact />
        ) : (
          <td colSpan={3} className="ledger-empty">
            尚未行动
          </td>
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
        {action ? <ActionText action={action} /> : "尚未行动"}
      </span>
    </div>
  );
}

export function LastActions({
  actions,
  latestActor,
  turns,
  settled = true,
}: {
  actions: [Presentation | null, Presentation | null];
  latestActor: number | null;
  turns: [number | null, number | null];
  settled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLTableElement>(null);
  const iconMeasure = useRef<HTMLTableElement>(null);
  const [iconsOnly, setIconsOnly] = useState(false);
  const [dense, setDense] = useState(false);
  useLayoutEffect(() => {
    const update = () => {
      if (container.current && measure.current) {
        setIconsOnly(
          measure.current.getBoundingClientRect().width >
            container.current.clientWidth + 1,
        );
        setDense(
          (iconMeasure.current?.getBoundingClientRect().width ?? 0) >
            container.current.clientWidth + 1,
        );
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
      key={actor}
      actor={actor}
      action={actions[actor]}
      latest={latestActor === actor}
      turn={turns[actor]}
      notify={settled && latestActor === 1 && actor === 1}
      compact
    />
  ));
  return (
    <section className="action-ledger" aria-label="双方上步行动">
      <span className="ledger-caption">最近行动</span>
      <div className="compact-ledger" ref={container}>
        <table
          className={`compact-ledger-table ${iconsOnly ? "icons-only" : ""} ${dense ? "dense-icons" : ""}`}
        >
          <ActionColumns compact />
          <tbody>{rows}</tbody>
        </table>
        <div className="ledger-measure" aria-hidden="true">
          <table ref={measure} className="compact-ledger-table">
            <ActionColumns compact />
            <tbody>{rows}</tbody>
          </table>
          <table ref={iconMeasure} className="compact-ledger-table icons-only">
            <ActionColumns compact />
            <tbody>{rows}</tbody>
          </table>
        </div>
      </div>
      <div className="desktop-ledger">
        <ActionColumns />
        <div className="ledger-players">
          {lastActionOrder(latestActor).map((actor) => (
            <ActionRow
              key={actor}
              actor={actor}
              action={actions[actor]}
              latest={latestActor === actor}
              turn={turns[actor]}
              notify={settled && latestActor === 1 && actor === 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
