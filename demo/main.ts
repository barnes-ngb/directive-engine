const runButton = document.querySelector<HTMLButtonElement>(".run-button");
const statusBadge = document.querySelector<HTMLSpanElement>("#status-badge");

if (runButton && statusBadge) {
  runButton.addEventListener("click", () => {
    statusBadge.textContent = "Running";
  });
}
