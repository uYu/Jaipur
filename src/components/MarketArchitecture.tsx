import { useLayoutEffect, useRef, useState } from "react";
import { useSkin } from "./Skin.tsx";
import {
  marketArchitectureMarkup,
  type MarketArchitectureLayout,
  type MarketArea,
} from "../game/market-architecture.ts";

/** Printed scenery follows the shared layout, independently of piece motion. */
export function MarketArchitecture() {
  const { t } = useSkin();
  const layer = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<MarketArchitectureLayout | null>(null);
  useLayoutEffect(() => {
    const zone = layer.current?.parentElement;
    if (!zone) return;
    let frame = 0;
    const selectors = {
      stock: ".supply-strip",
      bonus: ".stock-bonus-bank",
      market: ".market-cards",
      deck: ".market-deck",
      sale: ".market-sale-pile",
    };
    const measure = () => {
      frame = 0;
      const bounds = zone.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const areas = {} as Record<keyof typeof selectors, MarketArea>;
      for (const key of Object.keys(selectors) as (keyof typeof selectors)[]) {
        const element = zone.querySelector(selectors[key]);
        if (!element) return;
        const r = element.getBoundingClientRect();
        areas[key] = {
          x: r.x - bounds.x,
          y: r.y - bounds.y,
          w: r.width,
          h: r.height,
          right: r.right - bounds.x,
          bottom: r.bottom - bounds.y,
        };
      }
      const next = { width: bounds.width, height: bounds.height, ...areas };
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(zone);
    for (const selector of Object.values(selectors)) {
      const element = zone.querySelector(selector);
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  const bottom = layout ? layout.market.bottom + 17 : 0;
  return (
    <div className="market-architecture" ref={layer} aria-hidden="true">
      {layout && (
        <>
          <svg
            className="market-architecture-art"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            preserveAspectRatio="none"
            dangerouslySetInnerHTML={{
              __html: marketArchitectureMarkup(layout),
            }}
          />
          <span
            className="market-region-label market-region-heading"
            style={{ left: layout.stock.x + 3, top: 7 }}
          >
            {t("货物筹码")}
          </span>
          <span
            className="market-region-label market-region-heading"
            style={{ left: layout.bonus.x + 3, top: 7 }}
          >
            批量奖励
          </span>
          <span
            className="market-region-label market-region-foot"
            style={{ left: layout.deck.x + layout.deck.w / 2, top: bottom }}
          >
            牌堆
          </span>
          <span
            className="market-region-label market-region-foot market-region-title"
            style={{ left: layout.market.x + layout.market.w / 2, top: bottom }}
          >
            公共市场
          </span>
          <span
            className="market-region-label market-region-foot"
            style={{ left: layout.sale.x + layout.sale.w / 2, top: bottom }}
          >
            收货
          </span>
        </>
      )}
    </div>
  );
}
