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
  Settings2,
  Upload,
  X,
} from "lucide-react";
import type { Action, Difficulty, Event, Save, State } from "./game/types.ts";
import type { MctsStats } from "./game/ai-wasm.ts";
import { MCTS_TIME_BUDGET_MS, MCTS_TREES } from "./game/ai-config.ts";
import { sum } from "./game/data.ts";
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
import { Palace } from "./components/Art.tsx";
import { Card } from "./components/Card.tsx";
import { MobileSupply } from "./components/MobileSupply.tsx";
import { ResultDialog, resultTitle } from "./components/ResultDialog.tsx";
import { SaleReceipt } from "./components/SaleReceipt.tsx";
import { actionSummaries } from "./game/receipts.ts";
import { LastActions } from "./components/LastActions.tsx";
import { ActionHistory } from "./components/ActionHistory.tsx";
import { ActionAnimation } from "./components/ActionAnimation.tsx";
import { actionFlights, dealFlights } from "./game/flights.ts";
import type { Flight } from "./game/flights.ts";
import { initialMarketSlots, nextMarketSlots } from "./game/market-layout.ts";
import { presentAction } from "./game/presentation.ts";
import type { Presentation } from "./game/presentation.ts";
import { Rules } from "./components/Rules.tsx";
import { Tutorial } from "./components/Tutorial.tsx";
import { ActionPanel } from "./components/ActionPanel.tsx";
import {
  createTutorialSave,
  TUTORIAL_ACTIONS,
  TUTORIAL_STEPS,
  tutorialAccepts,
  tutorialStepAfterSelection,
  normalizeTutorialSelection,
  tutorialAllowsMarket,
  tutorialAllowsHand,
  tutorialFeedback,
} from "./game/tutorial.ts";
import type { Selection } from "./game/selection.ts";
import { readPreferences, writePreferences } from "./game/preferences.ts";
import { useReducedMotion } from "./hooks/useReducedMotion.ts";
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
  const [modal, setModal] = useState<"rules" | "log" | null>(null);
  const [preferences] = useState(readPreferences);
  const [difficulty, setDifficulty] = useState<Difficulty>(
      preferences.difficulty,
    ),
    [speed, setSpeed] = useState(preferences.speed);
  const [targetSeals, setTargetSeals] = useState<1 | 2>(
    preferences.targetSeals,
  );
  useEffect(() => {
    writePreferences({ difficulty, speed, targetSeals });
  }, [difficulty, speed, targetSeals]);
  const [error, setError] = useState(initial.error),
    [aiError, setAiError] = useState(""),
    [retry, setRetry] = useState(0);
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [transition, setTransition] = useState<{
    before: State;
    marketSlots: number[];
    action: Presentation;
    caption?: string;
    flights: Flight[];
    duration: number;
  } | null>(null);
  const [marketSlots, setMarketSlots] = useState(initialMarketSlots);
  const transitionRemaining = useRef(0);
  useEffect(() => {
    if (!transition || (screen !== "game" && screen !== "tutorial") || modal)
      return;
    const started = Date.now();
    const timer = setTimeout(
      () => setTransition(null),
      transitionRemaining.current,
    );
    return () => {
      clearTimeout(timer);
      transitionRemaining.current = Math.max(
        0,
        transitionRemaining.current - (Date.now() - started),
      );
    };
  }, [transition, screen, modal]);
  const [selection, setSelection] = useState(emptySelection);
  const { market, hand } = selection;
  const [replayIndex, setReplayIndex] = useState(0),
    [replayPlaying, setReplayPlaying] = useState(false);
  const { receipts, lastActions, lastTurns, latestActor, history } = useMemo(
    () =>
      actionSummaries(
        screen === "tutorial" ? tutorialSave : save,
        screen === "replay" ? replayIndex : undefined,
      ),
    [save, screen, replayIndex, tutorialSave],
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
        const duration = reducedMotion
          ? event.type === "sell"
            ? 900
            : event.type === "exchange"
              ? 650
              : 500
          : (speed === 350 ? 650 : speed === 2000 ? 1400 : 950) +
            (event.type === "exchange" ? 200 : event.type === "sell" ? 550 : 0);
        transitionRemaining.current = duration;
        setTransition({
          before: game,
          marketSlots,
          action: presentAction(game, event, next),
          flights: actionFlights(game, event, next, marketSlots),
          duration,
        });
        setMarketSlots(nextMarketSlots(game, event, next, marketSlots));
      } else {
        animateDeal(next);
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
            ? "自博弈神经策略 · v75182"
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
        Math.max(0, speed - (Date.now() - started)),
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
  }, [game, screen, modal, speed, retry, aiError, transition]);
  useEffect(() => {
    if (screen !== "replay" || !replayPlaying || !save) return;
    if (replayIndex >= save.events.length) {
      setReplayPlaying(false);
      return;
    }
    const timer = setTimeout(() => setReplayIndex((i) => i + 1), 1100);
    return () => clearTimeout(timer);
  }, [screen, replayPlaying, replayIndex, save]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
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
      previous?.focus();
    };
  }, [modal]);
  const viewed = useMemo(
    () =>
      screen === "tutorial"
        ? (transition?.before ?? tutorialState)
        : screen === "replay" && save
          ? replay(save, replayIndex)
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
    setModal(null);
    clear();
    setScreen("tutorial");
  }
  function selectCards(next: Selection) {
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
    const duration = reducedMotion ? 650 : action.type === "sell" ? 1800 : 1300;
    transitionRemaining.current = duration;
    setTransition({
      before,
      marketSlots: tutorialSlots,
      action: presentAction(before, action, next),
      flights: actionFlights(before, action, next, tutorialSlots),
      duration,
    });
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
  function animateDeal(state: State) {
    const duration = reducedMotion
      ? 500
      : speed === 350
        ? 1700
        : speed === 2000
          ? 3600
          : 2700;
    transitionRemaining.current = duration;
    setTransition({
      before: state,
      marketSlots: initialMarketSlots(),
      action: {
        actor: 0,
        type: "take",
        incoming: [],
        outgoing: [],
        coins: [],
        bonus: null,
      },
      flights: dealFlights(state),
      duration,
      caption: "正在发牌：牌堆 → 双方手牌…",
    });
    setMarketSlots(initialMarketSlots());
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
      setMarketSlots(initialMarketSlots());
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
  const visibleMarketSlots =
    screen === "replay"
      ? initialMarketSlots()
      : (transition?.marketSlots ?? (teaching ? tutorialSlots : marketSlots));
  const active =
    (screen === "game" ||
      (teaching &&
        (tutorialGuide.kind === "select" ||
          tutorialGuide.kind === "confirm"))) &&
    viewed?.phase === "playing" &&
    viewed.current === 0 &&
    !modal &&
    !transition;
  const { action } =
    viewed && active ? selectedAction(viewed, selection) : { action: null };
  const brand = (
    <div className="brand">
      <span className="brand-icon">✳</span>
      <b>JAIPUR</b>
      <span className="brand-divider" />
      粉城商事
    </div>
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
                      className="primary"
                      onClick={() => {
                        setScreen("game");
                      }}
                    >
                      <Play size={17} />
                      继续集市之旅
                      <ArrowRight size={18} />
                    </button>
                  )}
                  <button
                    className={save ? "secondary" : "primary"}
                    onClick={() => setMenu("new")}
                  >
                    {save ? "开始新的比赛" : "走进斋普尔"}
                    <ArrowRight size={18} />
                  </button>
                  <button
                    className="tutorial-entry home-tutorial-entry"
                    onClick={beginTutorial}
                  >
                    <BookOpen size={22} />
                    <span>
                      <b>新手教程 · 跟着做一笔生意</b>
                      <small>边点边学 · 亲手练习三种交换</small>
                    </span>
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
                        setReplayIndex(0);
                        setScreen("replay");
                        setReplayPlaying(false);
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
                  <p className="muted">
                    {difficulty === "easy"
                      ? "轻量启发式并保留探索性，适合熟悉规则与操作。"
                      : difficulty === "experimental"
                        ? "与自博弈训练的神经策略对弈，使用第 75,182 版检查点。"
                        : difficulty === "normal"
                          ? "C++ 穷举当前合法行动，权衡收益、手牌潜力与收市风险。"
                          : "C++/Wasm 确定化 MCTS：8 棵树模拟隐藏信息与后续对局。"}
                    {menu === "settings" ? " 难度设置应用于新比赛。" : ""}
                  </p>
                  <label>
                    AI 行动节奏
                    <select
                      aria-label="AI 行动节奏"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      <option value={350}>快速</option>
                      <option value={1000}>标准</option>
                      <option value={2000}>从容</option>
                    </select>
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
                      <button
                        className="tutorial-entry"
                        onClick={beginTutorial}
                      >
                        <BookOpen size={21} />
                        <span>
                          <b>第一次玩？跟着做一笔生意</b>
                          <small>跟着亮框操作 · 不影响存档</small>
                        </span>
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
        <main className={`game-shell ${teaching ? "tutorial-game" : ""}`}>
          <nav className="game-tools" aria-label="游戏功能">
            <span className="game-tools-label">牌桌功能</span>
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
                if (teaching) {
                  setTransition(null);
                  clear();
                }
              }}
            >
              <Home size={19} />
              <span>返回菜单</span>
            </button>
          </nav>
          <header className="game-header">
            {brand}
            <div className="header-round">
              第 {viewed.round} 轮 <span>·</span>{" "}
              {viewed.targetSeals === 1 ? "1 局定胜负" : "三局两胜"}
            </div>
          </header>
          {screen === "replay" && (
            <div className="replay-bar">
              <b>比赛回放</b>
              <button
                aria-label="上一步"
                disabled={!replayIndex}
                onClick={() => {
                  setReplayPlaying(false);
                  setReplayIndex((i) => i - 1);
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                aria-label={replayPlaying ? "暂停回放" : "播放回放"}
                onClick={() => setReplayPlaying((v) => !v)}
              >
                {replayPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                aria-label="下一步"
                disabled={replayIndex === (save?.events.length ?? 0)}
                onClick={() => {
                  setReplayPlaying(false);
                  setReplayIndex((i) => i + 1);
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
                  setReplayPlaying(false);
                  setReplayIndex(Number(e.target.value));
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
              <MobileSupply state={viewed} />
              <LastActions
                actions={lastActions}
                turns={lastTurns}
                latestActor={latestActor}
                settled={!transition}
              />
            </section>
            <section className="table-column">
              <div className="board-divider" aria-hidden="true">
                牌桌
              </div>
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
                      {opponent.hand.length} 张手牌 · 驼队保密
                    </span>
                  </div>
                </div>
                <div
                  className="opponent-score"
                  data-motion-anchor="opponent-score"
                >
                  <b>{sum(opponent.goods)}</b>
                  <span>货物卢比</span>
                  <small>+ {opponent.bonuses.length} 枚秘密奖励</small>
                  <SaleReceipt receipt={receipts[1]} actor={1} />
                </div>
              </div>
              <section className="market-table">
                <div className="market-heading">
                  <div>
                    <p className="eyebrow">THE BAZAAR</p>
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
                      ✳
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
              <div className="turn-line" aria-live="polite">
                <span className={`status-dot ${active ? "your-turn" : ""}`} />
                {screen === "replay"
                  ? "正在回看已发生的交易"
                  : viewed.phase !== "playing"
                    ? "本轮集市已收市"
                    : transition
                      ? (transition.caption ??
                        `${transition.action.actor === 0 ? "你" : "米拉"}正在${{ take: "拿取货物", camels: "收下骆驼", sell: "出售货物", exchange: "交换货物" }[transition.action.type]}…`)
                      : aiError
                        ? "AI 等待重试"
                        : viewed.current === 1
                          ? "米拉正在盘算下一笔生意…"
                          : "轮到你了，今天想做哪笔生意？"}
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
                    <b>{sum(p.goods) + sum(p.bonuses)}</b>
                    <span>卢比</span>
                    <small>
                      货物 {sum(p.goods)} + 奖励 {sum(p.bonuses)}
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
          feedback={tutorialFeedback(tutorialStep, selection)}
          onHistory={() => setModal("log")}
          paused={!!transition || !!modal}
          onNext={() => setTutorialStep((step) => step + 1)}
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
      {transition && (screen === "game" || teaching) && (
        <ActionAnimation
          flights={transition.flights}
          elapsed={transition.duration - transitionRemaining.current}
          duration={transition.duration}
          paused={!!modal}
        />
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={modal === "rules" ? "游戏规则" : "行动记录"}
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
            ) : (
              <>
                <p className="eyebrow">THE MERCHANT’S JOURNAL</p>
                <h2>每一笔生意，都有迹可循。</h2>
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
