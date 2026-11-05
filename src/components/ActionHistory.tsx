import { useLayoutEffect, useRef } from "react";
import type { ActionRecord } from "../game/receipts.ts";
import type { RoundResult } from "../game/types.ts";
import { ActionColumns, ActionRow } from "./LastActions.tsx";

export function ActionHistory({
  records,
  results,
}: {
  records: ActionRecord[];
  results: RoundResult[];
}) {
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [records]);
  if (!records.length)
    return (
      <p className="history-empty">还没有交易记录，开市后会显示在这里。</p>
    );
  return (
    <ol className="action-history" ref={list} aria-label="按时间排列的行动记录">
      <li className="history-column-head">
        <ActionColumns />
      </li>
      {records.map((record, i) => {
        const start = i === 0 || records[i - 1].round !== record.round;
        const result =
          i === records.length - 1 || records[i + 1].round !== record.round
            ? results.find((r) => r.round === record.round)
            : undefined;
        return (
          <li key={`${record.round}-${record.turn}`}>
            {start && <h3 className="history-round">第 {record.round} 轮</h3>}
            <div className="history-entry">
              <ActionRow
                actor={record.action.actor}
                action={record.action}
                latest={i === records.length - 1}
                turn={record.turn}
              />
            </div>
            {result && (
              <p className="history-result">
                本轮结算 · 你 {result.scores[0]} 卢比 · 米拉 {result.scores[1]}{" "}
                卢比
                {result.winner === null
                  ? " · 平局"
                  : ` · ${result.winner === 0 ? "你" : "米拉"}获胜`}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
