import { useSkin } from "./Skin.tsx";
import {
  ArrowRight,
  ArrowLeftRight,
  Coins,
  GraduationCap,
  Hand,
  Shuffle,
  UserRound,
  Store,
} from "lucide-react";
import type { State } from "../game/types.ts";
import { GAME_GOAL } from "../game/tutorial.ts";
import { useModalDialog } from "../hooks/useModalDialog.ts";

export function TurnIntro({
  state,
  resume,
  onStart,
  onTutorial,
}: {
  state: State;
  resume: boolean;
  onStart: () => void;
  onTutorial?: () => void;
}) {
  const { t } = useSkin();
  const ref = useModalDialog();
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
        第 {state.round} 轮 · {continuing ? "欢迎回来" : t("开市")}
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
            : t("轮到米拉")
          : yours
            ? "你先手"
            : t("米拉先手")}
      </h2>
      <div
        className="turn-intro-order"
        aria-label={`${yours ? "你" : t("米拉")}行动，然后轮到${yours ? t("米拉") : "你"}`}
      >
        <span className="turn-intro-first">
          {yours ? <UserRound /> : <Store />}
          {yours ? "你" : t("米拉")}
        </span>
        <ArrowRight aria-hidden="true" />
        <span>
          {yours ? <Store /> : <UserRound />}
          {yours ? t("米拉") : "你"}
        </span>
      </div>
      <p className="turn-intro-hint" id="turn-intro-hint">
        {onTutorial
          ? t`你和米拉轮流打牌。${t(GAME_GOAL)}`
          : yours
            ? "每回合选一种行动"
            : t("先看米拉行动，随后轮到你")}
      </p>
      {(yours || onTutorial) && (
        <div className="turn-intro-choices">
          <span>
            <Hand size={17} aria-hidden="true" />
            {t("拿牌")}
          </span>
          <span>
            <ArrowLeftRight size={17} aria-hidden="true" />
            {t("换牌")}
          </span>
          <span>
            <Coins size={17} aria-hidden="true" />
            {t("出牌赚卢比")}
          </span>
        </div>
      )}
      <button className="primary" autoFocus onClick={onStart}>
        开始比赛
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {onTutorial && (
        <button className="secondary turn-intro-tutorial" onClick={onTutorial}>
          <GraduationCap size={18} aria-hidden="true" />
          第一次玩？先练一笔
        </button>
      )}
    </dialog>
  );
}
