import { generateDirectives } from "../core/index.js";

const nominalPath = "datasets/toy_v0_1/toy_nominal_poses.json";
const asBuiltPath = "datasets/toy_v0_1/toy_asbuilt_poses.json";
const constraintsPath = "datasets/toy_v0_1/toy_constraints.json";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function main(): Promise<void> {
  const [nominal, asBuilt, constraints] = await Promise.all([
    fetchJson(nominalPath),
    fetchJson(asBuiltPath),
    fetchJson(constraintsPath)
  ]);

  const directives = generateDirectives({
    nominal,
    asBuilt,
    constraints,
    inputPaths: {
      nominal: nominalPath,
      asBuilt: asBuiltPath,
      constraints: constraintsPath
    }
  });

  document.body.innerHTML = `<pre>${JSON.stringify(directives, null, 2)}</pre>`;
}

main().catch((error) => {
  document.body.innerHTML = `<pre>${String(error)}</pre>`;
});
