import { useSkin } from "./Skin.tsx";
import { useEffect, useRef } from "react";
import { ArrowRight, Layers, Store } from "lucide-react";
import { GoodsArt } from "./Art.tsx";
import { roundEndCause } from "../game/round-end-cause.ts";
import type { State } from "../game/types.ts";

export function RoundEndNotice({
  state,
  onContinue,
  tutorial = false,
}: {
  state: State;
  onContinue: () => void;
  tutorial?: boolean;
}) {
  const { t, labels } = useSkin();
  const ref = useRef<HTMLDialogElement>(null);
  const cause = roundEndCause(state)!;
  useEffect(() => {
    const dialog = ref.current!;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (focused?.isConnected) focused.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="turn-intro round-end-notice"
      aria-labelledby="round-end-title"
      aria-describedby="round-end-detail"
      onCancel={(e) => {
        e.preventDefault();
        onContinue();
      }}
    >
      <p className="turn-intro-round">第 {state.round} {t("轮 · 收市")}</p>
      <Store className="round-end-store" size={32} aria-hidden="true" />
      <h2 id="round-end-title">{t(cause.title)}</h2>
      {cause.kind === "tokens" ? (
        <>
          <div
            className="round-end-depleted"
            aria-label={t`售罄：${cause.depleted.map((g) => labels[g]).join("、")}`}
          >
            {cause.depleted.map((g) => (
              <span
                className={`round-end-good ${g}`}
                key={g}
                title={t`${labels[g]}筹码售罄`}
              >
                <GoodsArt good={g} cardFace />
                <span>
                  {labels[g]} <b>×0</b>
                </span>
              </span>
            ))}
          </div>
          <p id="round-end-detail">
            {t("任意三类货物筹码售罄，本轮立即结束。")}
          </p>
        </>
      ) : (
        <>
          <div className="round-end-market" aria-hidden="true">
            <span className="round-end-deck">
              <Layers size={25} />
              <b>{cause.deckCount}</b>
            </span>
            <ArrowRight size={18} />
            <span className="round-end-slots">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  className={i < cause.marketCount ? "filled" : ""}
                  key={i}
                />
              ))}
            </span>
          </div>
          <p id="round-end-detail">
            牌堆 {cause.deckCount} 张 · 市场 {cause.marketCount}/5 张<br />
            {t("无法补齐 5 张，触发收市。")}
          </p>
        </>
      )}
      {tutorial && (
        <p className="round-end-tutorial">
          {t("牌堆无法把市场补满 5 张时，也会立即收市。牌堆空了但市场还有 5 张，本轮继续。")}
        </p>
      )}
      <button className="primary" autoFocus onClick={onContinue}>
        查看计分
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </dialog>
  );
}
