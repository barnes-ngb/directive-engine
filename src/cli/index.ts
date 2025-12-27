import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { generateDirectives } from "../core/index.js";
import type { NominalPosesDataset, AsBuiltPosesDataset, ConstraintsDataset } from "../types.js";

function parseArgs(argv: string[]): Record<string,string> {
  const out: Record<string,string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i+1];
    if (!val || val.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nominalPath = args["nominal"];
  const asBuiltPath = args["asbuilt"];
  const constraintsPath = args["constraints"];
  const outPath = args["out"] ?? "out/directives.json";

  if (!nominalPath || !asBuiltPath || !constraintsPath) {
    console.error("Usage: tsx src/cli/index.ts --nominal <path> --asbuilt <path> --constraints <path> [--out <path>]");
    process.exit(1);
  }

  const nominal = await readJson<NominalPosesDataset>(nominalPath);
  const asBuilt = await readJson<AsBuiltPosesDataset>(asBuiltPath);
  const constraints = await readJson<ConstraintsDataset>(constraintsPath);

  const directives = generateDirectives({
    nominal,
    asBuilt,
    constraints,
    inputPaths: { nominal: nominalPath, asBuilt: asBuiltPath, constraints: constraintsPath }
  });

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(directives, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
