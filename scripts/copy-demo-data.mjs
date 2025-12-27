import { readdir, mkdir, copyFile, stat } from "node:fs/promises";
import path from "node:path";

const SRC_DIR = path.resolve("datasets", "toy_v0_1");
const DEST_DIR = path.resolve("demo", "public");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SRC_DIR))) {
    throw new Error(`Source dataset folder not found: ${SRC_DIR}`);
  }

  await mkdir(DEST_DIR, { recursive: true });

  const files = await readdir(SRC_DIR);
  const toCopy = files.filter((f) => f.startsWith("toy_") && f.endsWith(".json"));

  if (toCopy.length === 0) {
    throw new Error(`No toy_*.json files found in: ${SRC_DIR}`);
  }

  for (const f of toCopy) {
    await copyFile(path.join(SRC_DIR, f), path.join(DEST_DIR, f));
  }

  console.log(`Copied ${toCopy.length} file(s) to ${DEST_DIR}:`);
  for (const f of toCopy) console.log(`  - ${f}`);
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
