/**
 * Bottom-centre navigation control: Back / Continue (or Apply / Restart)
 * plus a "Beat n / 5" indicator.
 *
 * The component is dumb — it reflects the controller's state via `render()`
 * and emits callbacks on click. The owner wires those to the beat controller.
 */

import { type Beat, FIRST_BEAT, LAST_BEAT } from "../beat-controller.js";

export interface BeatNavCallbacks {
  onBack: () => void;
  onContinue: () => void;
  onApply: () => void;
  onRestart: () => void;
}

export interface BeatNavHandle {
  element: HTMLElement;
  render(beat: Beat): void;
}

export function createBeatNav(cb: BeatNavCallbacks): BeatNavHandle {
  const root = document.createElement("nav");
  root.className = "de-beat-nav";
  root.setAttribute("aria-label", "Walkthrough navigation");

  const backBtn = button("Back");
  backBtn.setAttribute("aria-label", "Back to previous beat");
  backBtn.addEventListener("click", () => cb.onBack());
  const label = document.createElement("span");
  label.className = "de-beat-nav__label";

  // The forward button's action changes per beat (Continue / Apply / Restart).
  // Route every click through a single dispatcher so we never double-bind:
  // earlier revisions added a permanent `addEventListener("click", onContinue)`
  // and *also* re-assigned `onclick` on each render, which fired both
  // handlers on a single click and skipped beats.
  let forwardAction: () => void = () => cb.onContinue();
  const forwardBtn = button("Continue");
  forwardBtn.classList.add("de-beat-nav__button--primary");
  forwardBtn.addEventListener("click", () => forwardAction());

  root.appendChild(backBtn);
  root.appendChild(label);
  root.appendChild(forwardBtn);

  function render(beat: Beat): void {
    label.textContent = `Beat ${beat} / ${LAST_BEAT}`;
    backBtn.disabled = beat <= FIRST_BEAT;
    if (beat === 3) {
      forwardBtn.textContent = "Apply";
      forwardBtn.setAttribute("aria-label", "Apply directive and advance");
      forwardAction = () => cb.onApply();
    } else if (beat === LAST_BEAT) {
      forwardBtn.textContent = "Restart";
      forwardBtn.setAttribute("aria-label", "Restart walkthrough");
      forwardAction = () => cb.onRestart();
    } else {
      forwardBtn.textContent = "Continue";
      forwardBtn.setAttribute("aria-label", "Continue to next beat");
      forwardAction = () => cb.onContinue();
    }
    forwardBtn.disabled = false;
  }

  return { element: root, render };
}

function button(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "de-beat-nav__button";
  btn.textContent = text;
  return btn;
}
