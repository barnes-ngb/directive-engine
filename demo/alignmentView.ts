/**
 * Alignment View - 2D visualization of anchor geometry and residual vectors.
 *
 * Shows:
 * - Model anchors (solid dots)
 * - Scan anchors transformed into model frame (hollow dots)
 * - Residual vectors from transformed scan → model point
 * - Labels with anchor_id and residual_mm
 */

import type { MuseumAnchor } from "./museum.js";
import type { AnchorResidual, RigidTransformResult } from "../src/core/align/rigid.js";
import { applyTransformToPoint } from "../src/core/index.js";
import type { Vec3 } from "../src/types.js";

export interface AlignmentViewConfig {
  canvas: HTMLCanvasElement;
  anchors: MuseumAnchor[];
  alignment: RigidTransformResult;
}

interface ProjectedAnchor {
  id: string;
  modelX: number;
  modelY: number;
  scanX: number;
  scanY: number;
  residual_mm: number;
  residual_vec_mm: Vec3;
}

// Color palette
const COLORS = {
  background: "#f8fafc",
  gridLine: "#e2e8f0",
  modelAnchor: "#2563eb", // Blue - solid
  scanAnchor: "#10b981", // Green - hollow
  residualLine: "#ef4444", // Red for residuals
  residualLineNormal: "#94a3b8", // Gray for normal residuals
  label: "#1f2937",
  labelBg: "rgba(255, 255, 255, 0.9)",
  outlierHighlight: "#fef3c7" // Amber background for outliers
};

// Thresholds
const OUTLIER_THRESHOLD_FACTOR = 2.0; // 2x RMS is considered outlier

/**
 * Project 3D point to 2D using a top-down XY projection (ignoring Z).
 * This is a simple orthographic projection looking down the Z axis.
 */
function projectXY(point: Vec3): [number, number] {
  return [point[0], point[1]];
}

/**
 * Calculate bounding box of all projected points with padding.
 */
function calculateBounds(projectedAnchors: ProjectedAnchor[], padding: number): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (projectedAnchors.length === 0) {
    return { minX: -100, maxX: 100, minY: -100, maxY: 100 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const anchor of projectedAnchors) {
    minX = Math.min(minX, anchor.modelX, anchor.scanX);
    maxX = Math.max(maxX, anchor.modelX, anchor.scanX);
    minY = Math.min(minY, anchor.modelY, anchor.scanY);
    maxY = Math.max(maxY, anchor.modelY, anchor.scanY);
  }

  // Add padding
  const rangeX = maxX - minX || 100;
  const rangeY = maxY - minY || 100;
  const padX = rangeX * padding;
  const padY = rangeY * padding;

  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY
  };
}

/**
 * Create coordinate transformer from world space to canvas space.
 */
function createTransformer(
  bounds: ReturnType<typeof calculateBounds>,
  canvasWidth: number,
  canvasHeight: number
): (x: number, y: number) => [number, number] {
  const worldWidth = bounds.maxX - bounds.minX;
  const worldHeight = bounds.maxY - bounds.minY;

  // Maintain aspect ratio
  const scaleX = canvasWidth / worldWidth;
  const scaleY = canvasHeight / worldHeight;
  const scale = Math.min(scaleX, scaleY) * 0.85; // Leave margin

  const offsetX = (canvasWidth - worldWidth * scale) / 2;
  const offsetY = (canvasHeight - worldHeight * scale) / 2;

  return (x: number, y: number): [number, number] => {
    // Flip Y axis for canvas (canvas Y grows downward)
    const canvasX = (x - bounds.minX) * scale + offsetX;
    const canvasY = canvasHeight - ((y - bounds.minY) * scale + offsetY);
    return [canvasX, canvasY];
  };
}

/**
 * Draw a solid circle (model anchor).
 */
function drawSolidCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Draw a hollow circle (scan anchor).
 */
function drawHollowCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  lineWidth: number = 2
): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Draw residual vector line with arrowhead.
 */
function drawResidualLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  lineWidth: number = 1.5
): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 2) return; // Too short to draw

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  // Draw arrowhead
  const arrowLength = Math.min(8, length / 3);
  const arrowAngle = Math.PI / 6;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - arrowLength * Math.cos(angle - arrowAngle),
    toY - arrowLength * Math.sin(angle - arrowAngle)
  );
  ctx.lineTo(
    toX - arrowLength * Math.cos(angle + arrowAngle),
    toY - arrowLength * Math.sin(angle + arrowAngle)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Draw label with background.
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  isOutlier: boolean = false
): void {
  ctx.font = "11px Inter, system-ui, sans-serif";
  const metrics = ctx.measureText(text);
  const padding = 3;
  const boxWidth = metrics.width + padding * 2;
  const boxHeight = 14;

  // Draw background
  ctx.fillStyle = isOutlier ? COLORS.outlierHighlight : COLORS.labelBg;
  ctx.fillRect(x - padding, y - boxHeight + 2, boxWidth, boxHeight);

  if (isOutlier) {
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - padding, y - boxHeight + 2, boxWidth, boxHeight);
  }

  // Draw text
  ctx.fillStyle = COLORS.label;
  ctx.fillText(text, x, y);
}

/**
 * Draw legend for the visualization.
 */
function drawLegend(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
  const legendX = 10;
  const legendY = 20;
  const spacing = 18;

  ctx.font = "11px Inter, system-ui, sans-serif";

  // Model anchor legend
  drawSolidCircle(ctx, legendX + 6, legendY - 4, 5, COLORS.modelAnchor);
  ctx.fillStyle = COLORS.label;
  ctx.fillText("Model anchor", legendX + 16, legendY);

  // Scan anchor legend
  drawHollowCircle(ctx, legendX + 6, legendY + spacing - 4, 5, COLORS.scanAnchor);
  ctx.fillStyle = COLORS.label;
  ctx.fillText("Scan anchor (transformed)", legendX + 16, legendY + spacing);

  // Residual vector legend
  ctx.beginPath();
  ctx.moveTo(legendX + 2, legendY + spacing * 2 - 4);
  ctx.lineTo(legendX + 12, legendY + spacing * 2 - 4);
  ctx.strokeStyle = COLORS.residualLine;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = COLORS.label;
  ctx.fillText("Residual vector", legendX + 16, legendY + spacing * 2);
}

/**
 * Format residual value for display.
 */
function formatResidual(value: number): string {
  if (Math.abs(value) < 0.01) return "0.00";
  if (Math.abs(value) < 10) return value.toFixed(2);
  if (Math.abs(value) < 100) return value.toFixed(1);
  return value.toFixed(0);
}

/**
 * Render the alignment view visualization.
 */
export function renderAlignmentView(config: AlignmentViewConfig): void {
  const { canvas, anchors, alignment } = config;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Get device pixel ratio for sharp rendering
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // Set canvas size accounting for device pixel ratio
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  // Clear canvas
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (anchors.length === 0) {
    ctx.fillStyle = COLORS.label;
    ctx.font = "14px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No anchor data available", canvasWidth / 2, canvasHeight / 2);
    return;
  }

  // Create residual lookup
  const residualMap = new Map<string, AnchorResidual>();
  for (const r of alignment.residuals_mm) {
    residualMap.set(r.anchor_id, r);
  }

  // Project anchors
  const projectedAnchors: ProjectedAnchor[] = anchors.map((anchor) => {
    const [modelX, modelY] = projectXY(anchor.model_mm);
    const transformedScan = applyTransformToPoint(alignment.T_model_scan, anchor.scan_mm);
    const [scanX, scanY] = projectXY(transformedScan);
    const residual = residualMap.get(anchor.id);

    return {
      id: anchor.id,
      modelX,
      modelY,
      scanX,
      scanY,
      residual_mm: residual?.residual_mm ?? 0,
      residual_vec_mm: residual?.residual_vec_mm ?? [0, 0, 0]
    };
  });

  // Calculate bounds and transformer
  const bounds = calculateBounds(projectedAnchors, 0.15);
  const transform = createTransformer(bounds, canvasWidth, canvasHeight);

  // Determine outlier threshold
  const outlierThreshold = alignment.rms_mm * OUTLIER_THRESHOLD_FACTOR;

  // Draw grid lines (subtle)
  const gridStep = Math.pow(10, Math.floor(Math.log10(bounds.maxX - bounds.minX)));
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;

  for (let x = Math.floor(bounds.minX / gridStep) * gridStep; x <= bounds.maxX; x += gridStep) {
    const [canvasX1, canvasY1] = transform(x, bounds.minY);
    const [canvasX2, canvasY2] = transform(x, bounds.maxY);
    ctx.beginPath();
    ctx.moveTo(canvasX1, canvasY1);
    ctx.lineTo(canvasX2, canvasY2);
    ctx.stroke();
  }

  for (let y = Math.floor(bounds.minY / gridStep) * gridStep; y <= bounds.maxY; y += gridStep) {
    const [canvasX1, canvasY1] = transform(bounds.minX, y);
    const [canvasX2, canvasY2] = transform(bounds.maxX, y);
    ctx.beginPath();
    ctx.moveTo(canvasX1, canvasY1);
    ctx.lineTo(canvasX2, canvasY2);
    ctx.stroke();
  }

  // Sort anchors by residual (draw smaller residuals first, outliers on top)
  const sortedAnchors = [...projectedAnchors].sort((a, b) => a.residual_mm - b.residual_mm);

  // Draw residual vectors
  for (const anchor of sortedAnchors) {
    const [fromX, fromY] = transform(anchor.scanX, anchor.scanY);
    const [toX, toY] = transform(anchor.modelX, anchor.modelY);
    const isOutlier = anchor.residual_mm > outlierThreshold;
    const color = isOutlier ? COLORS.residualLine : COLORS.residualLineNormal;
    const lineWidth = isOutlier ? 2.5 : 1.5;

    drawResidualLine(ctx, fromX, fromY, toX, toY, color, lineWidth);
  }

  // Draw anchors and labels
  for (const anchor of sortedAnchors) {
    const [modelCanvasX, modelCanvasY] = transform(anchor.modelX, anchor.modelY);
    const [scanCanvasX, scanCanvasY] = transform(anchor.scanX, anchor.scanY);
    const isOutlier = anchor.residual_mm > outlierThreshold;
    const anchorRadius = isOutlier ? 7 : 5;

    // Draw scan anchor (hollow)
    drawHollowCircle(ctx, scanCanvasX, scanCanvasY, anchorRadius, COLORS.scanAnchor, isOutlier ? 3 : 2);

    // Draw model anchor (solid)
    drawSolidCircle(ctx, modelCanvasX, modelCanvasY, anchorRadius, COLORS.modelAnchor);

    // Draw label near model anchor
    const labelText = `${anchor.id}: ${formatResidual(anchor.residual_mm)} mm`;
    const labelOffsetX = 10;
    const labelOffsetY = -8;
    drawLabel(ctx, labelText, modelCanvasX + labelOffsetX, modelCanvasY + labelOffsetY, isOutlier);
  }

  // Draw legend
  drawLegend(ctx, canvasWidth);

  // Draw RMS indicator
  ctx.font = "bold 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.label;
  ctx.fillText(`RMS: ${formatResidual(alignment.rms_mm)} mm`, canvasWidth - 10, 20);
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`Outlier threshold: >${formatResidual(outlierThreshold)} mm`, canvasWidth - 10, 36);
}

/**
 * Clear the alignment view canvas.
 */
export function clearAlignmentView(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N/A - Alignment view not available for this dataset", rect.width / 2, rect.height / 2);
}
