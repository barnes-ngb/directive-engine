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

  const backBtn = button("Back", () => cb.onBack());
  backBtn.setAttribute("aria-label", "Back to previous beat");
  const label = document.createElement("span");
  label.className = "de-beat-nav__label";
  const forwardBtn = button("Continue", () => cb.onContinue());
  forwardBtn.classList.add("de-beat-nav__button--primary");

  root.appendChild(backBtn);
  root.appendChild(label);
  root.appendChild(forwardBtn);

  function render(beat: Beat): void {
    label.textContent = `Beat ${beat} / ${LAST_BEAT}`;
    backBtn.disabled = beat <= FIRST_BEAT;
    if (beat === 3) {
      forwardBtn.textContent = "Apply";
      forwardBtn.setAttribute("aria-label", "Apply directive and advance");
      forwardBtn.onclick = () => cb.onApply();
      forwardBtn.disabled = false;
    } else if (beat === LAST_BEAT) {
      forwardBtn.textContent = "Restart";
      forwardBtn.setAttribute("aria-label", "Restart walkthrough");
      forwardBtn.onclick = () => cb.onRestart();
      forwardBtn.disabled = false;
    } else {
      forwardBtn.textContent = "Continue";
      forwardBtn.setAttribute("aria-label", "Continue to next beat");
      forwardBtn.onclick = () => cb.onContinue();
      forwardBtn.disabled = false;
    }
  }

  return { element: root, render };
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "de-beat-nav__button";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}
