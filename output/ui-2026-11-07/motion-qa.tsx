import { createRoot } from "react-dom/client";
import App from "/src/App.tsx";
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
  JSON.stringify({ ...createTutorialSave(), events: TUTORIAL_ACTIONS }),
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
let shapes = new Map<string, number[]>();
function monitor(now: number) {
  const layer = document.querySelector(".flight-layer");
  if (layer && !prior) {
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
    frame = now;
  } else if (prior) {
    const sorted = gaps.slice(1).sort((a, b) => a - b);
    report.textContent = JSON.stringify({
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
