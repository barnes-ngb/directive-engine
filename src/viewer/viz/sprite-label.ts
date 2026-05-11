/**
 * Builds a `THREE.Sprite` that renders a short text label (e.g. "J1", "S2")
 * over a translucent rounded-rect background. Uses a canvas texture so we
 * don't need an HTML overlay renderer.
 *
 * The sprite always faces the camera and is sized in world units (mm). Labels
 * are kept small (~120 mm tall by default) so they read as captions, not
 * billboards.
 */

import * as THREE from "three";

const DEFAULT_FONT_PX = 64;
const DEFAULT_HEIGHT_MM = 140;
const TEXTURE_PADDING_PX = 16;

export interface SpriteLabelHandle {
  sprite: THREE.Sprite;
  /** Texture + material disposal. */
  dispose(): void;
}

export interface SpriteLabelOptions {
  text: string;
  /** World-space height of the rendered label (mm). */
  heightMm?: number;
  /** Hex colour for the text glyphs. */
  textColor?: string;
  /** Hex+alpha for the rounded-rect background, e.g. `rgba(20,22,28,0.8)`. */
  backgroundColor?: string;
}

export function buildSpriteLabel(opts: SpriteLabelOptions): SpriteLabelHandle {
  const text = opts.text;
  const fontPx = DEFAULT_FONT_PX;
  const padding = TEXTURE_PADDING_PX;
  const heightMm = opts.heightMm ?? DEFAULT_HEIGHT_MM;
  const textColor = opts.textColor ?? "#f4f6f9";
  const backgroundColor = opts.backgroundColor ?? "rgba(20,22,28,0.80)";

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  // Measure: set font first, then size canvas to fit text + padding.
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const textHeight = fontPx;
  canvas.width = textWidth + padding * 2;
  canvas.height = textHeight + padding * 2;

  // Re-set the font after canvas resize (resize resets context state).
  ctx.font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Rounded-rect background.
  const radius = Math.min(16, canvas.height / 3);
  ctx.fillStyle = backgroundColor;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, radius);
  ctx.fill();

  // Text.
  ctx.fillStyle = textColor;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  // Avoid mipmap blurriness on small labels.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);

  // Render on top so labels never get occluded by ghosts/panels.
  sprite.renderOrder = 999;

  // World-space sizing: keep aspect ratio of the canvas.
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(heightMm * aspect, heightMm, 1);

  return {
    sprite,
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
