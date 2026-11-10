import { SkinSwitch, useSkin } from "./components/Skin.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Coins,
  ChevronLeft,
  ChevronRight,
  History,
  GraduationCap,
  Home,
  Play,
  Plus,
  Search,
  Settings,
  Store,
  X,
} from "lucide-react";
import type {
  Action,
  Difficulty,
  Event,
  InformationMode,
  Save,
  State,
} from "./game/types.ts";
import { AI_MIN_THINKING_MS } from "./game/ai-config.ts";
import { DIFFICULTY_NAME, opponentPolicy } from "./game/difficulty.ts";
import { applyAction, newGame } from "./game/engine.ts";
import {
  emptySelection,
  selectMarket,
  selectHand,
  selectCamels,
  selectedAction,
} from "./game/selection.ts";
import { chooseAction, observe } from "./game/ai.ts";
import { dmcEventHistory } from "./game/dmc-history.ts";
import { advance, parseSave, replay, SAVE_KEY } from "./game/storage.ts";
import { JaipurMark } from "./components/Art.tsx";
import { Card } from "./components/Card.tsx";
import { MobileSupply, SupplyDetails } from "./components/MobileSupply.tsx";
import { MarketArchitecture } from "./components/MarketArchitecture.tsx";
import {
  OpponentSeat,
  PlayerReserve,
  ScoreDetails,
} from "./components/PlayerScores.tsx";
import { ResultDialog, resultTitle } from "./components/ResultDialog.tsx";
import { TurnIntro } from "./components/TurnIntro.tsx";
import { RoundEndNotice } from "./components/RoundEndNotice.tsx";
import { NumberMotion, TableNumber } from "./components/TableNumber.tsx";
import { numberFrames } from "./game/number-frames.ts";
import { sum } from "./game/data.ts";
import { actionSummaries } from "./game/receipts.ts";
import { LastActions } from "./components/LastActions.tsx";
import { PlayerLastAction } from "./components/PlayerLastAction.tsx";
import { ReplayValueChart } from "./components/ReplayValueChart.tsx";
import { replayBoardIndex } from "./game/replay-position.ts";
import type { ReplayMoment } from "./game/replay-position.ts";
import { ActionHistory } from "./components/ActionHistory.tsx";
import { ActionAnimation } from "./components/ActionAnimation.tsx";
import { actionTransition, dealTransition } from "./game/action-transition.ts";
import type { ActionTransition } from "./game/action-transition.ts";
import { initialMarketSlots, nextMarketSlots } from "./game/market-layout.ts";
import { marketSlotsAt } from "./game/opponent-turn.ts";
import type { BoardFeedback } from "./game/action-feedback.ts";
import { Rules } from "./components/Rules.tsx";
import { Tutorial, TutorialIntro } from "./components/Tutorial.tsx";
import { ActionOverview, ActionPanel } from "./components/ActionPanel.tsx";
import { PixelArt } from "./components/PixelArt.tsx";
import { actionCaption } from "./game/presentation.ts";
import {
  createTutorialSave,
  TUTORIAL_EXCHANGE_PAYMENTS,
  TUTORIAL_LESSONS,
  tutorialAccepts,
  tutorialTapTarget,
} from "./game/tutorial.ts";
import type { Selection } from "./game/selection.ts";
import { readPreferences, writePreferences } from "./game/preferences.ts";
import { useReducedMotion } from "./hooks/useReducedMotion.ts";
import { useViewportHeight } from "./hooks/useViewportHeight.ts";
import { useMobileLayout } from "./hooks/useMobileLayout.ts";
import { opponentMemory } from "./game/opponent-memory.ts";
const menuIllustration = new URL(
  "./assets/jaipur-palace-camel-v2.jpg",
  import.meta.url,
).href;
const menuMobileIllustration = new URL(
  "./assets/jaipur-pixel-bazaar.jpg",
  import.meta.url,
).href;
const MOTION_PREFERENCE_KEY = "jaipur.reduce-motion";
function initialSave(): { save: Save | null; error: string } {
  try {
    const data = localStorage.getItem(SAVE_KEY);
    return { save: data ? parseSave(data) : null, error: "" };
  } catch {
    return {
      save: null,
      error: "无法读取本地存档。你仍可开始新比赛或导入备份。",
    };
  }
}
function DifficultySelect({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  const { t } = useSkin();
  return (
    <select
      aria-label="AI 难度"
      value={value}
      onChange={(e) => onChange(e.target.value as Difficulty)}
    >
      <option value="easy">{t("入门 · 学徒商人")}</option>
      <option value="normal">{t("中等 · 资深商人")}</option>
      <option value="hard">{t("高难 · 集市大师")}</option>
    </select>
  );
}
export default function App({
  animationSpeed = 1.1,
}: {
  animationSpeed?: number;
}) {
  const copy = useSkin();
  const { skin, t } = copy;
  const hardware = skin === "hardware";
  const systemReducedMotion = useReducedMotion();
  const [lessMotion, setLessMotion] = useState(() => {
    try {
      return localStorage.getItem(MOTION_PREFERENCE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const reducedMotion = systemReducedMotion || lessMotion;
  const [initial] = useState(initialSave),
    [save, setSave] = useState<Save | null>(initial.save);
  const [game, setGame] = useState(() =>
    initial.save ? replay(initial.save) : null,
  );
  const [screen, setScreen] = useState<"menu" | "game" | "replay" | "tutorial">(
    "menu",
  );
  const mobile = useMobileLayout();
  const teaching = screen === "tutorial";
  const bazaar = mobile && (screen === "game" || teaching);
  const boardRef = useViewportHeight(screen !== "menu" && !bazaar);
  const [tutorialSave, setTutorialSave] = useState(createTutorialSave);
  const [tutorialFromGame, setTutorialFromGame] = useState(false);
  const [tutorialStarted, setTutorialStarted] = useState(false);
  const [tutorialPaymentIndex, setTutorialPaymentIndex] = useState(0);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialInterlude, setTutorialInterlude] = useState<
    "cover" | "reveal" | null
  >(null);
  const [tutorialScores, setTutorialScores] = useState(false);
  const [tutorialSlots, setTutorialSlots] = useState(initialMarketSlots);
  const tutorialState = useMemo(() => replay(tutorialSave), [tutorialSave]);
  const tutorialLesson = TUTORIAL_LESSONS[tutorialStep];
  const tutorialPayment = TUTORIAL_EXCHANGE_PAYMENTS[tutorialPaymentIndex];
  const hasNextPayment =
    !!tutorialLesson?.exchangePayment &&
    tutorialPaymentIndex + 1 < TUTORIAL_EXCHANGE_PAYMENTS.length;
  const nextTutorialStep = hasNextPayment ? tutorialStep : tutorialStep + 1;
  const nextTutorialPaymentIndex = hasNextPayment
    ? tutorialPaymentIndex + 1
    : 0;
  const interludeLesson =
    tutorialInterlude === "cover"
      ? TUTORIAL_LESSONS[nextTutorialStep]
      : tutorialLesson;
  const interludePaymentIndex =
    tutorialInterlude === "cover"
      ? nextTutorialPaymentIndex
      : tutorialPaymentIndex;
  const tutorialHasTrade =
    tutorialSave.events.length > (tutorialLesson?.setup?.length ?? 0);
  const [dismissedResult, setDismissedResult] = useState("");
  const [explainedResult, setExplainedResult] = useState("");
  const [inspectResult, setInspectResult] = useState(false);
  const [menu, setMenu] = useState<"home" | "new">("home");
  const [modal, setModal] = useState<
    "rules" | "log" | "supply" | "scores" | "settings" | null
  >(null);
  const [preferences] = useState(readPreferences);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    preferences.difficulty,
  );
  const [targetSeals, setTargetSeals] = useState<1 | 2>(
    preferences.targetSeals,
  );
  const [informationMode, setInformationMode] = useState<InformationMode>(
    preferences.informationMode,
  );
  useEffect(() => {
    writePreferences({ difficulty, targetSeals, informationMode });
  }, [difficulty, targetSeals, informationMode]);
  const [error, setError] = useState(initial.error),
    [aiError, setAiError] = useState(""),
    [retry, setRetry] = useState(0);
  const [transition, setTransition] = useState<ActionTransition | null>(null);
  const [turnIntro, setTurnIntro] = useState<"round" | "resume" | null>(null);
  const [numberFrame, setNumberFrame] = useState<{
    transition: ActionTransition;
    index: number;
  } | null>(null);
  const [marketNotice, setMarketNotice] = useState<BoardFeedback | null>(null);
  const [marketSlots, setMarketSlots] = useState(() =>
    marketSlotsAt(initial.save),
  );
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayMoment, setReplayMoment] = useState<ReplayMoment>("before");
  const replayViewedIndex = replayBoardIndex(replayIndex, replayMoment);
  const replayAnimating =
    screen === "replay" && transition?.replayTarget !== undefined;
  const animationPaused = !!modal;
  const transitionRemaining = useRef(0);
  useEffect(() => {
    if (!transition || screen === "menu" || animationPaused) return;
    const started = Date.now();
    const timer = setTimeout(() => {
      setTransition(null);
      if (transition.replayTarget !== undefined && screen === "replay")
        setReplayIndex(transition.replayTarget);
    }, transitionRemaining.current);
    return () => {
      clearTimeout(timer);
      transitionRemaining.current = Math.max(
        0,
        transitionRemaining.current - (Date.now() - started),
      );
    };
  }, [transition, screen, animationPaused]);
  useEffect(() => {
    if (!marketNotice || transition || animationPaused || screen === "menu")
      return;
    const timer = setTimeout(() => setMarketNotice(null), 2200);
    return () => clearTimeout(timer);
  }, [marketNotice, transition, animationPaused, screen]);
  const [selection, setSelection] = useState(emptySelection);
  const { market, hand } = selection;
  const shownSave = teaching ? tutorialSave : save;
  const shownEventLimit =
    transition && screen !== "menu"
      ? transition.eventLimit
      : screen === "replay"
        ? replayViewedIndex
        : (shownSave?.events.length ?? 0);
  const { receipts, history, lastActions, lastTurns, latestActor } = useMemo(
    () => actionSummaries(shownSave, shownEventLimit, screen === "replay"),
    [shownSave, shownEventLimit, screen],
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen, menu]);
  const closeRef = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!save) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      setError("自动保存失败，请保持页面打开，以免丢失进度。");
    }
  }, [save]);
  const clear = () => {
    setSelection(emptySelection());
  };
  const commit = (event: Event) => {
    if (!game || !save || transition) return;
    try {
      const next = advance(game, event);
      if (event.type !== "next") {
        const nextTransition = actionTransition(
          game,
          event,
          next,
          marketSlots,
          save.events.length,
          { mobile: true, reduced: reducedMotion, speed: animationSpeed },
        );
        transitionRemaining.current = nextTransition.duration;
        setTransition(nextTransition);
        setMarketNotice(nextTransition.feedback!);
        setMarketSlots(nextMarketSlots(game, event, next, marketSlots));
      } else {
        animateDeal(next, save.events.length + 1);
        setTurnIntro("round");
      }
      setGame(next);
      setSave({ ...save, events: [...save.events, event] });
      clear();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (
      screen !== "game" ||
      !game ||
      game.phase !== "playing" ||
      game.current !== 1 ||
      modal ||
      aiError ||
      turnIntro ||
      transition
    )
      return;
    const worker = new Worker(new URL("./game/ai.worker.ts", import.meta.url), {
      type: "module",
    });
    const activeDifficulty = save?.difficulty ?? difficulty;
    const usesModel = opponentPolicy(activeDifficulty) === "model";
    let active = true;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    worker.onmessage = (e) => {
      if (!active) return;
      if (e.data.error) {
        setAiError(e.data.error);
        return;
      }
      timer = setTimeout(
        () => {
          if (active) commit(e.data.action);
        },
        Math.max(0, AI_MIN_THINKING_MS - (Date.now() - started)),
      );
    };
    worker.onerror = () => {
      if (active) setAiError("米拉暂时无法完成思考，请重试。");
    };
    worker.postMessage({
      observation: observe(game, save?.events, usesModel ? 0.75 : false),
      history:
        usesModel && save
          ? dmcEventHistory(save.seed, save.events, game.current)
          : undefined,
      difficulty: activeDifficulty,
    });
    return () => {
      active = false;
      clearTimeout(timer);
      worker.terminate();
    };
    // A fresh worker receives only the acting player's observation for each committed turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    game,
    screen,
    modal,
    retry,
    aiError,
    transition,
    turnIntro,
    animationSpeed,
  ]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, a, input, select, [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [modal]);
  const viewed = useMemo(
    () =>
      screen === "tutorial"
        ? (transition?.before ?? tutorialState)
        : screen === "replay" && save
          ? (transition?.before ?? replay(save, replayViewedIndex))
          : screen === "game" && transition
            ? transition.before
            : game,
    [screen, save, replayViewedIndex, game, transition, tutorialState],
  );
  const resultKey = viewed
    ? `${viewed.seed}:${viewed.round}:${viewed.phase}`
    : "";
  const frames = useMemo(
    () => (transition ? numberFrames(transition) : []),
    [transition],
  );
  const numberCheckpoints = useMemo(
    () => frames.map((frame) => frame.at),
    [frames],
  );
  const numberState =
    transition && numberFrame?.transition === transition
      ? (frames[numberFrame.index]?.state ?? viewed)
      : viewed;
  const memory = useMemo(
    () =>
      screen === "game" && save?.informationMode === "assisted" && viewed
        ? opponentMemory(history, viewed.round, viewed.players[1].hand.length)
        : undefined,
    [screen, save?.informationMode, history, viewed],
  );
  const numberMemory =
    memory && viewed && numberState
      ? {
          ...memory,
          camels:
            memory.camels +
            numberState.players[1].camels -
            viewed.players[1].camels,
          goods:
            memory.goods +
            sum(numberState.players[1].goods) -
            sum(viewed.players[1].goods),
        }
      : memory;
  const showResult =
    !!viewed &&
    viewed.phase !== "playing" &&
    !transition &&
    !modal &&
    ((teaching && !!tutorialLesson?.closingGood) ||
      (screen === "game" && dismissedResult !== resultKey) ||
      (screen === "replay" && inspectResult));
  const showEndNotice =
    showResult &&
    (teaching
      ? !tutorialScores
      : screen === "game" && explainedResult !== resultKey);
  const closeResult = () => {
    if (teaching) {
      setTutorialStep(TUTORIAL_LESSONS.length);
      return;
    }
    setDismissedResult(resultKey);
    setInspectResult(false);
  };
  const openPostGameMenu = (page: "home" | "new") => {
    setInspectResult(false);
    setTransition(null);
    setMarketNotice(null);
    clear();
    setMenu(page);
    setScreen("menu");
  };
  function beginTutorial() {
    if (!teaching) setTutorialFromGame(screen === "game");
    setTutorialSave(createTutorialSave());
    setTutorialStarted(false);
    setTutorialPaymentIndex(0);
    setTutorialStep(0);
    setTutorialInterlude(null);
    setTutorialScores(false);
    setTutorialSlots(initialMarketSlots());
    setTransition(null);
    setMarketNotice(null);
    setModal(null);
    clear();
    setScreen("tutorial");
  }
  function leaveTutorial(completed = false) {
    setTransition(null);
    setTutorialInterlude(null);
    setMarketNotice(null);
    clear();
    if (tutorialFromGame) {
      setTurnIntro(null);
      setScreen("game");
    } else {
      setMenu(completed ? "new" : "home");
      setScreen("menu");
    }
  }
  function selectCards(next: Selection) {
    setMarketNotice(null);
    setSelection(next);
  }
  const playTutorialAction = useCallback(
    (action: Action) => {
      const before = tutorialState;
      const next = applyAction(before, action);
      const nextTransition = actionTransition(
        before,
        action,
        next,
        tutorialSlots,
        tutorialSave.events.length,
        { mobile: true, reduced: reducedMotion, speed: animationSpeed },
      );
      transitionRemaining.current = nextTransition.duration;
      setTransition(nextTransition);
      setMarketNotice(nextTransition.feedback!);
      setTutorialSlots(nextMarketSlots(before, action, next, tutorialSlots));
      setTutorialSave((previous) => ({
        ...previous,
        events: [...previous.events, action],
      }));
      setSelection(emptySelection());
    },
    [
      tutorialState,
      tutorialSlots,
      tutorialSave.events.length,
      reducedMotion,
      animationSpeed,
    ],
  );
  function commitTutorial(action: Action) {
    if (
      !transition &&
      !modal &&
      tutorialLesson &&
      !tutorialHasTrade &&
      tutorialAccepts(tutorialLesson, action, tutorialPayment.camels)
    )
      playTutorialAction(action);
  }
  useEffect(() => {
    if (!teaching || transition || modal) return;
    if (tutorialInterlude === "reveal") {
      document
        .querySelector(".tutorial-practice")
        ?.scrollIntoView({ block: "nearest" });
      const timer = setTimeout(() => setTutorialInterlude(null), 850);
      return () => clearTimeout(timer);
    }
    if (tutorialInterlude === "cover") {
      const timer = setTimeout(() => {
        const nextSave = createTutorialSave(nextTutorialStep);
        setTutorialStep(nextTutorialStep);
        setTutorialPaymentIndex(nextTutorialPaymentIndex);
        setTutorialSave(nextSave);
        setTutorialSlots(marketSlotsAt(nextSave));
        setMarketNotice(null);
        setTutorialInterlude("reveal");
      }, 240);
      return () => clearTimeout(timer);
    }
    if (tutorialHasTrade && tutorialLesson && !tutorialLesson.closingGood) {
      const timer = setTimeout(() => {
        if (tutorialState.phase === "playing" && tutorialState.current === 1) {
          playTutorialAction(chooseAction(observe(tutorialState), "easy"));
        } else {
          setTutorialInterlude("cover");
        }
      }, 1250);
      return () => clearTimeout(timer);
    }
  }, [
    teaching,
    transition,
    modal,
    tutorialInterlude,
    nextTutorialStep,
    nextTutorialPaymentIndex,
    tutorialHasTrade,
    tutorialLesson,
    tutorialState,
    playTutorialAction,
  ]);
  function animateDeal(state: State, eventLimit = 0) {
    setMarketNotice(null);
    const nextTransition = dealTransition(state, eventLimit, {
      mobile: true,
      reduced: reducedMotion,
      speed: animationSpeed,
    });
    transitionRemaining.current = nextTransition.duration;
    setTransition(nextTransition);
    setMarketSlots(initialMarketSlots());
  }
  function seekReplay(index: number) {
    setReplayMoment("before");
    setTransition(null);
    setMarketNotice(null);
    setInspectResult(false);
    setReplayIndex(
      Math.max(0, Math.min(save?.events.length ?? 0, Math.trunc(index))),
    );
    clear();
  }
  function openFinishedReplay() {
    if (game?.phase !== "finished" || !save?.events.length) return;
    seekReplay(0);
    setScreen("replay");
  }
  function start() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const fresh: Save = {
      version: 1,
      seed,
      difficulty,
      targetSeals,
      informationMode,
      events: [],
    };
    setDismissedResult("");
    setExplainedResult("");
    const freshGame = newGame(seed, targetSeals);
    animateDeal(freshGame);
    setTurnIntro("round");
    setSave(fresh);
    setGame(freshGame);
    setScreen("game");
    setMenu("home");
    setAiError("");
    clear();
  }
  const p = viewed?.players[0];
  const replayMarketSlots = useMemo(
    () => (screen === "replay" ? marketSlotsAt(save, replayViewedIndex) : []),
    [screen, save, replayViewedIndex],
  );
  const visibleMarketSlots =
    transition?.marketSlots ??
    (screen === "replay"
      ? replayMarketSlots
      : teaching
        ? tutorialSlots
        : marketSlots);
  const active =
    (screen === "game" ||
      (teaching &&
        tutorialStarted &&
        !!tutorialLesson &&
        !tutorialHasTrade &&
        !tutorialInterlude)) &&
    viewed?.phase === "playing" &&
    viewed.current === 0 &&
    !modal &&
    (screen !== "game" || !turnIntro) &&
    !transition;
  const opening = screen === "game" && viewed?.round === 1 && viewed.turn <= 1;
  const showOpeningHint =
    opening && active && !market.length && !hand.length && !selection.camels;
  const tutorialTap =
    teaching && active && tutorialLesson && viewed
      ? tutorialTapTarget(
          tutorialLesson,
          viewed,
          selection,
          tutorialPayment.camels,
        )
      : null;
  const tutorialReceipt =
    teaching &&
    tutorialHasTrade &&
    (!transition || transition.action.actor === 1) &&
    latestActor !== null
      ? lastActions[latestActor]
      : null;
  const tutorialCaption = tutorialReceipt
    ? tutorialReceipt.actor === 1
      ? t`米拉${actionCaption(tutorialReceipt, copy)}`
      : tutorialReceipt.type === "sell"
        ? `你得了 ${sum(tutorialReceipt.coins) + (typeof tutorialReceipt.bonus === "number" ? tutorialReceipt.bonus : 0)} 分。${typeof tutorialReceipt.bonus === "number" ? `其中 ${tutorialReceipt.bonus} 分是批量奖励。` : ""}`
        : actionCaption(tutorialReceipt, copy)
    : undefined;
  function cardFeedback(anchor: string) {
    if (transition) {
      const departure = transition.feedback?.departures.find(
        (item) => item.anchor === anchor,
      );
      return departure ? { departing: true } : {};
    }
    if (
      marketNotice?.round !== viewed?.round ||
      marketNotice?.turn !== viewed?.turn
    )
      return {};
    if (
      anchor.startsWith("market-") &&
      marketNotice?.addedSlots.includes(Number(anchor.slice(7)))
    )
      return { arriving: true };
    if (
      anchor.startsWith("hand-") &&
      marketNotice?.handArrivals.includes(Number(anchor.slice(5)))
    )
      return { arriving: true };
    return {};
  }
  const { action } =
    viewed && active ? selectedAction(viewed, selection) : { action: null };
  const turnStatus =
    screen === "replay"
      ? transition
        ? "正在重放…"
        : "比赛回放"
      : viewed?.phase !== "playing"
        ? t("本轮已收市")
        : transition
          ? transition.kind === "deal"
            ? "正在发牌…"
            : `${transition.action.actor === 0 ? "你" : t("米拉")}正在行动…`
          : teaching
            ? !tutorialStarted
              ? "开始练习后可选牌"
              : tutorialHasTrade || tutorialInterlude
                ? viewed.current === 1
                  ? t("轮到米拉")
                  : "本笔已成交"
                : "选好后确认"
            : aiError
              ? "等待重试"
              : screen === "game" && turnIntro
                ? t("等待开市")
                : viewed.current === 1
                  ? t("米拉正在思考…")
                  : "轮到你了";
  const hasUnfinishedGame = !!game && game.phase !== "finished";
  const brand = (
    <div className="brand">
      <span className="brand-icon">
        <JaipurMark />
      </span>
      <b>{t("斋普尔")}</b>
    </div>
  );
  function returnToMenu() {
    if (teaching) {
      leaveTutorial();
      return;
    }
    setScreen("menu");
    setMenu("home");
    if (screen === "replay") {
      setTransition(null);
      setMarketNotice(null);
      clear();
    }
  }
  const returnToMenuButton = (
    <button
      className="return-to-menu"
      title={
        teaching && tutorialFromGame
          ? "退出教程，返回对局"
          : "返回主菜单，保留当前对局"
      }
      aria-label={teaching && tutorialFromGame ? "返回对局" : "返回菜单"}
      onClick={returnToMenu}
    >
      <Home size={19} aria-hidden="true" />
      <span>返回</span>
    </button>
  );
  const actionLedger = viewed ? (
    <LastActions
      actions={lastActions}
      turns={lastTurns}
      latestActor={latestActor}
      settled={!transition}
      status={turnStatus}
      turnNumber={viewed.phase === "playing" ? viewed.turn + 1 : viewed.turn}
      active={active}
      paused={animationPaused}
      onHistory={() => setModal("log")}
      focusOpponent
    />
  ) : null;
  const actionPanel =
    viewed?.phase === "playing" && p && (screen === "game" || teaching) ? (
      <ActionPanel
        state={viewed}
        selection={selection}
        active={active}
        separateOverview={bazaar}
        hint={
          showOpeningHint
            ? t("市场拿货、手牌卖货，或等量换货。选好后确认。")
            : undefined
        }
        status={turnStatus}
        thinking={!teaching && viewed.current === 1 && !transition && !aiError}
        settling={!!transition}
        camelPayment={{
          count: p.camels,
          selected:
            transition?.action.actor === 0
              ? transition.action.outgoing.filter((good) => good === "camel")
                  .length
              : selection.camels,
          active,
          exampleTap: tutorialTap?.area === "camel",
          onChange: (count) =>
            selectCards(selectCamels(viewed, selection, count)),
        }}
        onClear={() => selectCards(emptySelection())}
        confirmationBlocked={
          !!(
            teaching &&
            action &&
            tutorialLesson &&
            !tutorialAccepts(tutorialLesson, action, tutorialPayment.camels)
          )
        }
        confirmAs={teaching ? tutorialLesson?.action : undefined}
        exampleTap={tutorialTap?.area === "confirm"}
        exampleClearTap={tutorialTap?.area === "clear"}
        onConfirm={() =>
          action && (teaching ? commitTutorial(action) : commit(action))
        }
      />
    ) : null;
  return (
    <NumberMotion.Provider
      value={{ paused: animationPaused, reduced: reducedMotion }}
    >
      {error && (
        <div className="toast" role="status">
          <span>{t(error)}</span>
          <button aria-label="关闭提示" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {screen === "menu" ? (
        <main className="menu-shell" data-menu={menu}>
          <section className="menu-copy">
            {brand}
            <SkinSwitch />
            {menu === "home" ? (
              <>
                <p className="eyebrow">{t("TWO MERCHANTS. ONE PINK CITY.")}</p>
                <h1>
                  {t("满城好货，")}
                  <br />
                  {t("只等")}<span>{t("好眼光。")}</span>
                </h1>
                <p className="menu-intro">
                  {t("在粉红之城，做一场漂亮生意。")}
                  <br />
                  {t("收集货物、调度驼队，在恰好的时机出手。")}
                </p>
                <div className="menu-buttons">
                  {hasUnfinishedGame && (
                    <button
                      className="primary menu-action"
                      onClick={() => {
                        if (game?.phase === "playing") setTurnIntro("resume");
                        setScreen("game");
                      }}
                    >
                      <Play size={18} />
                      <span>继续上一局</span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                  <button
                    className={`menu-action ${hasUnfinishedGame ? "secondary" : "primary"}`}
                    onClick={() => setMenu("new")}
                  >
                    <Plus size={18} />
                    <span>
                      {hasUnfinishedGame
                        ? "开始新的比赛"
                        : save
                          ? "再开一场"
                          : t("走进斋普尔")}
                    </span>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="secondary menu-action"
                    onClick={beginTutorial}
                  >
                    <GraduationCap size={18} />
                    <span>新手教程</span>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="secondary menu-action"
                    onClick={() => setModal("rules")}
                  >
                    <BookOpen size={18} />
                    <span>游戏规则</span>
                    <ArrowRight size={18} />
                  </button>
                  {game?.phase === "finished" && !!save?.events.length && (
                    <button
                      className="secondary menu-action"
                      onClick={openFinishedReplay}
                    >
                      <History size={16} />
                      <span>回看上场交易</span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  className="text-button back"
                  onClick={() => setMenu("home")}
                >
                  <ArrowLeft size={16} />
                  返回主菜单
                </button>
                <p className="eyebrow">{t("A NEW DAY AT THE BAZAAR")}</p>
                <h2>{t("今日，开市。")}</h2>
                <p className="menu-intro">
                  {t("与商人米拉对弈，争夺大君的卓越印章。")}
                </p>
                <div className="setup">
                  <fieldset className="match-format">
                    <legend>比赛赛制</legend>
                    <div className="format-options">
                      {([1, 2] as const).map((wins) => (
                        <label
                          key={wins}
                          className={targetSeals === wins ? "chosen" : ""}
                        >
                          <input
                            type="radio"
                            name="match-format"
                            value={wins}
                            checked={targetSeals === wins}
                            onChange={() => setTargetSeals(wins)}
                          />
                          <span>
                            <b>{wins === 1 ? "1 局定胜负" : "标准三局两胜"}</b>
                            <small>
                              {wins === 1 ? "轻松开一局" : t("先赢两轮，角逐印章")}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    对手难度
                    <DifficultySelect
                      value={difficulty}
                      onChange={setDifficulty}
                    />
                  </label>
                  <fieldset className="match-format information-mode">
                    <legend>信息模式</legend>
                    <div className="format-options">
                      {(["standard", "assisted"] as const).map((mode) => (
                        <label
                          key={mode}
                          className={informationMode === mode ? "chosen" : ""}
                        >
                          <input
                            type="radio"
                            name="information-mode"
                            value={mode}
                            checked={informationMode === mode}
                            onChange={() => setInformationMode(mode)}
                          />
                          <span>
                            <b>
                              {mode === "standard" ? "标准模式" : "辅助模式"}
                            </b>
                            <small>
                              {mode === "standard"
                                ? "自己记住公开信息"
                                : "自动记录公开信息"}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="information-mode-note">
                      {t("辅助模式显示对手的货物得分、骆驼和已知手牌；奖励面值与未公开的手牌仍保密。")}
                    </p>
                  </fieldset>
                  {save && (
                    <p className="muted">
                      {hasUnfinishedGame
                        ? "开始新比赛会替换当前进度。"
                        : "开始新比赛后，上场比赛的回放会被替换。"}
                    </p>
                  )}
                  <button className="primary" onClick={start}>
                    {t("摆好货摊，开始游戏")}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
            <footer className="menu-footer menu-credits">
              <span>
                原作设计 ·{" "}
                <a
                  href="https://www.spacecowboys-games.com/game/jaipur/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Sébastien Pauchon
                </a>
              </span>
              <span>网页开发 · franzyu © {new Date().getFullYear()}</span>
            </footer>
          </section>
          <section className="menu-art menu-illustration" aria-hidden="true">
            {!hardware && <picture>
              <source
                media="(max-width: 860px)"
                srcSet={menuMobileIllustration}
              />
              <img
                className="menu-palace-image"
                src={menuIllustration}
                alt=""
                width="1000"
                height="1250"
                fetchPriority="high"
              />
            </picture>}
            <div className="menu-art-location">{t("RAJASTHAN, INDIA")}</div>
            <div className="menu-art-caption">{t("买进风物，卖出眼光。")}</div>
          </section>
        </main>
      ) : viewed && p ? (
        <main
          ref={boardRef}
          data-paused={animationPaused}
          data-selecting={
            active &&
            (market.length > 0 || hand.length > 0 || selection.camels > 0)
          }
          data-less-motion={reducedMotion}
          className={`game-shell portrait-table ${bazaar ? "bazaar-board" : ""} ${screen === "replay" ? "replay-table" : ""} ${teaching ? "tutorial-game" : ""} ${!bazaar && (screen === "game" || teaching) && viewed.phase === "playing" ? "viewport-table" : ""} ${transition?.kind === "deal" ? "mobile-dealing" : ""}`}
        >
          {screen !== "replay" && (
            <>
              <header className="game-header">
                {bazaar && (
                  <div className="bazaar-header-tools">
                    <button
                      aria-label={
                        teaching && tutorialFromGame ? "返回对局" : "返回主菜单"
                      }
                      onClick={returnToMenu}
                    >
                      <ChevronLeft size={25} aria-hidden="true" />
                    </button>
                    <button
                      aria-label="帮助"
                      aria-haspopup="dialog"
                      onClick={() => setModal("rules")}
                    >
                      <span aria-hidden="true">?</span>
                    </button>
                    <button
                      aria-label="对局设置"
                      aria-haspopup="dialog"
                      onClick={() => setModal("settings")}
                    >
                      <Settings size={18} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="game-identity">
                  {brand}
                  <span
                    className="opponent-level"
                    aria-label={
                      teaching
                        ? "新手练习"
                        : `当前对手难度：${DIFFICULTY_NAME[save?.difficulty ?? difficulty]}`
                    }
                  >
                    {teaching
                      ? "新手练习"
                      : t`米拉 · ${DIFFICULTY_NAME[save?.difficulty ?? difficulty]}`}
                    {memory && " · 辅助模式"}
                  </span>
                </div>
                <div className="header-round">
                  {bazaar && <CalendarDays size={15} aria-hidden="true" />}
                  第 <TableNumber value={viewed.round} /> 轮 <span>·</span>{" "}
                  <>
                    第{" "}
                    <TableNumber
                      value={
                        viewed.phase === "playing"
                          ? viewed.turn + 1
                          : viewed.turn
                      }
                    />{" "}
                    手<span>·</span>
                  </>
                  {viewed.targetSeals === 1 ? "1 局定胜负" : "三局两胜"}
                  {viewed.targetSeals !== 1 && (
                    <span
                      className="match-seals"
                      aria-label={t`胜局：你 ${viewed.seals[0]}，米拉 ${viewed.seals[1]}`}
                    >
                      <TableNumber value={viewed.seals[0]} /> :{" "}
                      <TableNumber value={viewed.seals[1]} />
                    </span>
                  )}
                </div>
              </header>
              <nav className="table-tools" aria-label="牌桌工具">
                {returnToMenuButton}
                <button
                  onClick={() => setModal("log")}
                  aria-label="查看完整行动记录"
                  aria-haspopup="dialog"
                >
                  <History size={16} />
                  <span>历史行动</span>
                </button>
                <button
                  onClick={() => setModal("supply")}
                  aria-label={t("查看筹码盘")}
                  aria-haspopup="dialog"
                  title={t("3 类筹码售罄即收市")}
                >
                  {bazaar ? <Search size={16} /> : <Coins size={16} />}
                  <span>{t("筹码盘")}</span>
                </button>
                <button
                  onClick={() => setModal("rules")}
                  aria-label="查看游戏规则"
                  aria-haspopup="dialog"
                >
                  <BookOpen size={16} />
                  <span>游戏规则</span>
                </button>
              </nav>
            </>
          )}
          {screen === "replay" && (
            <div
              className="replay-board-position"
              role="group"
              aria-label="牌桌显示时点"
            >
              {returnToMenuButton}
              <span aria-live="polite">
                {replayIndex === 0
                  ? t("开市局面")
                  : `第 ${replayIndex} 步 · 行动${replayMoment === "before" ? "前" : "后"}`}
              </span>
              <div>
                {(["before", "after"] as const).map((moment) => (
                  <button
                    key={moment}
                    aria-pressed={replayMoment === moment}
                    disabled={replayIndex === 0}
                    onClick={() => {
                      setReplayMoment(moment);
                      setInspectResult(false);
                    }}
                  >
                    行动{moment === "before" ? "前" : "后"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!teaching && viewed.phase !== "playing" && !showEndNotice && (
            <div
              className={`result-banner ${viewed.phase === "finished" ? "final-banner" : ""}`}
              role="status"
            >
              <div className="result-banner-summary">
                <strong>{resultTitle(viewed, copy)}</strong>
                <span>
                  {t("印章")} {viewed.seals[0]} : {viewed.seals[1]} ·{" "}
                  {viewed.phase === "finished"
                    ? "整场比赛已结束"
                    : `第 ${viewed.round} 轮已结束`}
                </span>
              </div>
              <div className="result-banner-actions">
                {viewed.phase === "finished" && (
                  <>
                    <button
                      className="secondary"
                      onClick={() => openPostGameMenu("new")}
                    >
                      {viewed.targetSeals === 1 ? "再来一局" : "再来一场"}
                    </button>
                    <button
                      className="secondary"
                      aria-label="返回主菜单"
                      onClick={() => openPostGameMenu("home")}
                    >
                      主菜单
                    </button>
                    {screen !== "replay" && !!save?.events.length && (
                      <button
                        className="secondary"
                        title="从开局回看本场对局"
                        onClick={openFinishedReplay}
                      >
                        局面回放
                      </button>
                    )}
                  </>
                )}
                <button
                  className="primary"
                  onClick={() => {
                    setDismissedResult("");
                    setInspectResult(true);
                  }}
                >
                  查看结算
                </button>
              </div>
            </div>
          )}
          <div className="game-grid">
            <section className="table-column">
              <div className="board-divider" aria-hidden="true">
                牌桌
              </div>
              {teaching && tutorialStarted && (
                <Tutorial
                  step={tutorialStep}
                  state={viewed}
                  paymentIndex={tutorialPaymentIndex}
                  paymentCompleted={tutorialHasTrade}
                  receipt={tutorialCaption}
                  returningToMatch={tutorialFromGame}
                  onExit={() => leaveTutorial()}
                  onComplete={() => leaveTutorial(true)}
                />
              )}
              <OpponentSeat
                state={viewed}
                reserveState={numberState ?? viewed}
                memory={numberMemory}
                onInspect={() => setModal("scores")}
                revealOpponent={screen === "replay"}
                actionSummary={
                  screen === "replay" ? undefined : (
                    <aside className="table-notes" aria-label="对手本手行动">
                      {actionLedger}
                    </aside>
                  )
                }
              />
              <div className="market-zone" role="group" aria-label={t("公共集市")}>
                {!bazaar && <MarketArchitecture />}
                <div className="table-supply">
                  <MobileSupply
                    state={numberState ?? viewed}
                    onInspect={() => setModal("supply")}
                    tabletop
                    bazaar={bazaar}
                  />
                </div>
                <section className="market-table" aria-label={t("中央集市")}>
                  <div className="market-heading">
                    <div>
                      <p className="eyebrow">{t("斋普尔集市")}</p>
                      <h2>{t("中央集市")}</h2>
                    </div>
                    <span className="market-count">始终补至 5 张</span>
                  </div>
                  <div className="market-row">
                    <div
                      className={`market-deck ${numberState?.deck.length ? "" : "empty-deck"}`}
                      data-motion-anchor="deck"
                      aria-label={`牌堆剩余 ${numberState?.deck.length} 张`}
                    >
                      <span className="market-deck-symbol" aria-hidden="true">
                        <JaipurMark />
                      </span>
                      <b>
                        <TableNumber value={numberState?.deck.length ?? 0} />
                      </b>
                      <span className="market-deck-label">牌堆</span>
                    </div>
                    <div className="market-cards">
                      {viewed.market
                        .map((good, i) => ({
                          good,
                          i,
                          slot: visibleMarketSlots[i],
                        }))
                        .sort((a, b) => a.slot - b.slot)
                        .map(({ good, i, slot }) => (
                          <Card
                            key={slot}
                            motionId={`market-${slot}`}
                            good={good}
                            {...cardFeedback(`market-${slot}`)}
                            selected={market.includes(i)}
                            exampleTap={
                              tutorialTap?.area === "market" &&
                              tutorialTap.index === i
                            }
                            disabled={!active}
                            onClick={() =>
                              selectCards(selectMarket(viewed, selection, i))
                            }
                          />
                        ))}
                    </div>
                    <div
                      className="market-sale-pile"
                      data-motion-anchor="sale"
                      data-selling={
                        transition?.kind === "action" &&
                        transition.action.type === "sell"
                      }
                      role="img"
                      aria-label={t("市场收货位，出售的牌放在这里")}
                      title={t("出售的货物交到这里")}
                    >
                      <span
                        className="market-sale-sign"
                        data-motion-anchor="sale-intake"
                        aria-hidden="true"
                      >
                        {bazaar ? (
                          <PixelArt name="stall" />
                        ) : (
                          <Store size={24} strokeWidth={1.5} />
                        )}
                      </span>
                      <span className="market-sale-label" aria-hidden="true">
                        市场
                      </span>
                    </div>
                  </div>
                  {bazaar && (
                    <div className="bazaar-market-labels" aria-hidden="true">
                      <span>牌堆</span>
                      <b>公共市场</b>
                      <span>收货</span>
                    </div>
                  )}
                </section>
              </div>
              <section className="hand-panel">
                {screen !== "replay" && (
                  <PlayerLastAction action={lastActions[0]} />
                )}
                <div
                  className="hand-and-herd player-hand-and-herd"
                  style={
                    {
                      "--hand-count": Math.max(1, p.hand.length),
                    } as CSSProperties
                  }
                >
                  <div className="player-hand-herd">
                    <PlayerReserve
                      state={numberState ?? viewed}
                      actor={0}
                      onInspect={() => setModal("scores")}
                      revealOpponent={screen === "replay"}
                    />
                  </div>
                  <div
                    className="hand-cards"
                    data-motion-anchor="your-hand"
                    role="group"
                    aria-label={t`你的手牌，${p.hand.length} 张，上限 7 张`}
                  >
                    <div className="hand-capacity-guide" aria-hidden="true">
                      {Array.from({ length: 7 }, (_, index) => (
                        <span className="hand-capacity-slot" key={index} />
                      ))}
                    </div>
                    <span
                      className="card small hand-card-measure"
                      data-motion-anchor="hand-measure"
                      aria-hidden="true"
                    />
                    {p.hand.length ? (
                      p.hand.map((good, i) => (
                        <Card
                          key={`${i}-${good}`}
                          good={good}
                          motionId={`hand-${i}`}
                          {...cardFeedback(`hand-${i}`)}
                          small
                          selected={hand.includes(i)}
                          exampleTap={
                            tutorialTap?.area === "hand" &&
                            tutorialTap.index === i
                          }
                          disabled={!active}
                          onClick={() =>
                            selectCards(selectHand(viewed, selection, i))
                          }
                        />
                      ))
                    ) : (
                      <div className="empty-hand" aria-hidden="true" />
                    )}
                  </div>
                </div>
                {bazaar && actionPanel}
              </section>
              {bazaar
                ? !teaching && actionPanel && <ActionOverview />
                : actionPanel}
              {aiError && !teaching && (
                <div className="pause-note" role="alert">
                  {t(aiError)}
                  <button
                    onClick={() => {
                      setAiError("");
                      setRetry((n) => n + 1);
                    }}
                  >
                    重新思考
                  </button>
                </div>
              )}
              <div className="recent-log" aria-live="polite">
                <History size={14} />
                <span>
                  {hardware
                    ? viewed.phase !== "playing"
                      ? resultTitle(viewed, copy)
                      : latestActor !== null && lastActions[latestActor]
                        ? `${latestActor === 0 ? "你" : t("米拉")} · ${actionCaption(lastActions[latestActor], copy)}`
                        : `第 ${viewed.round} 轮开档`
                    : viewed.log.at(-1)}
                </span>
              </div>
            </section>
          </div>
          {screen === "replay" && (
            <div className="replay-bar" role="group" aria-label="比赛回放控制">
              <b>比赛回放</b>
              <button
                aria-label="上一步"
                disabled={!replayIndex && !replayAnimating}
                onClick={() => {
                  seekReplay(replayAnimating ? replayIndex : replayIndex - 1);
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                aria-label="下一步"
                disabled={
                  !replayAnimating && replayIndex >= (save?.events.length ?? 0)
                }
                onClick={() =>
                  seekReplay(transition?.replayTarget ?? replayIndex + 1)
                }
              >
                <ChevronRight size={20} />
              </button>
              <input
                aria-label="回放进度"
                type="range"
                min="0"
                max={save?.events.length ?? 0}
                value={replayIndex}
                aria-valuetext={`选择复盘第 ${replayIndex} 步，共 ${save?.events.length ?? 0} 步`}
                style={
                  {
                    "--replay-progress": `${save?.events.length ? (replayIndex / save.events.length) * 100 : 0}%`,
                  } as CSSProperties
                }
                onChange={(e) => {
                  seekReplay(Number(e.target.value));
                }}
              />
              <span>
                {replayIndex} / {save?.events.length}
              </span>
            </div>
          )}
          {screen === "replay" && save && (
            <ReplayValueChart
              save={save}
              index={replayIndex}
              moment={replayMoment}
              onSeek={seekReplay}
            />
          )}
          <footer className="game-footer">
            <span>{t("斋普尔 · 每一笔交易，都是一次取舍。")}</span>
            <span>
              {screen === "replay"
                ? "回放不会改变存档"
                : teaching
                  ? "独立练习 · 不影响比赛存档"
                  : "进度自动保存在此浏览器"}
            </span>
          </footer>
        </main>
      ) : null}
      {teaching && !tutorialStarted && (
        <TutorialIntro
          onStart={() => setTutorialStarted(true)}
          onExit={() => leaveTutorial()}
        />
      )}
      {teaching && tutorialInterlude && interludeLesson && !modal && (
        <div
          className="tutorial-interlude"
          data-phase={tutorialInterlude}
          data-reduced={reducedMotion}
          role="status"
        >
          <div>
            <small>
              {interludeLesson.exchangePayment
                ? t`换牌练习 ${interludePaymentIndex + 1}/${TUTORIAL_EXCHANGE_PAYMENTS.length}`
                : "下一项练习"}
            </small>
            <strong>
              {interludeLesson.exchangePayment
                ? t(TUTORIAL_EXCHANGE_PAYMENTS[interludePaymentIndex].label)
                : t(interludeLesson.title)}
            </strong>
          </div>
        </div>
      )}
      {screen === "game" &&
        turnIntro &&
        !transition &&
        !modal &&
        game?.phase === "playing" && (
          <TurnIntro
            state={game}
            resume={turnIntro === "resume"}
            onStart={() => setTurnIntro(null)}
            onTutorial={opening ? beginTutorial : undefined}
          />
        )}
      {showEndNotice && viewed && (
        <RoundEndNotice
          state={viewed}
          tutorial={teaching}
          onContinue={() =>
            teaching ? setTutorialScores(true) : setExplainedResult(resultKey)
          }
        />
      )}
      {showResult && !showEndNotice && viewed && (
        <ResultDialog
          state={viewed}
          history={history}
          onClose={closeResult}
          closeLabel={teaching ? "完成练习" : undefined}
          onNext={
            screen === "game"
              ? () => {
                  commit({ type: "next" });
                }
              : undefined
          }
          onNew={screen === "game" ? () => openPostGameMenu("new") : undefined}
          onMenu={
            screen === "game" ? () => openPostGameMenu("home") : undefined
          }
        />
      )}
      {transition && (screen === "game" || screen === "replay" || teaching) && (
        <ActionAnimation
          bazaar={bazaar}
          reduced={reducedMotion}
          rememberOpponent={!!memory}
          checkpoints={numberCheckpoints}
          onCheckpoint={(index) =>
            setNumberFrame((previous) =>
              previous?.transition === transition && previous.index === index
                ? previous
                : { transition, index },
            )
          }
          settling={transition.kind === "action"}
          tableTravel
          saleTravel={transition.action.type === "sell"}
          flights={transition.flights}
          elapsed={transition.duration - transitionRemaining.current}
          duration={transition.duration}
          paused={animationPaused}
        />
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className={`modal ${modal === "supply" ? "supply-dialog" : modal === "scores" ? "scores-dialog" : ""}`}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "rules"
                ? "游戏规则"
                : modal === "log"
                  ? "行动记录"
                  : modal === "supply"
                    ? t("筹码盘")
                    : modal === "settings"
                      ? "对局设置"
                      : "得分明细"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={closeRef}
              className="modal-close"
              aria-label="关闭"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "rules" ? (
              <Rules
                onTutorial={screen === "game" ? beginTutorial : undefined}
              />
            ) : modal === "settings" ? (
              <>
                <h2>对局设置</h2>
                <label className="bazaar-motion-setting">
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    disabled={systemReducedMotion}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setLessMotion(checked);
                      try {
                        localStorage.setItem(
                          MOTION_PREFERENCE_KEY,
                          String(checked),
                        );
                      } catch {
                        /* Keep the choice for this session when storage is unavailable. */
                      }
                    }}
                  />
                  减少动画{systemReducedMotion && "（已跟随系统）"}
                </label>
              </>
            ) : modal === "supply" && viewed ? (
              <>
                <h2>{t("筹码盘")}</h2>
                <SupplyDetails
                  state={numberState ?? viewed}
                  motionAnchors={false}
                  showRewardCards
                />
              </>
            ) : modal === "scores" && viewed ? (
              <>
                <h2>双方得分</h2>
                <ScoreDetails
                  state={numberState ?? viewed}
                  memory={numberMemory}
                  receipts={receipts}
                  revealOpponent={screen === "replay"}
                />
              </>
            ) : (
              <>
                <h2>行动记录</h2>
                <ActionHistory
                  records={history}
                  results={viewed?.results ?? []}
                />
              </>
            )}
          </div>
        </div>
      )}
    </NumberMotion.Provider>
  );
}
