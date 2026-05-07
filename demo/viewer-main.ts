import { mountViewer } from "../src/viewer/index.js";

const host = document.getElementById("viewer");
if (!host) {
  throw new Error("Expected #viewer mount point in DOM");
}

const viewer = mountViewer(host);

// Hot-module reload: dispose the previous viewer before the next module
// instance mounts a fresh one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    viewer.dispose();
  });
}
