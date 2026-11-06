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
      element.style.setProperty(
        "--game-viewport-height",
        `${Math.floor(Math.min(window.innerHeight, viewport?.height ?? window.innerHeight))}px`,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
    };
  }, [active]);
  return ref;
}
