import { ChevronDown } from "lucide-react";
import { GOODS } from "../game/types.ts";
import type { State } from "../game/types.ts";
import { LABEL, precious } from "../game/data.ts";
export function MobileSupply({ state }: { state: State }) {
  const depleted = GOODS.filter((g) => !state.tokens[g].length).length;
  return (
    <details className="mobile-supply">
      <summary>
        <div className="supply-heading">
          <b>筹码余量</b>
          <span>{depleted}/3 类售罄即收市</span>
          <span className="supply-expand">
            明细 <ChevronDown size={13} />
          </span>
        </div>
        <div className="supply-grid">
          {GOODS.map((g) => (
            <div
              className={`supply-item ${g} ${state.tokens[g].length ? "" : "supply-empty"}`}
              key={g}
              aria-label={`${LABEL[g]}${precious(g) ? "，高级货物" : ""}，剩余 ${state.tokens[g].length} 枚${state.tokens[g].length ? `，下一枚 ${state.tokens[g][0]} 卢比` : "，已售罄"}`}
            >
              <span className="supply-good">
                {LABEL[g]}
                {precious(g) && <small>高</small>}
              </span>
              <strong>
                {state.tokens[g].length}
                <small>枚</small>
              </strong>
              <span className="supply-next">
                {state.tokens[g].length ? (
                  <>
                    下枚 <b>{state.tokens[g][0]}</b>
                    {state.tokens[g].map((_, i) => (
                      <i
                        key={i}
                        aria-hidden="true"
                        data-motion-anchor={`token-${g}-${i}`}
                      />
                    ))}
                  </>
                ) : (
                  "售罄"
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
      <div className="supply-details">
        <p>筹码从左到右领取；高级货物至少 2 张起售。</p>
        {GOODS.map((g) => (
          <div className={`supply-detail-row ${g}`} key={g}>
            <b>{LABEL[g]}</b>
            <span>
              {state.tokens[g].length
                ? state.tokens[g].map((v, i) => (
                    <i className="coin" key={i}>
                      {v}
                    </i>
                  ))
                : "已售罄"}
            </span>
          </div>
        ))}
        <p>
          批量奖励：3 张 1–3 卢比 · 4 张 4–6 卢比 · 5+ 张 8–10
          卢比。驼队更多者在收市时获得 5 卢比。
        </p>
      </div>
    </details>
  );
}
