import { useLayoutEffect, useRef, useState } from "react";
import { Award, ChevronRight, Info } from "lucide-react";
import { GOODS } from "../game/types.ts";
import type { State } from "../game/types.ts";
import { LABEL, precious } from "../game/data.ts";
import { GoodsArt, PremiumChipRim } from "./Art.tsx";
import { TableNumber } from "./TableNumber.tsx";
import "../chip-groups.css";
export function MobileSupply({
  state,
  onInspect,
  tabletop = false,
}: {
  state: State;
  onInspect: () => void;
  tabletop?: boolean;
}) {
  const panel = useRef<HTMLDetailsElement>(null);
  const [mobile, setMobile] = useState(false);
  useLayoutEffect(() => {
    const desktop = window.matchMedia("(min-width: 861px)");
    const sync = () => {
      setMobile(!desktop.matches);
      if (panel.current) panel.current.open = desktop.matches && !tabletop;
    };
    sync();
    desktop.addEventListener("change", sync);
    return () => desktop.removeEventListener("change", sync);
  }, [tabletop]);
  const depleted = GOODS.filter((g) => !state.tokens[g].length).length;
  return (
    <details
      className={`mobile-supply${tabletop ? " supply-tabletop" : ""}`}
      ref={panel}
    >
      <summary
        title={
          tabletop
            ? "查看筹码盘"
            : mobile
              ? "点击查看完整筹码盘"
              : "点击整个筹码面板，展开或收起明细"
        }
        aria-label={tabletop ? "查看筹码盘" : undefined}
        aria-haspopup={mobile || tabletop ? "dialog" : undefined}
        onClick={(event) => {
          if (mobile || tabletop) {
            event.preventDefault();
            onInspect();
          }
        }}
      >
        <div className="supply-heading">
          <b>{tabletop ? "筹码" : "筹码余量"}</b>
          <span>
            {tabletop ? `售罄 ${depleted}/3` : `${depleted}/3 类售罄即收市`}
          </span>
          <span className="supply-expand">
            {tabletop ? (
              <>
                <Info size={14} aria-hidden="true" />
                <ChevronRight size={14} aria-hidden="true" />
              </>
            ) : mobile ? (
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
              className={`supply-counter ${g} ${precious(g) ? "premium-stock" : ""} ${state.tokens[g].length ? "" : "counter-empty"}`}
              key={g}
              aria-label={`${LABEL[g]}${precious(g) ? "，高级货物" : ""}，剩余 ${state.tokens[g].length} 枚${state.tokens[g].length ? `，下一枚 ${state.tokens[g][0]} 卢比` : "，已售罄"}`}
            >
              <span
                className="counter-quote"
                data-stack={Math.min(3, state.tokens[g].length)}
                data-motion-anchor={tabletop ? `stock-${g}` : undefined}
              >
                {tabletop && precious(g) && <PremiumChipRim />}
                <span
                  className={`counter-name${tabletop ? " stock-good-name" : ""}`}
                  title={
                    precious(g)
                      ? `${LABEL[g]} · 高级货物，至少 2 张起售`
                      : LABEL[g]
                  }
                  aria-hidden="true"
                >
                  <GoodsArt good={g} cardFace />
                  <span>{LABEL[g]}</span>
                </span>
                <span className="counter-next">
                  {tabletop ? (
                    <>
                      <small>
                        下<span className="counter-next-suffix">枚</span>
                      </small>
                      <span className="stock-chip-face" aria-hidden="true">
                        <b>
                          <TableNumber
                            value={
                              state.tokens[g].length ? state.tokens[g][0] : "—"
                            }
                          />
                        </b>
                      </span>
                      {state.tokens[g].map((_, i) => (
                        <i
                          key={i}
                          aria-hidden="true"
                          data-motion-fallback={`token-${g}-${i}`}
                        />
                      ))}
                    </>
                  ) : state.tokens[g].length ? (
                    <>
                      <small>
                        下<span className="counter-next-suffix">枚</span>
                      </small>
                      <b>
                        <TableNumber value={state.tokens[g][0]} />
                      </b>
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
                <span
                  className="counter-remaining"
                  title={`剩余 ${state.tokens[g].length} 枚`}
                  aria-hidden={tabletop || undefined}
                >
                  <small>{tabletop ? "×" : "剩"}</small>
                  <b>
                    <TableNumber value={state.tokens[g].length} />
                  </b>
                </span>
              </span>
            </div>
          ))}
        </div>
        <div
          className={`supply-bonuses${tabletop ? " stock-bonus-bank" : ""}`}
          role={tabletop ? "group" : undefined}
          aria-label={tabletop ? "奖励筹码余量" : undefined}
        >
          {tabletop ? (
            <span className="stock-bonus-label" aria-hidden="true">
              奖励
            </span>
          ) : (
            <span>奖励剩余</span>
          )}
          {([3, 4, 5] as const).map((n) => (
            <span
              key={n}
              className={`supply-bonus${tabletop ? " stock-bonus-group" : ""}`}
              role={tabletop ? "group" : undefined}
              data-motion-anchor={`bonus-${n}`}
              aria-label={
                tabletop
                  ? `${n}${n === 5 ? "张及以上" : "张"}奖励，剩余 ${state.bonus[n].length} 枚`
                  : undefined
              }
            >
              {tabletop ? (
                <>
                  <span
                    className={`stock-bonus-chip stock-bonus-${n}`}
                    data-stack={Math.min(3, state.bonus[n].length)}
                    data-motion-anchor={`bonus-face-${n}`}
                    aria-hidden="true"
                  >
                    <Award size={14} strokeWidth={1.6} />
                    <span className="stock-bonus-tier">
                      <b>
                        {n}
                        {n === 5 ? "+" : ""}
                      </b>
                      <small>张</small>
                    </span>
                    <span
                      className="stock-bonus-count"
                      title={`剩余 ${state.bonus[n].length} 枚`}
                      aria-hidden="true"
                    >
                      <small>×</small>
                      <b>
                        <TableNumber value={state.bonus[n].length} />
                      </b>
                    </span>
                  </span>
                </>
              ) : (
                <>
                  {n}
                  {n === 5 ? "+" : ""}张 <b>{state.bonus[n].length}</b>枚
                </>
              )}
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
                  className={`coin ${precious(good) ? "premium-detail-coin" : ""} ${i === 0 ? "supply-next-coin" : ""}`}
                  key={i}
                  title={i === 0 ? "下一枚" : undefined}
                  data-motion-anchor={
                    motionAnchors ? `token-${good}-${i}` : undefined
                  }
                >
                  {precious(good) ? (
                    <>
                      <PremiumChipRim />
                      <span className="premium-chip-value">{value}</span>
                    </>
                  ) : (
                    value
                  )}
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
