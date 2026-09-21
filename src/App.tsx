import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Home,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Upload,
  X,
} from "lucide-react";
import type { Difficulty, Event, Save, State } from "./game/types.ts";
import { GOODS } from "./game/types.ts";
import { ENGLISH, LABEL, precious, sum } from "./game/data.ts";
import { newGame } from "./game/engine.ts";
import {
  emptySelection,
  selectMarket,
  selectHand,
  selectCamels,
  selectedAction,
} from "./game/selection.ts";
import { observe } from "./game/ai.ts";
import {
  advance,
  downloadSave,
  parseSave,
  replay,
  SAVE_KEY,
} from "./game/storage.ts";
import { GoodsArt, Palace } from "./components/Art.tsx";
import { Card } from "./components/Card.tsx";
import { MobileSupply } from "./components/MobileSupply.tsx";
import { ResultDialog, resultTitle } from "./components/ResultDialog.tsx";
import { SaleReceipt } from "./components/SaleReceipt.tsx";
import { saleReceipts } from "./game/receipts.ts";
import { ActionAnimation } from "./components/ActionAnimation.tsx";
import { actionFlights, dealFlights } from "./game/flights.ts";
import type { Flight } from "./game/flights.ts";
import { presentAction } from "./game/presentation.ts";
import type { Presentation } from "./game/presentation.ts";
import { Rules } from "./components/Rules.tsx";
import { readPreferences, writePreferences } from "./game/preferences.ts";
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
  return (
    <select
      aria-label="AI 难度"
      value={value}
      onChange={(e) => onChange(e.target.value as Difficulty)}
    >
      <option value="easy">轻松 · 随性商人</option>
      <option value="normal">普通 · 精明商人</option>
      <option value="hard">困难 · 老练商人</option>
    </select>
  );
}
export default function App() {
  const [initial] = useState(initialSave),
    [save, setSave] = useState<Save | null>(initial.save);
  const [game, setGame] = useState(() =>
    initial.save ? replay(initial.save) : null,
  );
  const [screen, setScreen] = useState<"menu" | "game" | "replay">("menu");
  const [dismissedResult, setDismissedResult] = useState("");
  const [inspectResult, setInspectResult] = useState(false);
  const [menu, setMenu] = useState<"home" | "new" | "settings">("home");
  const [modal, setModal] = useState<"rules" | "log" | null>(null),
    [paused, setPaused] = useState(false);
  const [preferences] = useState(readPreferences);
  const [difficulty, setDifficulty] = useState<Difficulty>(
      preferences.difficulty,
    ),
    [speed, setSpeed] = useState(preferences.speed);
  useEffect(() => {
    writePreferences({ difficulty, speed });
  }, [difficulty, speed]);
  const [error, setError] = useState(initial.error),
    [aiError, setAiError] = useState(""),
    [retry, setRetry] = useState(0);
  const [transition, setTransition] = useState<{
    before: State;
    action: Presentation;
    caption?: string;
    flights: Flight[];
    duration: number;
  } | null>(null);
  const transitionRemaining = useRef(0);
  useEffect(() => {
    if (!transition || screen !== "game" || paused || modal) return;
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
  }, [transition, screen, paused, modal]);
  const [selection, setSelection] = useState(emptySelection);
  const { market, hand, camels } = selection;
  const [replayIndex, setReplayIndex] = useState(0),
    [replayPlaying, setReplayPlaying] = useState(false);
  const receipts = useMemo(
    () =>
      saleReceipts(
        save,
        screen === "replay" ? replayIndex : save?.events.length,
      ),
    [save, screen, replayIndex],
  );
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
        const duration =
          (speed === 350 ? 1400 : speed === 2000 ? 3500 : 2500) +
          (event.type === "exchange" ? 500 : event.type === "sell" ? 1100 : 0);
        transitionRemaining.current = duration;
        setTransition({
          before: game,
          action: presentAction(game, event, next),
          flights: actionFlights(game, event, next),
          duration,
        });
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
      paused ||
      modal ||
      aiError ||
      transition
    )
      return;
    const worker = new Worker(new URL("./game/ai.worker.ts", import.meta.url), {
      type: "module",
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
      observation: observe(game, save?.events),
      difficulty: save?.difficulty ?? difficulty,
    });
    return () => {
      active = false;
      clearTimeout(timer);
      worker.terminate();
    };
    // A fresh worker receives only the acting player's observation for each committed turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, screen, paused, modal, speed, retry, aiError, transition]);
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
      screen === "replay" && save
        ? replay(save, replayIndex)
        : screen === "game" && transition
          ? transition.before
          : game,
    [screen, save, replayIndex, game, transition],
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
  function animateDeal(state: State) {
    const duration = speed === 350 ? 1700 : speed === 2000 ? 3600 : 2700;
    transitionRemaining.current = duration;
    setTransition({
      before: state,
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
  }
  function start() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const fresh: Save = { version: 1, seed, difficulty, events: [] };
    setDismissedResult("");
    const freshGame = newGame(seed);
    animateDeal(freshGame);
    setSave(fresh);
    setGame(freshGame);
    setScreen("game");
    setMenu("home");
    setPaused(false);
    setAiError("");
    clear();
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error("存档文件过大");
      const imported = parseSave(await file.text());
      setTransition(null);
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
  const active =
    screen === "game" &&
    viewed?.phase === "playing" &&
    viewed.current === 0 &&
    !paused &&
    !modal &&
    !transition;
  const { action, error: selectionError } =
    viewed && active
      ? selectedAction(viewed, selection)
      : { action: null, error: "" };
  const soldValue =
    action?.type === "sell" && viewed
      ? sum(viewed.tokens[action.good].slice(0, action.count))
      : 0;
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
                        setPaused(false);
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
                  <span>先赢 2 轮</span>
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
                  <label>
                    对手难度
                    <DifficultySelect
                      value={difficulty}
                      onChange={setDifficulty}
                    />
                  </label>
                  <p className="muted">
                    {difficulty === "easy"
                      ? "更多随机选择，适合熟悉规则。"
                      : difficulty === "normal"
                        ? "平衡收集、交易收益与驼队资源。"
                        : "额外考虑筹码竞争、收市时机和留给你的机会。"}
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
        <main className="game-shell">
          <header className="game-header">
            {brand}
            <div className="header-round">
              第 {viewed.round} 轮 <span>·</span> 先赢两枚印章
            </div>
            <nav>
              <button
                title="游戏规则"
                aria-label="游戏规则"
                onClick={() => setModal("rules")}
              >
                <BookOpen size={19} />
              </button>
              <button
                title="行动记录"
                aria-label="行动记录"
                onClick={() => setModal("log")}
              >
                <History size={19} />
              </button>
              {screen === "game" && (
                <button
                  title={paused ? "继续" : "暂停"}
                  aria-label={paused ? "继续" : "暂停"}
                  onClick={() => setPaused((v) => !v)}
                >
                  {paused ? <Play size={19} /> : <Pause size={19} />}
                </button>
              )}
              <button
                title="返回菜单"
                aria-label="返回菜单"
                onClick={() => {
                  setScreen("menu");
                  setMenu("home");
                  setReplayPlaying(false);
                }}
              >
                <Home size={19} />
              </button>
            </nav>
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
            <section className="table-column">
              <MobileSupply state={viewed} />
              <div
                className={`opponent-panel ${viewed.current === 1 && viewed.phase === "playing" ? "turn-active" : ""}`}
              >
                <div className="avatar">米</div>
                <div className="player-name" data-motion-anchor="opponent-herd">
                  <h2>
                    米拉{" "}
                    <span>
                      集市商人 ·{" "}
                      {
                        { easy: "轻松", normal: "普通", hard: "困难" }[
                          save?.difficulty ?? difficulty
                        ]
                      }
                    </span>
                  </h2>
                  <div className="seals">
                    {[0, 1].map((n) => (
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
                  className="opponent-cards"
                  data-motion-anchor="opponent-hand"
                  aria-label={`对手有 ${opponent.hand.length} 张隐藏手牌`}
                >
                  {opponent.hand.map((_, i) => (
                    <span className="card-back" key={i}>
                      ✳
                    </span>
                  ))}
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
                <div className="market-cards">
                  {viewed.market.map((good, i) => (
                    <Card
                      key={`${i}-${good}`}
                      motionId={`market-${i}`}
                      good={good}
                      selected={market.includes(i)}
                      disabled={!active}
                      onClick={() =>
                        setSelection((current) =>
                          selectMarket(viewed, current, i),
                        )
                      }
                    />
                  ))}
                </div>
                <div className="market-bottom">
                  <span>
                    <span className="deck-icon" data-motion-anchor="deck">
                      ✳
                    </span>
                    牌堆 <b>{viewed.deck.length}</b> 张
                  </span>
                  <span className="sale-area">
                    <span className="sale-slot" data-motion-anchor="sale">
                      {viewed.discard.length ? (
                        <GoodsArt good={viewed.discard.at(-1)!} />
                      ) : (
                        "↓"
                      )}
                    </span>
                    <span>
                      售卖区 <b>{viewed.discard.length}</b> 张
                    </span>
                  </span>
                  <span className="market-end-note">
                    {GOODS.filter((g) => !viewed.tokens[g].length).length} / 3
                    类筹码售罄
                  </span>
                </div>
              </section>
              <div className="turn-line" aria-live="polite">
                <span className={`status-dot ${active ? "your-turn" : ""}`} />
                {screen === "replay"
                  ? "正在回看已发生的交易"
                  : viewed.phase !== "playing"
                    ? "本轮集市已收市"
                    : paused
                      ? "比赛已暂停"
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
              <section className="hand-panel">
                <div className="hand-heading">
                  <div className="you-label">
                    <div className="avatar you">你</div>
                    <div>
                      <h2>
                        你的货摊 <span>{p.hand.length} / 7 张</span>
                      </h2>
                      <div className="seals">
                        {[0, 1].map((n) => (
                          <span
                            key={n}
                            className={viewed.seals[0] > n ? "won" : ""}
                          >
                            ✺
                          </span>
                        ))}
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
                          disabled={!active}
                          onClick={() =>
                            setSelection((current) =>
                              selectHand(viewed, current, i),
                            )
                          }
                        />
                      ))
                    ) : (
                      <div className="empty-hand">
                        货摊空空，去集市发现下一笔好生意。
                      </div>
                    )}
                  </div>
                  <div className="herd" data-motion-anchor="your-herd">
                    <button
                      className={`herd-select ${camels ? "selected" : ""}`}
                      aria-label="选择一头骆驼用于交换"
                      disabled={!active || camels >= p.camels}
                      onClick={() =>
                        setSelection((current) =>
                          selectCamels(viewed, current, current.camels + 1),
                        )
                      }
                    >
                      <GoodsArt good="camel" />
                    </button>
                    <strong>
                      {p.camels}
                      <small>头骆驼</small>
                    </strong>
                    {active ? (
                      <div className="stepper">
                        <button
                          aria-label="减少付出骆驼"
                          disabled={!camels}
                          onClick={() =>
                            setSelection((current) =>
                              selectCamels(viewed, current, current.camels - 1),
                            )
                          }
                        >
                          −
                        </button>
                        <span>{camels}</span>
                        <button
                          aria-label="增加付出骆驼"
                          disabled={camels >= p.camels}
                          onClick={() =>
                            setSelection((current) =>
                              selectCamels(viewed, current, current.camels + 1),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span>不占手牌上限</span>
                    )}
                  </div>
                </div>
              </section>
              {viewed.phase === "playing" && screen === "game" ? (
                <section className="action-panel">
                  <div className="action-description" aria-live="polite">
                    <b>
                      {action?.type === "camels"
                        ? `收下市场全部 ${market.length} 头骆驼`
                        : action?.type === "exchange"
                          ? `换入 ${market.length} 张 · 付出 ${hand.length} 张货物 + ${camels} 头骆驼`
                          : action?.type === "sell"
                            ? `出售 ${hand.length} 张${LABEL[action.good]}`
                            : action?.type === "take"
                              ? `拿取 1 张${LABEL[viewed.market[action.index]]}`
                              : "直接点选卡牌，决定这笔生意"}
                    </b>
                    <span className={selectionError ? "invalid" : ""}>
                      {selectionError ||
                        (action?.type === "sell"
                          ? `获得 ${soldValue} 卢比${action.count >= 3 ? "，并在奖励堆有剩余时领取奖励" : ""}`
                          : action?.type === "exchange"
                            ? "数量已配平，可以确认交换；再次点击可取消选牌"
                            : action?.type === "camels"
                              ? "骆驼加入你的驼队，不占手牌上限"
                              : action?.type === "take"
                                ? "继续点选市场与手牌可组成交换；再次点击取消"
                                : "点市场拿取，点手牌出售；两边选牌进行交换，点驼队付出骆驼")}
                    </span>
                  </div>
                  <button
                    className="clear-button"
                    aria-label="清空选择"
                    title="清空选择"
                    disabled={!active}
                    onClick={clear}
                  >
                    <RotateCcw size={17} />
                  </button>
                  <button
                    className="primary confirm"
                    disabled={!active || !action || !!selectionError}
                    onClick={() => action && commit(action)}
                  >
                    <Check size={17} />
                    {action?.type === "camels"
                      ? "收下全部骆驼"
                      : action?.type === "sell"
                        ? "确认出售"
                        : action?.type === "exchange"
                          ? "确认交换"
                          : action?.type === "take"
                            ? "确认拿取"
                            : "确认交易"}
                  </button>
                </section>
              ) : null}
              {paused && screen === "game" && viewed.phase === "playing" && (
                <div className="pause-note">
                  <Pause size={18} />
                  休息一下，集市等你回来。
                  <button onClick={() => setPaused(false)}>继续比赛 →</button>
                </div>
              )}
              {aiError && (
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
            <aside className="token-column">
              <div className="tokens-title">
                <div>
                  <p className="eyebrow">THE PRICE OF OPPORTUNITY</p>
                  <h2>货物筹码</h2>
                </div>
                <ShoppingBag size={20} />
              </div>
              <p className="token-note">先卖先得，从左侧最高价值取起</p>
              <p className="premium-guide">
                <b>高级货物</b>钻石 · 黄金 · 白银<span>至少 2 张起售</span>
              </p>
              <div className="token-stacks">
                {GOODS.map((g) => (
                  <div
                    className={`token-row ${g} ${precious(g) ? "premium-row" : ""}`}
                    data-motion-anchor={`tokens-${g}`}
                    key={g}
                  >
                    <div className="token-label">
                      <span>
                        {LABEL[g]}{" "}
                        {precious(g) ? (
                          <em className="premium-tag">高级</em>
                        ) : (
                          <small>{ENGLISH[g]}</small>
                        )}
                      </span>
                      <span>{viewed.tokens[g].length} 枚</span>
                    </div>
                    <div className="coins">
                      {viewed.tokens[g].length ? (
                        viewed.tokens[g].map((v, i) => (
                          <span
                            className={`coin ${i === 0 ? "top" : ""}`}
                            data-motion-anchor={`token-${g}-${i}`}
                            key={i}
                          >
                            {v}
                          </span>
                        ))
                      ) : (
                        <span className="sold-out">已售罄</span>
                      )}
                    </div>
                    <div className="token-min">
                      {precious(g) ? "至少出售 2 张" : "1 张起售"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="bonus-section">
                <h3>
                  大宗交易奖励 <span>随机面值</span>
                </h3>
                <div className="bonus-tokens" data-motion-anchor="bonus">
                  {([3, 4, 5] as const).map((n) => (
                    <div key={n}>
                      <div
                        data-motion-anchor={`bonus-${n}`}
                        className={`bonus-coin bonus-${n} ${!viewed.bonus[n].length ? "depleted" : ""}`}
                      >
                        {n}
                        {n === 5 ? "+" : ""}
                        <small>张</small>
                      </div>
                      <b>{n === 3 ? "1–3" : n === 4 ? "4–6" : "8–10"} 卢比</b>
                      <span>剩余 {viewed.bonus[n].length} 枚</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="camel-award">
                <GoodsArt good="camel" />
                <div>
                  <b>
                    驼队奖励 <span>+5</span>
                  </b>
                  <p>收市时，骆驼更多的商人获得</p>
                </div>
              </div>
            </aside>
          </div>
          <footer className="game-footer">
            <span>JAIPUR · 每一笔交易，都是一次取舍。</span>
            <span>
              {screen === "replay"
                ? "回放不会改变存档"
                : "进度自动保存在此浏览器"}
            </span>
          </footer>
        </main>
      ) : null}
      {showResult && viewed && (
        <ResultDialog
          state={viewed}
          onClose={closeResult}
          onNext={
            screen === "game"
              ? () => {
                  setPaused(false);
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
      {transition && screen === "game" && (
        <ActionAnimation
          flights={transition.flights}
          elapsed={transition.duration - transitionRemaining.current}
          duration={transition.duration}
          paused={paused || !!modal}
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
                <ol className="log-list">
                  {(viewed?.log ?? []).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
