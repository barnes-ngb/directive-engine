/**
 * Top-centre headline: short narrative line per beat plus a 5-dot beat
 * indicator. Pure DOM — no state of its own.
 */

import { type Beat, LAST_BEAT } from "../beat-controller.js";

export interface HeadlineCopy {
  title: string;
  subtitle?: string;
}

const COPY: Record<Beat, HeadlineCopy> = {
  1: {
    title: "Reality doesn't match the model.",
    subtitle: "Highlighted panels deviate from nominal.",
  },
  2: {
    title: "Every part has constraints.",
    subtitle: "Pivots, slots, and indexed bolt patterns bound what can move.",
  },
  3: {
    title: "Translate the deviation into a directive.",
    subtitle: "Engine emits a directive in installer language.",
  },
  4: {
    title: "Apply the correction.",
    subtitle: "Panel moves to within tolerance.",
  },
  5: {
    title: "Verify closure.",
    subtitle: "Residual deviation falls inside the acceptance band.",
  },
};

export interface HeadlineHandle {
  element: HTMLElement;
  render(beat: Beat): void;
}

export function createHeadline(): HeadlineHandle {
  const root = document.createElement("div");
  root.className = "de-overlay__headline";

  const title = document.createElement("h1");
  const subtitle = document.createElement("p");
  const dotsRow = document.createElement("div");
  dotsRow.className = "de-overlay__beat-indicator";

  const dots: HTMLElement[] = [];
  for (let i = 1; i <= LAST_BEAT; i++) {
    const dot = document.createElement("span");
    dot.className = "de-overlay__beat-dot";
    dots.push(dot);
    dotsRow.appendChild(dot);
  }

  root.appendChild(title);
  root.appendChild(subtitle);
  root.appendChild(dotsRow);

  function render(beat: Beat): void {
    const copy = COPY[beat];
    title.textContent = copy.title;
    subtitle.textContent = copy.subtitle ?? "";
    subtitle.style.display = copy.subtitle ? "" : "none";
    for (let i = 0; i < dots.length; i++) {
      const idx = (i + 1) as Beat;
      dots[i].classList.toggle("is-active", idx === beat);
      dots[i].classList.toggle("is-done", idx < beat);
    }
  }

  return { element: root, render };
}
