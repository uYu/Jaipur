import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";

export function GameMenu({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node))
        panel.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel.current?.open) {
        panel.current.open = false;
        panel.current.querySelector("summary")?.focus();
        event.preventDefault();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return (
    <details
      className="mobile-game-menu"
      ref={panel}
      onClick={(event) => {
        if ((event.target as Element).closest("button") && panel.current) {
          panel.current.open = false;
          panel.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="游戏菜单">
        <Menu size={17} aria-hidden="true" />
        <span>菜单</span>
      </summary>
      <nav aria-label="游戏功能">{children}</nav>
    </details>
  );
}
