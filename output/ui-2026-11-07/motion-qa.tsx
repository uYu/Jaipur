import { createRoot } from "react-dom/client";
import App from "/src/App.tsx";
import closingFixtures from "./round-end-qa-fixtures.json";
import { createTutorialSave, TUTORIAL_ACTIONS } from "/src/game/tutorial.ts";
import { SAVE_KEY } from "/src/game/storage.ts";
import "/src/style.css";
import "/src/theme.css";
import "/src/menu-art.css";
import "/src/mobile-feedback.css";
import "/src/mobile-viewport.css";
import "/src/board-hierarchy.css";
import "/src/portrait-board.css";
import "/src/table-objects.css";
import "/src/desktop-board.css";

// Dedicated QA origin only. The player's save on 127.0.0.1 is untouched.
localStorage.setItem(
  SAVE_KEY,
  JSON.stringify(
    closingFixtures[
      new URLSearchParams(location.search).get(
        "ending",
      ) as keyof typeof closingFixtures
    ]?.save ?? {
      ...createTutorialSave(),
      informationMode:
        new URLSearchParams(location.search).get("information") === "assisted"
          ? "assisted"
          : "standard",
      events: TUTORIAL_ACTIONS.slice(
        0,
        Number(
          new URLSearchParams(location.search).get("prefix") ??
            TUTORIAL_ACTIONS.length,
        ),
      ),
    },
  ),
);
createRoot(document.getElementById("root")!).render(<App />);
const report = document.createElement("output");
report.id = "motion-report";
report.hidden = true;
document.body.append(report);
let prior: Element | null = null;
let frame = 0;
let gaps: number[] = [];
let maxAxisDifference = 0;
let flips = 0;
let faceRatios = new Map<string, number[]>();
let rotationSamples = new Set<string>();
let numberSamples: unknown[] = [];
let previousNumbers = "";
let saleStats = new Map<
  number,
  { firstVisibleAt: number; absorbedAt?: number; minimumVisibleScale: number }
>();
let shapes = new Map<string, number[]>();
function monitor(now: number) {
  const layer = document.querySelector(".flight-layer");
  if (layer && !prior) {
    numberSamples = [];
    previousNumbers = "";
    saleStats = new Map();
    gaps = [];
    maxAxisDifference = 0;
    flips = 0;
    shapes = new Map();
    faceRatios = new Map();
    rotationSamples = new Set();
    frame = now;
  }
  if (layer) {
    gaps.push(now - frame);
    for (const sprite of layer.querySelectorAll<HTMLElement>(
      ".flight-sprite",
    )) {
      const transform = new DOMMatrix(getComputedStyle(sprite).transform);
      if (sprite.dataset.flightTo === "sale") {
        const opacity = Number(getComputedStyle(sprite).opacity);
        const index = Array.from(layer.children).indexOf(sprite);
        const clock = Number(sprite.getAnimations()[0]?.currentTime ?? 0);
        let stats = saleStats.get(index);
        if (opacity > 0.05) {
          if (!stats) {
            stats = { firstVisibleAt: clock, minimumVisibleScale: transform.a };
            saleStats.set(index, stats);
          }
          stats.minimumVisibleScale = Math.min(
            stats.minimumVisibleScale,
            transform.a,
          );
        } else if (stats && opacity < 0.005 && stats.absorbedAt === undefined)
          stats.absorbedAt = clock;
      }
      maxAxisDifference = Math.max(
        maxAxisDifference,
        Math.abs(transform.a - transform.d),
      );
      const key = sprite.className;
      const face = sprite.querySelector<HTMLElement>(".card");
      if (face) {
        const css = getComputedStyle(face);
        faceRatios.set(key, [parseFloat(css.width), parseFloat(css.height)]);
        if (css.transform !== "none") rotationSamples.add(css.transform);
      }
      shapes.set(key, [
        parseFloat(sprite.style.width),
        parseFloat(sprite.style.height),
      ]);
      for (const motion of sprite
        .querySelector(".flight-back")
        ?.getAnimations() ?? []) {
        if (
          motion.effect instanceof KeyframeEffect &&
          motion.effect
            .getKeyframes()
            .some((f) => String(f.transform).includes("rotateY"))
        )
          flips++;
      }
    }
    const numbers = {
      herd: document
        .querySelector('[data-motion-anchor="your-herd"] .table-number')
        ?.getAttribute("data-value"),
      deck: document
        .querySelector('[data-motion-anchor="deck"] .table-number')
        ?.getAttribute("data-value"),
      money: document
        .querySelector(".reserve-money-own .money-pile-value .table-number")
        ?.getAttribute("data-value"),
      spice: [
        ...document.querySelectorAll(".supply-counter.spice .table-number"),
      ].map((e) => e.getAttribute("data-value")),
    };
    if (JSON.stringify(numbers) !== previousNumbers) {
      previousNumbers = JSON.stringify(numbers);
      numberSamples.push({ time: now, ...numbers });
    }
    frame = now;
  } else if (prior) {
    const sorted = gaps.slice(1).sort((a, b) => a - b);
    report.textContent = JSON.stringify({
      numberSamples,
      saleAbsorption: [...saleStats.values()],
      frames: sorted.length,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
      maxFrameMs: sorted.at(-1),
      framesOver50Ms: sorted.filter((n) => n > 50).length,
      maxAxisDifference,
      flipFrames: flips,
      distinctFaceRotations: rotationSamples.size,
      faceSizes: [...faceRatios],
      shapes: [...shapes],
    });
  }
  prior = layer;
  requestAnimationFrame(monitor);
}
requestAnimationFrame(monitor);
