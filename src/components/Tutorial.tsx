import { useSkin } from "./Skin.tsx";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Coins,
  Hand,
  Store,
  Trophy,
  X,
} from "lucide-react";
import {
  GAME_GOAL,
  TUTORIAL_EXCHANGE_PAYMENTS,
  TUTORIAL_LESSONS,
} from "../game/tutorial.ts";
import { sum } from "../game/data.ts";
import { useModalDialog } from "../hooks/useModalDialog.ts";
import type { State } from "../game/types.ts";
import { PixelArt } from "./PixelArt.tsx";

const lessonIcons = { take: Hand, sell: Coins, exchange: ArrowLeftRight };

export function TutorialIntro({
  onStart,
  onExit,
}: {
  onStart: () => void;
  onExit: () => void;
}) {
  const { t } = useSkin();
  const ref = useModalDialog();
  return (
    <dialog
      ref={ref}
      className="turn-intro tutorial-intro"
      aria-labelledby="tutorial-intro-title"
      aria-describedby="tutorial-intro-goal"
      onCancel={(event) => {
        event.preventDefault();
        onExit();
      }}
    >
      <p className="turn-intro-round">{t("斋普尔 · 新手练习")}</p>
      <h2 id="tutorial-intro-title">这局怎么赢</h2>
      <p id="tutorial-intro-goal">
        <Trophy size={18} aria-hidden="true" />
        {t(GAME_GOAL)}
      </p>
      <p className="turn-intro-hint">{t("你和米拉轮流打牌，每回合选一种行动。")}</p>
      <div className="turn-intro-choices">
        <span>
          <Hand size={16} aria-hidden="true" />
          {t("拿牌")}
        </span>
        <span>
          <ArrowLeftRight size={16} aria-hidden="true" />
          {t("换牌")}
        </span>
        <span>
          <Coins size={16} aria-hidden="true" />
          {t("卖牌赚卢比")}
        </span>
      </div>
      <button className="primary" autoFocus onClick={onStart}>
        开始练习
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <button className="secondary turn-intro-tutorial" onClick={onExit}>
        返回
      </button>
    </dialog>
  );
}

export function Tutorial({
  step,
  state,
  paymentIndex,
  paymentCompleted,
  receipt,
  returningToMatch,
  onExit,
  onComplete,
}: {
  step: number;
  state: State;
  paymentIndex: number;
  paymentCompleted: boolean;
  receipt?: string;
  returningToMatch: boolean;
  onExit: () => void;
  onComplete: () => void;
}) {
  const { t, labels } = useSkin();
  const lesson = TUTORIAL_LESSONS[step];
  const LessonIcon = lesson?.closingGood
    ? Store
    : lesson && lesson.action !== "camels"
      ? lessonIcons[lesson.action]
      : null;
  const payment = lesson?.exchangePayment;
  const incoming =
    payment && lesson.example !== "camel" ? lesson.example : null;
  const paymentCamels = TUTORIAL_EXCHANGE_PAYMENTS[paymentIndex].camels;
  const paymentCards = 2 - paymentCamels;
  const saleValue = incoming ? sum(state.tokens[incoming].slice(0, 3)) : 0;
  return (
    <section
      className="tutorial-practice tutorial-lesson"
      aria-label="新手练习"
    >
      <div>
        <h2
          aria-label={
            lesson
              ? `练习 ${step + 1}/${TUTORIAL_LESSONS.length} ${t(lesson.title)}`
              : undefined
          }
        >
          {lesson ? (
            <>
              <span
                className="tutorial-lesson-icon"
                title={t(lesson.title)}
                aria-hidden="true"
              >
                {LessonIcon ? (
                  <LessonIcon size={19} />
                ) : (
                  <PixelArt name="camel" />
                )}
              </span>
              {t(lesson.title)}
              <small>
                {step + 1}/{TUTORIAL_LESSONS.length}
              </small>
            </>
          ) : (
            "练习完成"
          )}
        </h2>
      </div>
      {lesson ? (
        <button className="secondary" onClick={onExit}>
          <X size={15} aria-hidden="true" />
          退出练习
        </button>
      ) : (
        <button className="primary" onClick={onComplete}>
          {returningToMatch ? "返回对局" : t("正式开市")}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
      <div className="tutorial-detail" aria-live="polite">
        {payment && incoming ? (
          <div className="tutorial-exchange">
            <ol className="tutorial-payment-progress" aria-label={t("三种换牌方式")}>
              {TUTORIAL_EXCHANGE_PAYMENTS.map(({ label }, index) => {
                const complete =
                  index < paymentIndex ||
                  (index === paymentIndex && paymentCompleted);
                return (
                  <li
                    key={t(label)}
                    aria-current={index === paymentIndex ? "step" : undefined}
                    data-complete={complete}
                  >
                    {complete ? (
                      <Check size={13} aria-label="已完成" />
                    ) : (
                      <span aria-hidden="true">{index + 1}</span>
                    )}
                    {t(label)}
                  </li>
                );
              })}
            </ol>
            {receipt ? (
              <p>{receipt}</p>
            ) : (
              <div
                className="tutorial-exchange-example"
                role="img"
                aria-label={t`付出 ${paymentCards} 张${labels[payment]}和 ${paymentCamels} 头骆驼。换入两张${labels[incoming]}，凑成三张，可卖 ${saleValue} 卢比，另加批量奖励。`}
              >
                <span>
                  {paymentCards > 0 && (
                    <>
                      <PixelArt name={payment} />×{paymentCards}
                    </>
                  )}
                  {paymentCamels > 0 && (
                    <>
                      {paymentCards > 0 && "+"}
                      <PixelArt name="camel" />×{paymentCamels}
                    </>
                  )}
                </span>
                <ArrowRight size={18} aria-hidden="true" />
                <span>
                  <PixelArt name={incoming} />
                  ×2
                </span>
                <strong>{t("卖 3 张得")} {saleValue} {t("卢比＋奖励")}</strong>
              </div>
            )}
          </div>
        ) : (
          <p>
            {lesson
              ? (receipt ?? t(lesson.text))
              : t("拿货、卖货、收骆驼、换货和收市计分都练过了。")}
          </p>
        )}
      </div>
    </section>
  );
}
