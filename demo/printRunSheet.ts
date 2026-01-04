/**
 * Print Run Sheet Generator
 * Creates a print-friendly view with QR codes for each part
 */

import QRCode from "qrcode";
import type { DirectivesOutput, Status, Step } from "../src/types.js";
import type { SimulationResult } from "../src/core/index.js";
import { STATUS_PRIORITY, formatResidual } from "./summary.js";
import type { AlignmentResult } from "./export.js";

/** Context needed to generate the print run sheet */
export interface PrintRunSheetContext {
  directives: DirectivesOutput;
  alignment?: AlignmentResult | null;
  simulationResults: Map<string, SimulationResult>;
  constraints?: {
    parts: Array<{
      part_id: string;
      tolerances: { translation_mm: number; rotation_deg: number };
    }>;
  };
  baseUrl?: string;
}

/**
 * Generate QR code as data URL for a given URL
 */
async function generateQRCode(url: string): Promise<string> {
  try {
    return await QRCode.toDataURL(url, {
      width: 80,
      margin: 1,
      errorCorrectionLevel: "M"
    });
  } catch {
    return "";
  }
}

/**
 * Format status label for display
 */
function formatStatusLabel(status: Status): string {
  switch (status) {
    case "needs_review":
      return "Needs Review";
    case "ok":
      return "OK";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/**
 * Format a vector for display
 */
function formatVec3(vec?: [number, number, number]): string {
  if (!vec) return "—";
  return vec.map((v) => formatResidual(v)).join(", ");
}

/**
 * Generate the print run sheet HTML
 */
export async function generatePrintRunSheetHtml(context: PrintRunSheetContext): Promise<string> {
  const { directives, alignment, simulationResults, constraints, baseUrl = "" } = context;

  const lines: string[] = [];

  // Document header
  lines.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Run Sheet - ${directives.dataset_id}</title>
  <style>
    @media print {
      @page { margin: 0.5in; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #1f2937;
      background: #fff;
      padding: 20px;
    }
    .run-sheet-header {
      border-bottom: 2px solid #1f2937;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .run-sheet-title {
      font-size: 20pt;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .run-sheet-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      font-size: 10pt;
      color: #475569;
    }
    .run-sheet-meta strong { color: #1f2937; }

    .summary-section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 13pt;
      font-weight: 600;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 10px;
    }

    .counts-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .count-item {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 10pt;
    }
    .count-item strong { font-size: 14pt; margin-right: 4px; }
    .count-ok { border-color: #22c55e; background: #f0fdf4; }
    .count-pending { border-color: #3b82f6; background: #eff6ff; }
    .count-clamped { border-color: #f59e0b; background: #fffbeb; }
    .count-blocked { border-color: #ef4444; background: #fef2f2; }
    .count-needs_review { border-color: #8b5cf6; background: #f5f3ff; }

    .alignment-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 12px;
    }
    .alignment-rms {
      font-size: 12pt;
      margin-bottom: 8px;
    }
    .alignment-rms strong { font-size: 16pt; }
    .anchor-list {
      font-size: 9pt;
      color: #475569;
    }

    .steps-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-top: 12px;
    }
    .steps-table th, .steps-table td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: left;
    }
    .steps-table th {
      background: #f8fafc;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 8pt;
      letter-spacing: 0.02em;
    }
    .steps-table td.numeric { text-align: right; font-variant-numeric: tabular-nums; }
    .steps-table td.center { text-align: center; }
    .steps-table tr { page-break-inside: avoid; }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-ok { background: #dcfce7; color: #166534; }
    .status-pending { background: #dbeafe; color: #1d4ed8; }
    .status-clamped { background: #fef3c7; color: #92400e; }
    .status-blocked { background: #fee2e2; color: #b91c1c; }
    .status-needs_review { background: #ede9fe; color: #6d28d9; }

    .sim-pass { color: #166534; font-weight: 600; }
    .sim-fail { color: #b91c1c; font-weight: 600; }

    .qr-cell { width: 80px; padding: 4px; }
    .qr-cell img { width: 36px; height: 36px; margin: 0 2px; }

    .print-footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 9pt;
      color: #64748b;
      text-align: center;
    }

    @media print {
      .steps-table { font-size: 8pt; }
      .qr-cell img { width: 32px; height: 32px; }
    }
  </style>
</head>
<body>
`);

  // Header section
  lines.push(`
  <div class="run-sheet-header">
    <h1 class="run-sheet-title">Run Sheet</h1>
    <div class="run-sheet-meta">
      <span><strong>Dataset:</strong> ${directives.dataset_id}</span>
      <span><strong>Generated:</strong> ${directives.generated_at}</span>
      <span><strong>Engine:</strong> ${directives.engine_version}</span>
    </div>
  </div>
  `);

  // Alignment section (museum only)
  if (alignment) {
    const sortedResiduals = [...alignment.residuals_mm].sort(
      (a, b) => b.residual_mm - a.residual_mm
    );
    const topAnchors = sortedResiduals.slice(0, 3);

    lines.push(`
  <div class="summary-section">
    <h2 class="section-title">Alignment Quality</h2>
    <div class="alignment-info">
      <div class="alignment-rms">
        RMS: <strong>${formatResidual(alignment.rms_mm)} mm</strong>
      </div>
      <div class="anchor-list">
        <strong>Top Residual Anchors:</strong>
        ${topAnchors.map((a) => `${a.anchor_id} (${formatResidual(a.residual_mm)} mm)`).join(", ")}
      </div>
    </div>
  </div>
    `);
  }

  // Counts by status section
  const counts = directives.summary?.counts_by_status;
  if (counts) {
    lines.push(`
  <div class="summary-section">
    <h2 class="section-title">Status Summary</h2>
    <div class="counts-grid">
    `);
    for (const status of STATUS_PRIORITY) {
      const count = counts[status] ?? 0;
      lines.push(`<div class="count-item count-${status}"><strong>${count}</strong> ${formatStatusLabel(status)}</div>`);
    }
    lines.push(`
    </div>
  </div>
    `);
  }

  // Steps table
  lines.push(`
  <div class="summary-section">
    <h2 class="section-title">Steps</h2>
    <table class="steps-table">
      <thead>
        <tr>
          <th>Part ID</th>
          <th>Status</th>
          <th class="numeric">dx (mm)</th>
          <th class="numeric">dy (mm)</th>
          <th class="numeric">dz (mm)</th>
          <th class="numeric">Norm (mm)</th>
          <th class="numeric">Tol (mm)</th>
          <th class="center">Sim</th>
          <th class="qr-cell">QR</th>
        </tr>
      </thead>
      <tbody>
  `);

  // Generate QR codes for each step
  for (const step of directives.steps) {
    const [dx, dy, dz] = step.computed_errors.translation_error_mm_vec;
    const norm = step.computed_errors.translation_error_norm_mm;
    const partConstraint = constraints?.parts.find((p) => p.part_id === step.part_id);
    const tolMm = partConstraint?.tolerances.translation_mm;
    const simResult = simulationResults.get(step.part_id);

    // Generate QR codes for step and overlay modes
    const stepUrl = `${baseUrl}?dataset=${encodeURIComponent(directives.dataset_id)}&mode=step&part=${encodeURIComponent(step.part_id)}`;
    const overlayUrl = `${baseUrl}?dataset=${encodeURIComponent(directives.dataset_id)}&mode=overlay&part=${encodeURIComponent(step.part_id)}`;

    const [stepQr, overlayQr] = await Promise.all([
      generateQRCode(stepUrl),
      generateQRCode(overlayUrl)
    ]);

    let simCell = "—";
    if (simResult) {
      simCell = simResult.pass
        ? `<span class="sim-pass">PASS</span>`
        : `<span class="sim-fail">FAIL</span>`;
    }

    lines.push(`
        <tr>
          <td>${step.part_id}</td>
          <td><span class="status-badge status-${step.status}">${formatStatusLabel(step.status)}</span></td>
          <td class="numeric">${formatResidual(dx)}</td>
          <td class="numeric">${formatResidual(dy)}</td>
          <td class="numeric">${formatResidual(dz)}</td>
          <td class="numeric">${formatResidual(norm)}</td>
          <td class="numeric">${tolMm !== undefined ? formatResidual(tolMm) : "—"}</td>
          <td class="center">${simCell}</td>
          <td class="qr-cell">
            ${stepQr ? `<img src="${stepQr}" alt="Step QR" title="Step: ${step.part_id}">` : ""}
            ${overlayQr ? `<img src="${overlayQr}" alt="Overlay QR" title="Overlay: ${step.part_id}">` : ""}
          </td>
        </tr>
    `);
  }

  lines.push(`
      </tbody>
    </table>
  </div>
  `);

  // Footer
  lines.push(`
  <div class="print-footer">
    Generated by Directive Engine &bull; ${new Date().toISOString()}
  </div>
</body>
</html>
  `);

  return lines.join("");
}

/**
 * Open print run sheet in a new window and trigger print
 */
export async function openPrintRunSheet(context: PrintRunSheetContext): Promise<void> {
  const html = await generatePrintRunSheetHtml(context);

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    console.error("Failed to open print window. Please allow popups.");
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for QR code images to load before printing
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };
}
