/**
 * Export utilities for Directive Engine Demo
 * Provides download functionality for JSON, Markdown summary, and CSV formats
 */

import type {
  DirectivesOutput,
  Status
} from "../src/types.js";
import type { SimulationResult } from "../src/core/index.js";
import { STATUS_PRIORITY, formatResidual } from "./summary.js";

/** Alignment result from rigid registration (museum dataset) */
export interface AlignmentResult {
  rms_mm: number;
  residuals_mm: Array<{
    anchor_id: string;
    residual_mm: number;
    residual_vec_mm?: [number, number, number];
  }>;
}

/** Context needed to generate exports */
export interface ExportContext {
  directives: DirectivesOutput;
  alignment?: AlignmentResult | null;
  simulationResults: Map<string, SimulationResult>;
  constraints?: {
    parts: Array<{
      part_id: string;
      tolerances: { translation_mm: number; rotation_deg: number };
    }>;
  };
}

/**
 * Trigger a file download in the browser
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download directives.json - the raw engine output
 */
export function downloadDirectivesJson(directives: DirectivesOutput): void {
  const content = JSON.stringify(directives, null, 2);
  downloadFile(content, "directives.json", "application/json");
}

/**
 * Generate run_summary.md content
 * Includes: dataset_id, alignment RMS + top 3 residuals (museum),
 * counts by status, simulated pass/fail rollup, top 5 largest move norms
 */
export function generateRunSummaryMd(context: ExportContext): string {
  const { directives, alignment, simulationResults, constraints } = context;
  const lines: string[] = [];

  // Header
  lines.push("# Directive Engine Run Summary");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  // Dataset info
  lines.push("## Dataset");
  lines.push("");
  lines.push(`- **Dataset ID:** ${directives.dataset_id}`);
  lines.push(`- **Engine Version:** ${directives.engine_version}`);
  lines.push(`- **Run Generated At:** ${directives.generated_at}`);
  lines.push("");

  // Alignment Quality (museum only)
  if (alignment) {
    lines.push("## Alignment Quality");
    lines.push("");
    lines.push(`- **RMS (mm):** ${formatResidual(alignment.rms_mm)}`);
    lines.push("");

    // Top 3 residual anchors
    const sortedResiduals = [...alignment.residuals_mm].sort(
      (a, b) => b.residual_mm - a.residual_mm
    );
    const top3 = sortedResiduals.slice(0, 3);

    if (top3.length > 0) {
      lines.push("### Top 3 Residual Anchors");
      lines.push("");
      lines.push("| Anchor | Residual (mm) |");
      lines.push("|--------|---------------|");
      for (const entry of top3) {
        lines.push(`| ${entry.anchor_id} | ${formatResidual(entry.residual_mm)} |`);
      }
      lines.push("");
    }
  }

  // Counts by Status
  lines.push("## Counts by Status");
  lines.push("");
  const counts = directives.summary?.counts_by_status;
  if (counts) {
    lines.push("| Status | Count |");
    lines.push("|--------|-------|");
    for (const status of STATUS_PRIORITY) {
      const label = status.replace(/_/g, " ");
      lines.push(`| ${label} | ${counts[status] ?? 0} |`);
    }
    lines.push("");
  }

  // Simulated Pass/Fail Rollup
  if (simulationResults.size > 0) {
    lines.push("## Simulated Pass/Fail Rollup");
    lines.push("");

    let passCount = 0;
    let failCount = 0;
    for (const result of simulationResults.values()) {
      if (result.pass) {
        passCount++;
      } else {
        failCount++;
      }
    }
    const total = passCount + failCount;
    const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : "N/A";

    lines.push(`- **Simulated:** ${total} parts`);
    lines.push(`- **Pass:** ${passCount}`);
    lines.push(`- **Fail:** ${failCount}`);
    lines.push(`- **Pass Rate:** ${passRate}%`);
    lines.push("");
  }

  // Top 5 Largest Move Norms
  lines.push("## Top 5 Largest Move Norms");
  lines.push("");

  const stepsWithNorms = directives.steps
    .map((step) => {
      const norm = step.computed_errors.translation_error_norm_mm;
      return { part_id: step.part_id, norm };
    })
    .sort((a, b) => b.norm - a.norm);

  const top5 = stepsWithNorms.slice(0, 5);

  if (top5.length > 0) {
    lines.push("| Part ID | Move Norm (mm) |");
    lines.push("|---------|----------------|");
    for (const entry of top5) {
      lines.push(`| ${entry.part_id} | ${formatResidual(entry.norm)} |`);
    }
    lines.push("");
  } else {
    lines.push("_No parts with computed move norms._");
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("_Generated by Directive Engine Demo_");

  return lines.join("\n");
}

/**
 * Download run_summary.md
 */
export function downloadRunSummaryMd(context: ExportContext): void {
  const content = generateRunSummaryMd(context);
  downloadFile(content, "run_summary.md", "text/markdown");
}

/**
 * Escape a CSV field value
 */
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate directives.csv content
 * Columns: part_id, status, dx, dy, dz, move_norm_mm, tol_mm, rot_deg, tol_rot_deg, sim_after_norm_mm, sim_pass
 */
export function generateDirectivesCsv(context: ExportContext): string {
  const { directives, simulationResults, constraints } = context;
  const lines: string[] = [];

  // Header row
  const headers = [
    "part_id",
    "status",
    "dx",
    "dy",
    "dz",
    "move_norm_mm",
    "tol_mm",
    "rot_deg",
    "tol_rot_deg",
    "sim_after_norm_mm",
    "sim_pass"
  ];
  lines.push(headers.join(","));

  // Data rows
  for (const step of directives.steps) {
    const partConstraint = constraints?.parts.find((p) => p.part_id === step.part_id);
    const simResult = simulationResults.get(step.part_id);

    const [dx, dy, dz] = step.computed_errors.translation_error_mm_vec;
    const moveNorm = step.computed_errors.translation_error_norm_mm;
    const rotDeg = step.computed_errors.rotation_error_deg;

    const tolMm = partConstraint?.tolerances.translation_mm ?? "";
    const tolRotDeg = partConstraint?.tolerances.rotation_deg ?? "";

    const simAfterNorm = simResult?.afterError.translation_norm_mm ?? "";
    const simPass = simResult ? (simResult.pass ? "true" : "false") : "";

    const row = [
      escapeCsvField(step.part_id),
      escapeCsvField(step.status),
      escapeCsvField(formatResidual(dx)),
      escapeCsvField(formatResidual(dy)),
      escapeCsvField(formatResidual(dz)),
      escapeCsvField(formatResidual(moveNorm)),
      escapeCsvField(tolMm),
      escapeCsvField(formatResidual(rotDeg)),
      escapeCsvField(tolRotDeg),
      escapeCsvField(simAfterNorm !== "" ? formatResidual(simAfterNorm as number) : ""),
      escapeCsvField(simPass)
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Download directives.csv
 */
export function downloadDirectivesCsv(context: ExportContext): void {
  const content = generateDirectivesCsv(context);
  downloadFile(content, "directives.csv", "text/csv");
}

/**
 * Print the current view (triggers browser print dialog for PDF save)
 */
export function printView(): void {
  window.print();
}
