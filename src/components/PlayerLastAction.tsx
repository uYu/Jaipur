import { useSkin } from "./Skin.tsx";
import type { Presentation } from "../game/presentation.ts";
import { sum } from "../game/data.ts";
import { ActionSummary } from "./LastActions.tsx";
import { useLayoutEffect, useRef } from "react";
import { Award, Coins, Sigma } from "lucide-react";

export function PlayerLastAction({ action }: { action: Presentation | null }) {
  const { t } = useSkin();
  const container = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      element.dataset.compact = "false";
      const content = element.querySelector<HTMLElement>(
        ".player-last-action-content",
      );
      if (content && content.scrollWidth > content.clientWidth + 1)
        element.dataset.compact = "true";
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [action]);
  const exactSale =
    action?.actor === 0 && action.type === "sell" && action.bonus !== "hidden";
  const goods = exactSale ? sum(action.coins) : 0;
  const bonus =
    exactSale && typeof action.bonus === "number" ? action.bonus : 0;
  return (
    <aside
      className="table-notes player-last-action"
      aria-label="你的上一步行动"
      ref={container}
    >
      <div className="table-last-action" aria-live="polite">
        <span className="table-action-actor">你</span>
        {action ? (
          <div className="player-last-action-content">
            <ActionSummary action={action} showIncome={!exactSale} />
            {exactSale && (
              <div
                className="player-last-sale"
                aria-label={t`货款 ${goods} 卢比，额外奖励 ${bonus} 卢比，合计 ${goods + bonus} 卢比`}
              >
                <span>
                  <Coins aria-hidden="true" />
                  <span className="player-last-amount-label">{t("货款")}</span>{" "}
                  <b>{goods}</b>
                </span>
                <span className="player-last-bonus">
                  <Award aria-hidden="true" />
                  <span className="player-last-amount-label">奖励</span>{" "}
                  <b>+{bonus}</b>
                </span>
                <span className="player-last-total">
                  <Sigma aria-hidden="true" />
                  <span className="player-last-amount-label">合计</span>{" "}
                  <b>{goods + bonus}</b>
                </span>
              </div>
            )}
          </div>
        ) : (
          <span className="ledger-empty">等待第一笔生意</span>
        )}
      </div>
    </aside>
  );
}
