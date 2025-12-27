import { generateDirectives } from "../core/index.js";

const datasetBase = "datasets/toy_v0_1";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function renderDirectives(): Promise<void> {
  const [nominal, asBuilt, constraints] = await Promise.all([
    fetchJson(`${datasetBase}/toy_nominal_poses.json`),
    fetchJson(`${datasetBase}/toy_asbuilt_poses.json`),
    fetchJson(`${datasetBase}/toy_constraints.json`)
  ]);

  const directives = generateDirectives({
    nominal,
    asBuilt,
    constraints,
    options: {
      inputPaths: {
        nominal: `${datasetBase}/toy_nominal_poses.json`,
        asBuilt: `${datasetBase}/toy_asbuilt_poses.json`,
        constraints: `${datasetBase}/toy_constraints.json`
      }
    }
  });

  document.body.innerHTML = `<pre>${JSON.stringify(directives, null, 2)}</pre>`;
}

renderDirectives().catch((error: Error) => {
  document.body.innerHTML = `<pre>Failed to load directives: ${error.message}</pre>`;
});
