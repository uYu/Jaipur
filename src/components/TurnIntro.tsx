import { useEffect, useRef } from "react";
import {
  ArrowRight,
  ArrowLeftRight,
  Coins,
  Hand,
  Shuffle,
  UserRound,
  Store,
} from "lucide-react";
import type { State } from "../game/types.ts";

export function TurnIntro({
  state,
  resume,
  onStart,
}: {
  state: State;
  resume: boolean;
  onStart: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const yours = state.current === 0;
  const continuing = resume && state.turn > 0;
  const previous = state.results.at(-1);
  const reason = continuing
    ? `第 ${state.turn + 1} 手 · 继续对局`
    : state.round === 1
      ? "首轮随机决定先手"
      : previous?.winner === null
        ? "上轮平局 · 轮换先手"
        : "上轮落败者先手";
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
      className="turn-intro"
      aria-labelledby="turn-intro-title"
      aria-describedby="turn-intro-reason turn-intro-hint"
      onCancel={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      <p className="turn-intro-round">
        第 {state.round} 轮 · {continuing ? "欢迎回来" : "开市"}
      </p>
      <p className="turn-intro-reason" id="turn-intro-reason">
        {!continuing && state.round === 1 && (
          <Shuffle size={15} aria-hidden="true" />
        )}
        {reason}
      </p>
      <h2 id="turn-intro-title">
        {continuing
          ? yours
            ? "轮到你了"
            : "轮到米拉"
          : yours
            ? "你先手"
            : "米拉先手"}
      </h2>
      <div
        className="turn-intro-order"
        aria-label={`${yours ? "你" : "米拉"}行动，然后轮到${yours ? "米拉" : "你"}`}
      >
        <span className="turn-intro-first">
          {yours ? <UserRound /> : <Store />}
          {yours ? "你" : "米拉"}
        </span>
        <ArrowRight aria-hidden="true" />
        <span>
          {yours ? <Store /> : <UserRound />}
          {yours ? "米拉" : "你"}
        </span>
      </div>
      <p className="turn-intro-hint" id="turn-intro-hint">
        {yours ? "每回合选一种行动" : "先看米拉行动，随后轮到你"}
      </p>
      {yours && (
        <div className="turn-intro-choices">
          <span>
            <Hand size={17} aria-hidden="true" />
            拿牌
          </span>
          <span>
            <ArrowLeftRight size={17} aria-hidden="true" />
            换货
          </span>
          <span>
            <Coins size={17} aria-hidden="true" />
            卖货
          </span>
        </div>
      )}
      <button className="primary" autoFocus onClick={onStart}>
        {yours ? "开始行动" : "看米拉行动"}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </dialog>
  );
}
