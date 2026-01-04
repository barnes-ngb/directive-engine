#!/usr/bin/env npx tsx
/**
 * Run the pose-from-scan pipeline on the test dataset.
 * This dataset has well-aligned anchors to demonstrate PASS behavior.
 *
 * Usage: npx tsx src/pipelines/runTestPipeline.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runPoseFromScanPipeline, DEFAULT_PIPELINE_CONFIG } from "./poseFromScan.js";
import type { MuseumRawDataset } from "../core/museum/raw.js";
import type { ConstraintsDataset } from "../core/types.js";

async function readJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  POSE FROM SCAN PIPELINE - Test Dataset                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const dataDir = "datasets/test_scan_pipeline";
  const rawPath = path.join(dataDir, "test_raw.json");
  const constraintsPath = path.join(dataDir, "test_constraints.json");

  console.log(`\nLoading data from: ${dataDir}`);

  // Load datasets
  const raw = await readJson<MuseumRawDataset>(rawPath);
  const constraints = await readJson<ConstraintsDataset>(constraintsPath);

  console.log(`Dataset: ${raw.dataset_id}`);
  console.log(`Anchors: ${raw.anchors.length}`);
  console.log(`Parts: ${raw.parts?.length ?? 0}`);

  // Configure pipeline - use settings that work well with the test data
  const config = {
    ...DEFAULT_PIPELINE_CONFIG,
    anchor_rms_threshold_mm: 5,        // Target ≤5mm
    tube_radius_mm: 50,                // Wider radius for test data
    synthetic_points_per_part: 100,    // Points per part
    synthetic_noise_mm: 2,             // Lower noise for cleaner fits
    verification_tolerance_mm: 5,      // PASS/FAIL threshold
  };

  // Run pipeline
  const result = runPoseFromScanPipeline(raw, constraints, config);

  // Output results to file
  const outputDir = "datasets/test_scan_pipeline/pipeline_output";
  await mkdir(outputDir, { recursive: true });

  await writeFile(
    path.join(outputDir, "pipeline_result.json"),
    JSON.stringify(result, null, 2)
  );

  await writeFile(
    path.join(outputDir, "nominal_poses.json"),
    JSON.stringify(result.nominal_poses, null, 2)
  );

  await writeFile(
    path.join(outputDir, "asbuilt_poses.json"),
    JSON.stringify(result.asbuilt_poses, null, 2)
  );

  await writeFile(
    path.join(outputDir, "directives_output.json"),
    JSON.stringify(result.directives, null, 2)
  );

  console.log(`\n✓ Results written to ${outputDir}/`);

  // Final report
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  FINAL REPORT                                                  ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  const anchorStatus = result.summary.anchor_within_tolerance ? "✓ PASS" : "✗ FAIL";
  console.log(`\nAnchor Alignment: ${anchorStatus}`);
  console.log(`  RMS: ${result.summary.anchor_rms_mm.toFixed(2)} mm (target ≤ ${config.anchor_rms_threshold_mm} mm)`);

  console.log(`\nParts Summary:`);
  console.log(`  Processed: ${result.summary.parts_processed}`);
  console.log(`  PASS:      ${result.summary.parts_passed}`);
  console.log(`  FAIL:      ${result.summary.parts_failed}`);

  // Directive cards for each part
  console.log("\n────────────────────────────────────────────────────────────────");
  console.log("DIRECTIVE CARDS");
  console.log("────────────────────────────────────────────────────────────────");

  for (const sim of result.simulations) {
    const step = sim.step;
    const partFit = result.part_fits.find((pf) => pf.part_id === sim.part_id);
    const action = step.actions.find((a) => a.type !== "noop");

    console.log(`\n┌─────────────────────────────────────────────────────────────┐`);
    console.log(`│ ${step.part_id.padEnd(57)} │`);
    console.log(`├─────────────────────────────────────────────────────────────┤`);

    if (partFit) {
      console.log(`│ Fit RMS: ${partFit.lineFit.fit_rms_mm.toFixed(2)} mm`.padEnd(62) + "│");
      console.log(`│ Confidence: ${(partFit.pose.pose_confidence * 100).toFixed(0)}%`.padEnd(62) + "│");
    }

    console.log(`│ Status: ${step.status}`.padEnd(62) + "│");
    console.log(`│ Before Error: ${sim.before_error_mm.toFixed(2)} mm`.padEnd(62) + "│");
    console.log(`│ After Error:  ${sim.after_error_mm.toFixed(2)} mm`.padEnd(62) + "│");

    if (action) {
      console.log(`│ Action: ${action.type}`.padEnd(62) + "│");
      if (action.delta) {
        const t = action.delta.translation_mm;
        console.log(`│   Move: [${t[0].toFixed(1)}, ${t[1].toFixed(1)}, ${t[2].toFixed(1)}] mm`.padEnd(62) + "│");
      }
    }

    const verdict = sim.pass ? "✓ PASS" : "✗ FAIL";
    console.log(`│ Verification: ${verdict}`.padEnd(62) + "│");
    console.log(`└─────────────────────────────────────────────────────────────┘`);
  }
}

main().catch((err) => {
  console.error("Pipeline error:", err);
  process.exit(1);
});
