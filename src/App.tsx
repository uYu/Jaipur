import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Home,
  Pause,
  Play,
  Plus,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import type { Action, Difficulty, Event, Save, State } from "./game/types.ts";
import type { MctsStats } from "./game/ai-wasm.ts";
import {
  AI_MIN_THINKING_MS,
  MCTS_TIME_BUDGET_MS,
  MCTS_TREES,
} from "./game/ai-config.ts";
import { playerScoreDisplay } from "./game/score-display.ts";
import { applyAction, newGame } from "./game/engine.ts";
import {
  emptySelection,
  selectMarket,
  selectHand,
  selectedAction,
} from "./game/selection.ts";
import { observe } from "./game/ai.ts";
import { dmcEventHistory } from "./game/dmc-history.ts";
import {
  advance,
  downloadSave,
  parseSave,
  replay,
  SAVE_KEY,
} from "./game/storage.ts";
import { JaipurMark, Palace } from "./components/Art.tsx";
import { Card } from "./components/Card.tsx";
import { MobileSupply, SupplyDetails } from "./components/MobileSupply.tsx";
import { PlayerScores, ScoreDetails } from "./components/PlayerScores.tsx";
import { ResultDialog, resultTitle } from "./components/ResultDialog.tsx";
import { SaleReceipt } from "./components/SaleReceipt.tsx";
import { TradeFeedback } from "./components/TradeFeedback.tsx";
import { actionSummaries } from "./game/receipts.ts";
import { LastActions } from "./components/LastActions.tsx";
import { ActionHistory } from "./components/ActionHistory.tsx";
import { ActionAnimation } from "./components/ActionAnimation.tsx";
import { MobileActionAnimation } from "./components/MobileActionAnimation.tsx";
import {
  actionTransition,
  dealTransition,
  replayTransition,
} from "./game/action-transition.ts";
import type { ActionTransition } from "./game/action-transition.ts";
import { initialMarketSlots, nextMarketSlots } from "./game/market-layout.ts";
import { actionCaption } from "./game/presentation.ts";
import type { Presentation } from "./game/presentation.ts";
import { marketSlotsAt } from "./game/opponent-turn.ts";
import type { BoardFeedback } from "./game/action-feedback.ts";
import { Rules } from "./components/Rules.tsx";
import { Tutorial } from "./components/Tutorial.tsx";
import { ActionPanel } from "./components/ActionPanel.tsx";
import { GameMenu } from "./components/GameMenu.tsx";
import {
  createTutorialSave,
  TUTORIAL_ACTIONS,
  TUTORIAL_STEPS,
  tutorialAccepts,
  tutorialStepAfterSelection,
  tutorialStepAfterNext,
  normalizeTutorialSelection,
  tutorialAllowsMarket,
  tutorialAllowsHand,
  tutorialFeedback,
} from "./game/tutorial.ts";
import type { Selection } from "./game/selection.ts";
import { readPreferences, writePreferences } from "./game/preferences.ts";
import { useReducedMotion } from "./hooks/useReducedMotion.ts";
import { useMobileLayout } from "./hooks/useMobileLayout.ts";
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
const DIFFICULTY_NAME: Record<Difficulty, string> = {
  easy: "入门",
  normal: "重度",
  hard: "高难",
  experimental: "实验",
};
type AiInsight = {
  algorithm: string;
  searching: boolean;
  elapsedMs?: number;
  stats?: MctsStats;
};
type ActionNotice = { id: string; action: Presentation };
function DifficultySelect({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  return (
    <select
      aria-label="AI 难度"
      value={value}
      onChange={(e) => onChange(e.target.value as Difficulty)}
    >
      <option value="easy">入门 · 学徒商人</option>
      <option value="normal">重度 · 资深商人</option>
      <option value="hard">高难 · 粉城大师</option>
      <option value="experimental">实验 · 自博弈商人</option>
    </select>
  );
}
export default function App() {
  const reducedMotion = useReducedMotion();
  const mobile = useMobileLayout();
  const [initial] = useState(initialSave),
    [save, setSave] = useState<Save | null>(initial.save);
  const [game, setGame] = useState(() =>
    initial.save ? replay(initial.save) : null,
  );
  const [screen, setScreen] = useState<"menu" | "game" | "replay" | "tutorial">(
    "menu",
  );
  const [tutorialSave, setTutorialSave] = useState(createTutorialSave);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialSlots, setTutorialSlots] = useState(initialMarketSlots);
  const tutorialState = useMemo(() => replay(tutorialSave), [tutorialSave]);
  const teaching = screen === "tutorial";
  const tutorialGuide = TUTORIAL_STEPS[tutorialStep];
  const [dismissedResult, setDismissedResult] = useState("");
  const [inspectResult, setInspectResult] = useState(false);
  const [menu, setMenu] = useState<"home" | "new" | "settings">("home");
  const [modal, setModal] = useState<
    "rules" | "log" | "supply" | "scores" | null
  >(null);
  const [preferences] = useState(readPreferences);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    preferences.difficulty,
  );
  const [targetSeals, setTargetSeals] = useState<1 | 2>(
    preferences.targetSeals,
  );
  useEffect(() => {
    writePreferences({ difficulty, targetSeals });
  }, [difficulty, targetSeals]);
  const [error, setError] = useState(initial.error),
    [aiError, setAiError] = useState(""),
    [retry, setRetry] = useState(0);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [transition, setTransition] = useState<ActionTransition | null>(null);
  const [marketNotice, setMarketNotice] = useState<BoardFeedback | null>(null);
  const [saleNotices, setSaleNotices] = useState<
    [ActionNotice | null, ActionNotice | null]
  >([null, null]);
  const [tradeNotice, setTradeNotice] = useState<ActionNotice | null>(null);
  const [marketSlots, setMarketSlots] = useState(() =>
    marketSlotsAt(initial.save),
  );
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayPaused, setReplayPaused] = useState(false);
  const replayAnimating =
    screen === "replay" && transition?.replayTarget !== undefined;
  const animationPaused = !!modal || (screen === "replay" && replayPaused);
  const replayRunning = replayPlaying || (replayAnimating && !replayPaused);
  const transitionRemaining = useRef(0);
  useEffect(() => {
    if (!transition || screen === "menu" || animationPaused) return;
    const started = Date.now();
    const timer = setTimeout(() => {
      setTransition(null);
      if (transition.replayTarget !== undefined && screen === "replay")
        setReplayIndex(transition.replayTarget);
      if (transition.kind === "action") {
        const notice = {
          id: `${transition.before.seed}:${transition.before.round}:${transition.before.turn}`,
          action: transition.action,
        };
        if (transition.action.type === "sell") {
          setSaleNotices((previous) => {
            const next: [ActionNotice | null, ActionNotice | null] = [
              ...previous,
            ];
            next[transition.action.actor] = notice;
            return next;
          });
        } else setTradeNotice(notice);
      }
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
        ? replayIndex
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
      setError("自动保存失败，请在菜单中导出存档备份。");
    }
  }, [save]);
  const clear = () => setSelection(emptySelection());
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
          { mobile, reduced: reducedMotion },
        );
        transitionRemaining.current = nextTransition.duration;
        setTransition(nextTransition);
        setMarketNotice(nextTransition.feedback!);
        setMarketSlots(nextMarketSlots(game, event, next, marketSlots));
      } else {
        animateDeal(next, save.events.length + 1);
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
      transition
    )
      return;
    const worker = new Worker(new URL("./game/ai.worker.ts", import.meta.url), {
      type: "module",
    });
    const activeDifficulty = save?.difficulty ?? difficulty;
    const neuralExperiment =
      new URLSearchParams(window.location.search).get("ai") === "neural";
    setAiInsight({
      algorithm:
        activeDifficulty === "hard"
          ? neuralExperiment
            ? "实验神经先验 MCTS · C++/Wasm"
            : "自对弈引导 MCTS · C++/Wasm"
          : activeDifficulty === "experimental"
            ? "自博弈神经策略 · v147126"
            : activeDifficulty === "normal"
              ? "战术穷举 · C++/Wasm"
              : "轻量启发式 · TypeScript",
      searching: true,
    });
    let active = true;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    worker.onmessage = (e) => {
      if (!active) return;
      if (e.data.error) {
        setAiError(e.data.error);
        return;
      }
      const insight: AiInsight = {
        algorithm: e.data.algorithm,
        searching: false,
        elapsedMs: e.data.elapsedMs,
        stats: e.data.stats,
      };
      setAiInsight(insight);
      if (e.data.stats)
        console.info("[Jaipur MCTS] 本手搜索统计", {
          algorithm: e.data.algorithm,
          ...e.data.stats,
          pipeline: "selection → expansion → rollout → backpropagation",
        });
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
      observation: observe(
        game,
        save?.events,
        activeDifficulty === "experimental" ? 0.75 : false,
      ),
      history:
        activeDifficulty === "experimental" && save
          ? dmcEventHistory(save.seed, save.events, game.current)
          : undefined,
      difficulty: activeDifficulty,
      model: neuralExperiment ? "neural" : "linear",
    });
    return () => {
      active = false;
      clearTimeout(timer);
      worker.terminate();
    };
    // A fresh worker receives only the acting player's observation for each committed turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, screen, modal, retry, aiError, transition]);
  useEffect(() => {
    if (
      screen !== "replay" ||
      !replayPlaying ||
      !save ||
      transition ||
      animationPaused
    )
      return;
    if (replayIndex >= save.events.length) {
      setReplayPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => playReplayStep(),
      replayIndex === 0 ? 150 : 650,
    );
    return () => clearTimeout(timer);
  }, [
    screen,
    replayPlaying,
    replayIndex,
    save,
    transition,
    animationPaused,
    mobile,
    reducedMotion,
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
          ? (transition?.before ?? replay(save, replayIndex))
          : screen === "game" && transition
            ? transition.before
            : game,
    [screen, save, replayIndex, game, transition, tutorialState],
  );
  const resultKey = viewed
    ? `${viewed.seed}:${viewed.round}:${viewed.phase}`
    : "";
  const showResult =
    !!viewed &&
    viewed.phase !== "playing" &&
    !transition &&
    !modal &&
    ((screen === "game" && dismissedResult !== resultKey) ||
      (screen === "replay" && inspectResult));
  const closeResult = () => {
    setDismissedResult(resultKey);
    setInspectResult(false);
  };
  function beginTutorial() {
    setTutorialSave(createTutorialSave());
    setTutorialStep(0);
    setTutorialSlots(initialMarketSlots());
    setTransition(null);
    setMarketNotice(null);
    setSaleNotices([null, null]);
    setTradeNotice(null);
    setModal(null);
    clear();
    setScreen("tutorial");
  }
  function selectCards(next: Selection) {
    setMarketNotice(null);
    if (teaching) {
      let clean = normalizeTutorialSelection(tutorialStep, next, tutorialState);
      const nextStep = tutorialStepAfterSelection(
        tutorialStep,
        clean,
        tutorialState,
      );
      if (
        nextStep !== tutorialStep &&
        TUTORIAL_STEPS[nextStep].id.endsWith("exchange-select")
      )
        clean = { ...clean, hand: [], camels: 0 };
      if (
        nextStep !== tutorialStep &&
        TUTORIAL_STEPS[nextStep].id === "mixed-exchange-hand"
      )
        clean = { ...clean, camels: 0 };
      setSelection(clean);
      setTutorialStep(nextStep);
    } else {
      setSelection(next);
    }
  }
  function commitTutorial(action: Action) {
    const before = tutorialState;
    if (transition || modal) return;
    if (
      before.current === 0 &&
      (tutorialGuide.kind !== "confirm" ||
        !tutorialAccepts(
          tutorialGuide.lesson!,
          action,
          before.market,
          before.players[0].hand,
        ))
    )
      return;
    const next = applyAction(before, action);
    const nextTransition = actionTransition(
      before,
      action,
      next,
      tutorialSlots,
      tutorialSave.events.length,
      { mobile, reduced: reducedMotion },
    );
    transitionRemaining.current = nextTransition.duration;
    setTransition(nextTransition);
    setMarketNotice(nextTransition.feedback!);
    setTutorialSlots(nextMarketSlots(before, action, next, tutorialSlots));
    setTutorialSave((previous) => ({
      ...previous,
      events: [...previous.events, action],
    }));
    setTutorialStep((step) => step + 1);
    clear();
  }
  useEffect(() => {
    if (!teaching || transition || modal || tutorialGuide.kind !== "opponent")
      return;
    const timer = setTimeout(
      () => commitTutorial(TUTORIAL_ACTIONS[tutorialSave.events.length]),
      600,
    );
    return () => clearTimeout(timer);
  }, [teaching, transition, modal, tutorialStep, tutorialSave]);
  function animateDeal(state: State, eventLimit = 0) {
    setMarketNotice(null);
    setSaleNotices([null, null]);
    setTradeNotice(null);
    const nextTransition = dealTransition(state, eventLimit, {
      mobile,
      reduced: reducedMotion,
    });
    transitionRemaining.current = nextTransition.duration;
    setTransition(nextTransition);
    setMarketSlots(initialMarketSlots());
  }
  function playReplayStep() {
    if (!save || transition || modal) return;
    const nextTransition = replayTransition(save, replayIndex, {
      mobile,
      reduced: reducedMotion,
      revealOpponent: true,
    });
    if (!nextTransition) return;
    setReplayPaused(false);
    setInspectResult(false);
    transitionRemaining.current = nextTransition.duration;
    setMarketNotice(nextTransition.feedback ?? null);
    if (nextTransition.kind === "deal") {
      setSaleNotices([null, null]);
      setTradeNotice(null);
    }
    setTransition(nextTransition);
  }
  function seekReplay(index: number) {
    setReplayPlaying(false);
    setReplayPaused(false);
    setTransition(null);
    setMarketNotice(null);
    setSaleNotices([null, null]);
    setTradeNotice(null);
    setInspectResult(false);
    setReplayIndex(
      Math.max(0, Math.min(save?.events.length ?? 0, Math.trunc(index))),
    );
    clear();
  }
  function toggleReplay() {
    if (replayRunning) {
      setReplayPlaying(false);
      setReplayPaused(true);
    } else {
      if (!transition && replayIndex >= (save?.events.length ?? 0))
        seekReplay(0);
      setReplayPaused(false);
      setReplayPlaying(true);
    }
  }
  function start() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const fresh: Save = {
      version: 1,
      seed,
      difficulty,
      targetSeals,
      events: [],
    };
    setDismissedResult("");
    const freshGame = newGame(seed, targetSeals);
    animateDeal(freshGame);
    setSave(fresh);
    setGame(freshGame);
    setScreen("game");
    setMenu("home");
    setAiError("");
    setAiInsight(null);
    clear();
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error("存档文件过大");
      const imported = parseSave(await file.text());
      setTransition(null);
      setMarketNotice(null);
      setSaleNotices([null, null]);
      setTradeNotice(null);
      setMarketSlots(marketSlotsAt(imported));
      setDismissedResult("");
      setSave(imported);
      setGame(replay(imported));
      setDifficulty(imported.difficulty);
      setError("存档已导入，可以继续比赛。");
      setAiError("");
      clear();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const p = viewed?.players[0],
    opponent = viewed?.players[1];
  const ownScore = viewed ? playerScoreDisplay(viewed, 0) : null;
  const opponentScore = viewed
    ? playerScoreDisplay(viewed, 1, screen === "replay")
    : null;
  const replayMarketSlots = useMemo(
    () => (screen === "replay" ? marketSlotsAt(save, replayIndex) : []),
    [screen, save, replayIndex],
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
        (tutorialGuide.kind === "select" ||
          tutorialGuide.kind === "confirm"))) &&
    viewed?.phase === "playing" &&
    viewed.current === 0 &&
    !modal &&
    !transition;
  function cardFeedback(anchor: string) {
    if (transition) {
      const departure = transition.feedback?.departures.find(
        (item) => item.anchor === anchor,
      );
      return departure ? { notice: departure.label, departing: mobile } : {};
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
      return { notice: marketNotice.addedLabel, arriving: true };
    if (
      mobile &&
      anchor.startsWith("hand-") &&
      marketNotice?.handArrivals.includes(Number(anchor.slice(5)))
    )
      return { notice: marketNotice.handLabel, arriving: true };
    return {};
  }
  const { action } =
    viewed && active ? selectedAction(viewed, selection) : { action: null };
  const brand = (
    <div className="brand">
      <span className="brand-icon">
        <JaipurMark />
      </span>
      <b>JAIPUR</b>
      <span className="brand-divider" />
      粉城商事
    </div>
  );
  const gameToolButtons = (
    <>
      <button
        title="游戏规则"
        aria-label="游戏规则"
        onClick={() => setModal("rules")}
      >
        <BookOpen size={19} />
        <span>游戏规则</span>
      </button>
      <button
        title="行动记录"
        aria-label="行动记录"
        onClick={() => setModal("log")}
      >
        <History size={19} />
        <span>行动记录</span>
      </button>
      <button
        title="返回菜单"
        aria-label="返回菜单"
        onClick={() => {
          setScreen("menu");
          setMenu("home");
          setReplayPlaying(false);
          if (teaching || screen === "replay") {
            setTransition(null);
            setMarketNotice(null);
            setSaleNotices([null, null]);
            setTradeNotice(null);
            clear();
          }
        }}
      >
        <Home size={19} />
        <span>返回菜单</span>
      </button>
    </>
  );
  return (
    <>
      {error && (
        <div className="toast" role="status">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {screen === "menu" ? (
        <main className="menu-shell">
          <section className="menu-copy">
            {brand}
            {menu === "home" ? (
              <>
                <p className="eyebrow">TWO MERCHANTS. ONE PINK CITY.</p>
                <h1>
                  满城好货，
                  <br />
                  只等<span>好眼光。</span>
                </h1>
                <p className="menu-intro">
                  在粉红之城，做一场漂亮生意。
                  <br />
                  收集货物、调度驼队，在恰好的时机出手。
                </p>
                <div className="menu-buttons">
                  {save && (
                    <button
                      className="primary menu-action"
                      onClick={() => {
                        setScreen("game");
                      }}
                    >
                      <Play size={18} />
                      <span>继续集市之旅</span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                  <button
                    className={`menu-action ${save ? "secondary" : "primary"}`}
                    onClick={() => setMenu("new")}
                  >
                    <Plus size={18} />
                    <span>{save ? "开始新的比赛" : "走进斋普尔"}</span>
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="secondary menu-action"
                    onClick={beginTutorial}
                  >
                    <BookOpen size={18} />
                    <span>新手教程</span>
                    <ArrowRight size={18} />
                  </button>
                  <div className="menu-shortcuts">
                    <button onClick={() => setModal("rules")}>
                      <BookOpen size={17} />
                      游戏规则
                    </button>
                    <button onClick={() => setMenu("settings")}>
                      <Settings2 size={17} />
                      设置与存档
                    </button>
                  </div>
                  {save && (
                    <button
                      className="text-button"
                      onClick={() => {
                        clear();
                        seekReplay(0);
                        setScreen("replay");
                      }}
                    >
                      <History size={16} />
                      回看这场生意
                    </button>
                  )}
                </div>
                <div className="menu-meta">
                  <span>2 位商人</span>
                  <span>1 局定胜负 / 三局两胜</span>
                  <span>本地 AI · 无需联网</span>
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
                <p className="eyebrow">
                  {menu === "new"
                    ? "A NEW DAY AT THE BAZAAR"
                    : "MAKE YOURSELF AT HOME"}
                </p>
                <h2>
                  {menu === "new" ? "今日，开市。" : "你的集市，你的节奏。"}
                </h2>
                <p className="menu-intro">
                  {menu === "new"
                    ? "与商人米拉对弈，争夺大君的卓越印章。"
                    : "比赛进度保存在此浏览器，也可以导出随身带走。"}
                </p>
                <div className="setup">
                  {menu === "new" && (
                    <>
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
                                <b>
                                  {wins === 1 ? "1 局定胜负" : "标准三局两胜"}
                                </b>
                                <small>
                                  {wins === 1
                                    ? "轻松开一局"
                                    : "先赢两轮，角逐印章"}
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </>
                  )}
                  <label>
                    对手难度
                    <DifficultySelect
                      value={difficulty}
                      onChange={setDifficulty}
                    />
                  </label>
                  {menu === "new" ? (
                    <>
                      {save && (
                        <p className="muted">
                          开始后将替换当前自动存档。需要保留时，可先到设置导出。
                        </p>
                      )}
                      <button className="primary" onClick={start}>
                        摆好货摊，开始游戏
                        <ArrowRight size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="save-controls">
                        <button
                          className="secondary"
                          disabled={!save}
                          onClick={() => save && downloadSave(save)}
                        >
                          <Download size={16} />
                          导出存档
                        </button>
                        <label className="file-button">
                          <Upload size={16} />
                          导入存档
                          <input
                            aria-label="导入存档"
                            type="file"
                            accept=".json,application/json"
                            onChange={(e) => {
                              void importFile(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <p className="muted">
                        导入会替换当前进度。文件将在本地逐步验证，不上传数据。
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
            <footer className="menu-footer">
              一场关于取舍、眼光与时机的双人对决
            </footer>
          </section>
          <section className="menu-art" aria-hidden="true">
            <div className="art-label">
              RAJASTHAN, INDIA <span>26.9124° N · 75.7873° E</span>
            </div>
            <Palace />
            <div className="hero-cards">
              <Card good="cloth" disabled />
              <Card good="diamond" disabled />
              <Card good="spice" disabled />
            </div>
            <div className="art-caption">
              The Pink City Bazaar<span>买进风物，卖出眼光。</span>
            </div>
            <div className="art-stamp">
              EST.
              <br />
              <b>1727</b>
            </div>
          </section>
        </main>
      ) : viewed && p && opponent ? (
        <main
          data-paused={animationPaused}
          className={`game-shell ${teaching ? "tutorial-game" : ""} ${(screen === "game" || screen === "replay" || teaching) && viewed.phase === "playing" ? "viewport-table" : ""} ${mobile && transition?.kind === "deal" ? "mobile-dealing" : ""}`}
        >
          <nav className="game-tools" aria-label="游戏功能">
            <span className="game-tools-label">牌桌功能</span>
            {gameToolButtons}
          </nav>
          <header className="game-header">
            {brand}
            <div className="header-round">
              第 {viewed.round} 轮 <span>·</span>{" "}
              {viewed.targetSeals === 1 ? "1 局定胜负" : "三局两胜"}
            </div>
            <GameMenu>{gameToolButtons}</GameMenu>
          </header>
          {screen === "replay" && (
            <div className="replay-bar">
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
                aria-label={replayRunning ? "暂停回放" : "播放回放"}
                onClick={toggleReplay}
              >
                {replayRunning ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                aria-label="下一步"
                disabled={
                  replayAnimating || replayIndex === (save?.events.length ?? 0)
                }
                onClick={() => {
                  setReplayPlaying(false);
                  playReplayStep();
                }}
              >
                <ChevronRight size={20} />
              </button>
              <input
                aria-label="回放进度"
                type="range"
                min="0"
                max={save?.events.length ?? 0}
                value={replayIndex}
                onChange={(e) => {
                  seekReplay(Number(e.target.value));
                }}
              />
              <span>
                {replayIndex} / {save?.events.length}
              </span>
            </div>
          )}
          {viewed.phase !== "playing" && (
            <div
              className={`result-banner ${viewed.phase === "finished" ? "final-banner" : ""}`}
              role="status"
            >
              <div>
                <strong>{resultTitle(viewed)}</strong>
                <span>
                  印章 {viewed.seals[0]} : {viewed.seals[1]} ·{" "}
                  {viewed.phase === "finished"
                    ? "整场比赛已结束"
                    : `第 ${viewed.round} 轮已结束`}
                </span>
              </div>
              <button
                className="primary"
                onClick={() => {
                  setDismissedResult("");
                  setInspectResult(true);
                  setReplayPlaying(false);
                }}
              >
                查看结算
              </button>
            </div>
          )}
          <div className="game-grid">
            <section className="game-overview" aria-label="统计信息">
              <h2 className="overview-title">局势概览</h2>
              <MobileSupply
                state={viewed}
                onInspect={() => setModal("supply")}
              />
              <LastActions
                actions={lastActions}
                turns={lastTurns}
                latestActor={latestActor}
                settled={!transition}
                onHistory={() => setModal("log")}
              />
            </section>
            <section className="table-column">
              <div className="board-divider" aria-hidden="true">
                牌桌
              </div>
              <PlayerScores
                state={viewed}
                receipts={receipts}
                onInspect={() => setModal("scores")}
                sales={mobile ? saleNotices : undefined}
                paused={animationPaused}
                revealOpponent={screen === "replay"}
              />
              <div
                className={`opponent-panel ${viewed.current === 1 && viewed.phase === "playing" ? "turn-active" : ""}`}
              >
                <div className="avatar" data-motion-anchor="opponent-hand">
                  米
                </div>
                <div className="player-name" data-motion-anchor="opponent-herd">
                  <h2>
                    米拉{" "}
                    <span>
                      集市商人 ·{" "}
                      {teaching
                        ? "教学对手"
                        : DIFFICULTY_NAME[save?.difficulty ?? difficulty]}
                    </span>
                  </h2>
                  <div className="seals">
                    {Array.from({ length: viewed.targetSeals ?? 2 }, (_, n) => (
                      <span
                        key={n}
                        className={viewed.seals[1] > n ? "won" : ""}
                      >
                        ✺
                      </span>
                    ))}
                    <span className="muted">
                      {opponent.hand.length} 张手牌 ·{" "}
                      {screen === "replay"
                        ? `骆驼 ${opponent.camels} 头`
                        : "驼队保密"}
                    </span>
                  </div>
                </div>
                <div
                  className="opponent-score"
                  data-motion-anchor="opponent-score"
                >
                  <b>{opponentScore?.hidden ? "保密" : opponentScore?.total}</b>
                  <span>
                    {opponentScore?.hidden ? "收市揭晓得分" : "本轮总分"}
                  </span>
                  <small>
                    货物筹码 {opponent.goods.length} 枚 · 奖励{" "}
                    {opponent.bonuses.length} 枚
                  </small>
                  <SaleReceipt receipt={receipts[1]} actor={1} />
                </div>
              </div>
              <section className="market-table">
                <div className="market-heading">
                  <div>
                    <p className="eyebrow">斋普尔 · 粉城集市</p>
                    <h2>中央集市</h2>
                  </div>
                  <span className="market-count">始终补至 5 张</span>
                </div>
                <div className="market-row">
                  <div
                    className={`market-deck ${viewed.deck.length ? "" : "empty-deck"}`}
                    data-motion-anchor="deck"
                    aria-label={`牌堆剩余 ${viewed.deck.length} 张`}
                  >
                    <span className="market-deck-symbol" aria-hidden="true">
                      <JaipurMark />
                    </span>
                    <b>{viewed.deck.length}</b>
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
                          disabled={
                            !active ||
                            (teaching &&
                              !tutorialAllowsMarket(tutorialStep, good))
                          }
                          onClick={() =>
                            selectCards(selectMarket(viewed, selection, i))
                          }
                        />
                      ))}
                  </div>
                </div>
                <span
                  className="sale-motion-anchor"
                  data-motion-anchor="sale"
                  aria-hidden="true"
                />
              </section>
              <div
                className={`turn-line ${mobile ? "with-trade-feedback" : ""}`}
                aria-live="polite"
              >
                {mobile && tradeNotice && (
                  <TradeFeedback
                    key={tradeNotice.id}
                    action={tradeNotice.action}
                    paused={animationPaused}
                  />
                )}
                <span className="turn-message">
                  <span className={`status-dot ${active ? "your-turn" : ""}`} />
                  {screen === "replay"
                    ? transition
                      ? `${transition.action.actor === 0 ? "你" : "米拉"}：${actionCaption(transition.action)}，正在重放…`
                      : "正在回看已发生的交易"
                    : viewed.phase !== "playing"
                      ? "本轮集市已收市"
                      : transition
                        ? (transition.caption ??
                          `${transition.action.actor === 0 ? "你" : "米拉"}：${actionCaption(transition.action)}，正在结算…`)
                        : aiError
                          ? "AI 等待重试"
                          : viewed.current === 1
                            ? "米拉正在盘算下一笔生意…"
                            : lastActions[1]
                              ? "米拉行动结束，轮到你了"
                              : "轮到你了，今天想做哪笔生意？"}
                </span>
                <span>第 {viewed.turn + 1} 手</span>
              </div>
              {screen === "game" &&
                (save?.difficulty ?? difficulty) === "hard" && (
                  <section className="mcts-proof" aria-live="polite">
                    <div className="mcts-proof-title">
                      <strong>MCTS 搜索证据</strong>
                      <span>
                        {aiInsight?.algorithm ?? "自对弈引导 MCTS · C++/Wasm"}
                      </span>
                    </div>
                    {aiInsight?.stats ? (
                      <div className="mcts-proof-stats">
                        <span>
                          <b>{aiInsight.stats.trees}</b> 棵确定化树
                        </span>
                        <span>
                          <b>{aiInsight.stats.simulations.toLocaleString()}</b>{" "}
                          次模拟
                        </span>
                        <span>
                          根行动 <b>{aiInsight.stats.rootActionFamilies}</b>
                        </span>
                        <span>
                          访问支持率{" "}
                          <b>
                            {(aiInsight.stats.selectedVisitShare * 100).toFixed(
                              1,
                            )}
                            %
                          </b>
                        </span>
                        <span>
                          交换候选 <b>{aiInsight.stats.exchangeCandidates}</b>
                        </span>
                        <span>
                          模拟到终局{" "}
                          <b>
                            {aiInsight.stats.terminalSimulations.toLocaleString()}
                          </b>
                          {" / "}
                          {aiInsight.stats.simulations.toLocaleString()}
                        </span>
                        <span>
                          搜索深度 <b>{aiInsight.stats.maxTreeDepth}</b> 手
                        </span>
                        <span>
                          <b>{aiInsight.stats.elapsedMs}</b> ms
                        </span>
                      </div>
                    ) : aiInsight?.searching && viewed.current === 1 ? (
                      <div className="mcts-proof-stats searching">
                        <span>
                          <b>{MCTS_TREES} 棵树</b> · 约{" "}
                          <b>{MCTS_TIME_BUDGET_MS / 1000} 秒</b>搜索中
                        </span>
                      </div>
                    ) : (
                      <div className="mcts-proof-stats">
                        <span>米拉行动后显示本手真实搜索统计</span>
                      </div>
                    )}
                    <small>
                      自对弈先验 + PUCT → 执行完整行动 → 模拟至终局 →
                      反向传播；每棵树独立采样隐藏牌。
                    </small>
                  </section>
                )}
              <section className="hand-panel">
                <div className="hand-heading">
                  <div className="you-label">
                    <div className="avatar you">你</div>
                    <div>
                      <h2>
                        你的货摊 <span>{p.hand.length} / 7 张</span>
                      </h2>
                      <div className="seals">
                        {Array.from(
                          { length: viewed.targetSeals ?? 2 },
                          (_, n) => (
                            <span
                              key={n}
                              className={viewed.seals[0] > n ? "won" : ""}
                            >
                              ✺
                            </span>
                          ),
                        )}
                        <span
                          className="herd-summary camel"
                          data-motion-anchor="your-herd"
                        >
                          驼队 <b>{p.camels}</b> 头
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="your-score" data-motion-anchor="your-score">
                    <b>{ownScore?.total}</b>
                    <span>卢比</span>
                    <small>
                      货物 {ownScore?.goods} + 奖励 {ownScore?.bonus}
                    </small>
                    <SaleReceipt receipt={receipts[0]} actor={0} />
                  </div>
                </div>
                <div className="hand-and-herd">
                  <div className="hand-cards" data-motion-anchor="your-hand">
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
                          disabled={
                            !active ||
                            (teaching &&
                              !tutorialAllowsHand(tutorialStep, good))
                          }
                          onClick={() =>
                            selectCards(selectHand(viewed, selection, i))
                          }
                        />
                      ))
                    ) : (
                      <div className="empty-hand">
                        货摊空空，去集市发现下一笔好生意。
                      </div>
                    )}
                  </div>
                </div>
              </section>
              {viewed.phase === "playing" && (screen === "game" || teaching) ? (
                <ActionPanel
                  state={viewed}
                  selection={selection}
                  active={active}
                  onSelectionChange={selectCards}
                  onClear={() => selectCards(emptySelection())}
                  confirmationBlocked={
                    teaching &&
                    (tutorialGuide.kind !== "confirm" ||
                      !action ||
                      !tutorialAccepts(
                        tutorialGuide.lesson!,
                        action,
                        viewed.market,
                        viewed.players[0].hand,
                      ))
                  }
                  onConfirm={() =>
                    action &&
                    (teaching ? commitTutorial(action) : commit(action))
                  }
                />
              ) : null}
              {aiError && !teaching && (
                <div className="pause-note" role="alert">
                  {aiError}
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
                <span>{viewed.log.at(-1)}</span>
              </div>
            </section>
          </div>
          <footer className="game-footer">
            <span>JAIPUR · 每一笔交易，都是一次取舍。</span>
            <span>
              {screen === "replay"
                ? "回放不会改变存档"
                : teaching
                  ? "固定教学对局 · 不影响比赛存档"
                  : "进度自动保存在此浏览器"}
            </span>
          </footer>
        </main>
      ) : null}
      {teaching && (
        <Tutorial
          step={tutorialStep}
          spicePrices={tutorialState.tokens.spice.slice(0, 3)}
          saleReceipt={receipts[0]}
          feedback={tutorialFeedback(tutorialStep, selection)}
          canContinue={
            tutorialStepAfterNext(tutorialStep, selection, tutorialState) !==
            tutorialStep
          }
          onHistory={() => setModal("log")}
          paused={!!transition || !!modal}
          onNext={() => {
            if (!transition && !modal)
              setTutorialStep(
                tutorialStepAfterNext(tutorialStep, selection, tutorialState),
              );
          }}
          onExit={() => {
            setScreen("menu");
            setMenu("home");
            setTransition(null);
            clear();
          }}
          onComplete={() => {
            setScreen("menu");
            setMenu("new");
            clear();
          }}
          onRestart={beginTutorial}
        />
      )}
      {showResult && viewed && (
        <ResultDialog
          state={viewed}
          lastAction={history.at(-1)?.action}
          onClose={closeResult}
          onNext={
            screen === "game"
              ? () => {
                  commit({ type: "next" });
                }
              : undefined
          }
          onNew={
            screen === "game"
              ? () => {
                  setScreen("menu");
                  setMenu("new");
                }
              : undefined
          }
          onMenu={
            screen === "game"
              ? () => {
                  setScreen("menu");
                  setMenu("home");
                }
              : undefined
          }
        />
      )}
      {transition &&
        (screen === "game" || screen === "replay" || teaching) &&
        (mobile ? (
          transition.feedback && (
            <MobileActionAnimation
              departures={transition.feedback.departures}
              elapsed={transition.duration - transitionRemaining.current}
              duration={transition.duration}
              paused={animationPaused}
              departureHoldMs={transition.departureHoldMs}
            />
          )
        ) : (
          <ActionAnimation
            settling={transition.kind === "action"}
            flights={transition.flights}
            elapsed={transition.duration - transitionRemaining.current}
            duration={transition.duration}
            paused={animationPaused}
          />
        ))}
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
                    ? "筹码盘"
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
              <Rules />
            ) : modal === "supply" && viewed ? (
              <>
                <h2>筹码盘</h2>
                <SupplyDetails
                  state={viewed}
                  motionAnchors={false}
                  showRewardCards
                />
              </>
            ) : modal === "scores" && viewed ? (
              <>
                <h2>双方得分</h2>
                <ScoreDetails
                  state={viewed}
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
    </>
  );
}
