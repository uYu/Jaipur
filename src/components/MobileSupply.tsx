import { useLayoutEffect, useRef, useState } from "react";
import { GOODS } from "../game/types.ts";
import type { State } from "../game/types.ts";
import { LABEL } from "../game/data.ts";
import { GoodsArt } from "./Art.tsx";
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
              <span
                className="counter-name"
                title={LABEL[g]}
                aria-hidden="true"
              >
                <GoodsArt good={g} cardFace />
                <span>{LABEL[g]}</span>
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
      <p>左起领取 · 高级货物至少2张起售</p>
      {GOODS.map((good) => (
        <div
          className={`supply-detail-row ${good} ${state.tokens[good].length ? "" : "supply-detail-empty"}`}
          key={good}
        >
          <b>{LABEL[good]}</b>
          <span>
            {state.tokens[good].length ? (
              state.tokens[good].map((value, i) => (
                <i
                  className={`coin ${i === 0 ? "supply-next-coin" : ""}`}
                  key={i}
                  title={i === 0 ? "下一枚" : undefined}
                  data-motion-anchor={
                    motionAnchors ? `token-${good}-${i}` : undefined
                  }
                >
                  {value}
                </i>
              ))
            ) : (
              <span className="supply-sold-out">已售罄</span>
            )}
          </span>
        </div>
      ))}
      {showRewardCards && (
        <div className="supply-reward-summary">
          {([3, 4, 5] as const).map((n) => (
            <section key={n}>
              <b>
                {n}
                {n === 5 ? "+" : ""}张奖励
              </b>
              <span>
                剩 <strong>{state.bonus[n].length}</strong> 枚
              </span>
              <small>{n === 3 ? "1–3" : n === 4 ? "4–6" : "8–10"} 卢比</small>
            </section>
          ))}
        </div>
      )}
      <p>
        {showRewardCards
          ? "三类售罄收市 · 驼队领先 +5卢比"
          : "批量奖励：3张 1–3 · 4张 4–6 · 5+张 8–10卢比。驼队领先 +5卢比。"}
      </p>
    </div>
  );
}
