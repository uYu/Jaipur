import { useLayoutEffect, useRef } from "react";

/** Follow the visible area as mobile browser toolbars open and close. */
export function useViewportHeight(active: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      // Pinch zoom should magnify the table, rather than compress its layout.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const available = Math.floor(
        Math.min(window.innerHeight, viewport?.height ?? window.innerHeight),
      );
      element.style.setProperty("--game-viewport-height", `${available}px`);
      // Measure the natural table before redistributing spare portrait height.
      element.style.removeProperty("--table-viewport-height");
      if (!element.classList.contains("viewport-table")) return;
      element.dataset.fit = "ready";
      element.dataset.density = available < 760 ? "compact" : "normal";
      element.style.removeProperty("--fit-market-width");
      element.style.removeProperty("--fit-hand-width");
      const usedHeight = () =>
        element.getBoundingClientRect().height + element.offsetTop;
      if (usedHeight() > available) element.dataset.density = "tight";
      const overflow = usedHeight() - available;
      const market = element.querySelector<HTMLElement>(".market-cards .card");
      const hand = element.querySelector<HTMLElement>(".hand-and-herd");
      if (overflow > 0 && market && hand) {
        const marketBox = market.getBoundingClientRect();
        const handHeight =
          parseFloat(getComputedStyle(hand, "::before").width) * 1.5;
        const scale = Math.max(
          0,
          1 - (overflow + 4) / (marketBox.height + handHeight),
        );
        element.style.setProperty(
          "--fit-market-width",
          `${Math.min(marketBox.width, Math.max(44, marketBox.width * scale))}px`,
        );
        element.style.setProperty(
          "--fit-hand-width",
          `${Math.min(handHeight / 1.5, Math.max(32, (handHeight / 1.5) * scale))}px`,
        );
      }
      // Extremely short/landscape screens keep readable cards and a visible toolbar.
      const controls = element.querySelector<HTMLElement>(".action-panel");
      if (usedHeight() > available + 1 && controls) {
        element.style.setProperty(
          "--action-panel-height",
          `${Math.ceil(controls.getBoundingClientRect().height)}px`,
        );
        element.dataset.fit = "scroll";
      }
      const table = element.querySelector<HTMLElement>(".table-column");
      if (
        element.classList.contains("portrait-table") &&
        element.dataset.fit === "ready" &&
        table
      ) {
        const tableBox = table.getBoundingClientRect();
        const bottomPadding =
          parseFloat(getComputedStyle(element).paddingBottom) || 0;
        const tableHeight = Math.floor(
          available - tableBox.top - window.scrollY - bottomPadding - 8,
        );
        // Let the two seat-to-market gaps grow by at most 16px each.
        // Tall phones should not stretch a compact table into three islands.
        const fittedHeight = Math.min(tableHeight, tableBox.height + 32);
        if (fittedHeight > tableBox.height)
          element.style.setProperty(
            "--table-viewport-height",
            `${fittedHeight}px`,
          );
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    element
      .querySelectorAll(
        ".game-header, .game-overview, .table-column, .action-panel",
      )
      .forEach((node) => observer.observe(node));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      observer.disconnect();
    };
  }, [active]);
  return ref;
}
