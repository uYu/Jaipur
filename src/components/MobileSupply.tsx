import { useLayoutEffect, useRef, useState } from "react";
import { GOODS } from "../game/types.ts";
import type { State } from "../game/types.ts";
import { LABEL, precious } from "../game/data.ts";
export function MobileSupply({
  state,
  onInspect,
}: {
  state: State;
  onInspect: () => void;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  const [mobile, setMobile] = useState(false);
  useLayoutEffect(() => {
    const desktop = window.matchMedia("(min-width: 861px)");
    const sync = () => {
      setMobile(!desktop.matches);
      if (panel.current) panel.current.open = desktop.matches;
    };
    sync();
    desktop.addEventListener("change", sync);
    return () => desktop.removeEventListener("change", sync);
  }, []);
  const depleted = GOODS.filter((g) => !state.tokens[g].length).length;
  return (
    <details className="mobile-supply" ref={panel}>
      <summary
        title={
          mobile ? "点击查看完整筹码盘" : "点击整个筹码面板，展开或收起明细"
        }
        aria-haspopup={mobile ? "dialog" : undefined}
        onClick={(event) => {
          if (mobile) {
            event.preventDefault();
            onInspect();
          }
        }}
      >
        <div className="supply-heading">
          <b>筹码余量</b>
          <span>{depleted}/3 类售罄即收市</span>
          <span className="supply-expand">
            {mobile ? (
              "查看筹码盘 ›"
            ) : (
              <>
                <span className="supply-expand-label">点击面板展开</span>
                <span className="supply-collapse-label">点击面板收起</span>
              </>
            )}
          </span>
        </div>
        <div className="supply-strip">
          {GOODS.map((g) => (
            <div
              className={`supply-counter ${g} ${state.tokens[g].length ? "" : "counter-empty"}`}
              key={g}
              aria-label={`${LABEL[g]}，剩余 ${state.tokens[g].length} 枚${state.tokens[g].length ? `，下一枚 ${state.tokens[g][0]} 卢比` : "，已售罄"}`}
            >
              <span className="counter-name">
                {LABEL[g]}
                {precious(g) && <small>高</small>}
              </span>
              <span className="counter-remaining">
                <small>剩</small>
                <b>{state.tokens[g].length}</b>
              </span>
              <span className="counter-next">
                {state.tokens[g].length ? (
                  <>
                    <small>下枚</small>
                    <b>{state.tokens[g][0]}</b>
                    {state.tokens[g].map((_, i) => (
                      <i
                        key={i}
                        aria-hidden="true"
                        data-motion-fallback={`token-${g}-${i}`}
                      />
                    ))}
                  </>
                ) : (
                  <small>售罄</small>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="supply-bonuses">
          <span>奖励剩余</span>
          {([3, 4, 5] as const).map((n) => (
            <span
              key={n}
              className="supply-bonus"
              data-motion-anchor={`bonus-${n}`}
            >
              {n}
              {n === 5 ? "+" : ""}张 <b>{state.bonus[n].length}</b>枚
            </span>
          ))}
        </div>
      </summary>
      <SupplyDetails state={state} />
    </details>
  );
}

export function SupplyDetails({
  state,
  motionAnchors = true,
  showRewardCards = false,
}: {
  state: State;
  motionAnchors?: boolean;
  showRewardCards?: boolean;
}) {
  return (
    <div className="supply-details">
      <p>筹码从左到右领取；高级货物至少 2 张起售。</p>
      {GOODS.map((g) => (
        <div className={`supply-detail-row ${g}`} key={g}>
          <b>{LABEL[g]}</b>
          <span>
            {state.tokens[g].length
              ? state.tokens[g].map((v, i) => (
                  <i
                    className="coin"
                    data-motion-anchor={
                      motionAnchors ? `token-${g}-${i}` : undefined
                    }
                    key={i}
                  >
                    {v}
                  </i>
                ))
              : "已售罄"}
          </span>
        </div>
      ))}
      {showRewardCards && (
        <div className="supply-reward-summary">
          {([3, 4, 5] as const).map((n) => (
            <section key={n}>
              <b>
                {n}
                {n === 5 ? "+" : ""} 张奖励
              </b>
              <span>剩 {state.bonus[n].length} 枚</span>
              <small>{n === 3 ? "1–3" : n === 4 ? "4–6" : "8–10"} 卢比</small>
            </section>
          ))}
        </div>
      )}
      <p>
        {showRewardCards
          ? "三类货物筹码售罄即收市。驼队更多者在收市时获得 5 卢比。"
          : "批量奖励：3 张 1–3 卢比 · 4 张 4–6 卢比 · 5+ 张 8–10 卢比。驼队更多者在收市时获得 5 卢比。"}
      </p>
    </div>
  );
}
