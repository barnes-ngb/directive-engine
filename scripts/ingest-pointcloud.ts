/**
 * CLI: ingest a PLY/XYZ scan + nominal part lines, print per-part pose
 * estimates and human-readable directives.
 *
 *   npx tsx scripts/ingest-pointcloud.ts <scan.ply> <part-lines.json>
 *
 * part-lines.json: [{ "partId": "...", "p0Nominal": [x,y,z], "p1Nominal": [x,y,z] }, ...]
 *
 * Defaults applied here (nominal pose = midpoint of nominal line, identity
 * rotation; constraints = permissive 5mm/1° free DOF) so the engine has the
 * inputs it needs without a second config file. All real logic lives in
 * `src/pipelines/pointcloudIngest.ts`.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  ingestPointCloudToPoses,
  parsePly,
  parseXyz,
  type PartLineDef,
} from "../src/pipelines/pointcloudIngest.js";
import { generateDirectives } from "../src/core/generateDirectives.js";
import { formatDirective } from "../src/presentation/format-directive.js";
import type {
  ConstraintsDataset,
  NominalPosesDataset,
} from "../src/core/types.js";

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

async function main() {
  const [, , scanPath, partLinesPath] = process.argv;
  if (!scanPath || !partLinesPath) {
    fail("usage: npx tsx scripts/ingest-pointcloud.ts <scan.ply|scan.xyz> <part-lines.json>");
  }

  let scanText: string;
  try {
    scanText = await readFile(scanPath, "utf8");
  } catch (e) {
    fail(`could not read scan file '${scanPath}': ${(e as Error).message}`);
  }

  const ext = extname(scanPath).toLowerCase();
  let points;
  try {
    points = ext === ".xyz" ? parseXyz(scanText) : parsePly(scanText);
  } catch (e) {
    fail((e as Error).message);
  }
  console.log(`Parsed ${points.length} points from ${scanPath}`);

  let partLinesRaw: string;
  try {
    partLinesRaw = await readFile(partLinesPath, "utf8");
  } catch (e) {
    fail(`could not read part-lines file '${partLinesPath}': ${(e as Error).message}`);
  }

  let partLines: PartLineDef[];
  try {
    partLines = JSON.parse(partLinesRaw) as PartLineDef[];
  } catch (e) {
    fail(`could not parse part-lines JSON: ${(e as Error).message}`);
  }

  const asBuilt = ingestPointCloudToPoses({ points, partLines });

  for (const p of asBuilt.parts) {
    const t = p.T_world_part_asBuilt.translation_mm;
    console.log(
      `  ${p.part_id}: t=[${t[0].toFixed(2)}, ${t[1].toFixed(2)}, ${t[2].toFixed(2)}]mm  ` +
        `confidence=${(p.pose_confidence * 100).toFixed(1)}%`
    );
  }

  const nominal: NominalPosesDataset = {
    schema_version: "v0.1",
    dataset_id: "ingest_nominal",
    frame_id: "world",
    units: { length: "mm", rotation: "quaternion_xyzw" },
    parts: partLines.map((pl) => ({
      part_id: pl.partId,
      part_name: pl.partId,
      part_type: "line",
      T_world_part_nominal: {
        translation_mm: [
          (pl.p0Nominal[0] + pl.p1Nominal[0]) / 2,
          (pl.p0Nominal[1] + pl.p1Nominal[1]) / 2,
          (pl.p0Nominal[2] + pl.p1Nominal[2]) / 2,
        ],
        rotation_quat_xyzw: [0, 0, 0, 1],
      },
    })),
  };

  const constraints: ConstraintsDataset = {
    schema_version: "v0.1",
    dataset_id: "ingest_constraints",
    engine_config: { confidence_threshold: 0.5 },
    parts: partLines.map((pl) => ({
      part_id: pl.partId,
      allowed_translation_axes: { x: true, y: true, z: true },
      rotation_mode: "free",
      allowed_rotation_axes: { x: true, y: true, z: true },
      tolerances: { translation_mm: 5, rotation_deg: 1 },
    })),
  };

  const directives = generateDirectives({ nominal, asBuilt, constraints });

  const constraintMap = new Map(constraints.parts.map((c) => [c.part_id, c]));
  for (const step of directives.steps) {
    console.log(`  ${step.part_id}: ${formatDirective(step, constraintMap.get(step.part_id))}`);
  }
}

main().catch((e) => fail((e as Error).message));
