import { nativeImage, type NativeImage } from "electron";

export type MenuBarIcon = "not-in-call" | "in-call" | "muted";

/** Signed distance in points from a point to a shape's edge, negative inside. */
type Shape = (x: number, y: number) => number;

// Glyphs are drawn on an 18pt square, the usual size of a menu bar icon.
const SIZE = 18;
const STROKE = 1.5;

const capsule = roundedRect(9, 6.5, 2.75, 4.75, 2.75);
const cradle = stroke(lowerArc(9, 8.25, 5));
const stem = stroke(segment(9, 13.25, 9, 16));
const slash = segment(3.5, 2, 14.5, 16.5);

const microphone = union(capsule, cradle, stem);

const GLYPHS: Record<MenuBarIcon, Shape> = {
  "not-in-call": union(stroke(grow(capsule, -STROKE / 2)), cradle, stem),
  "in-call": microphone,
  muted: union(subtract(microphone, grow(slash, STROKE * 1.5)), stroke(slash)),
};

/**
 * Draws the menu bar icon as a template image, which macOS tints to suit light and dark menu bars.
 */
export function menuBarIconImage(icon: MenuBarIcon): NativeImage {
  const image = nativeImage.createEmpty();

  for (const scaleFactor of [1, 2]) {
    const pixels = SIZE * scaleFactor;
    image.addRepresentation({
      scaleFactor,
      width: pixels,
      height: pixels,
      buffer: rasterize(GLYPHS[icon], pixels, scaleFactor),
    });
  }

  image.setTemplateImage(true);
  return image;
}

/**
 * Renders a shape as black BGRA pixels, with the alpha antialiased across the shape's edge.
 */
function rasterize(shape: Shape, pixels: number, scaleFactor: number): Buffer {
  const buffer = Buffer.alloc(pixels * pixels * 4);

  for (let row = 0; row < pixels; row++) {
    for (let column = 0; column < pixels; column++) {
      const distance = shape((column + 0.5) / scaleFactor, (row + 0.5) / scaleFactor) * scaleFactor;
      const coverage = Math.min(Math.max(0.5 - distance, 0), 1);

      buffer[(row * pixels + column) * 4 + 3] = Math.round(coverage * 255);
    }
  }

  return buffer;
}

function roundedRect(centerX: number, centerY: number, halfWidth: number, halfHeight: number, radius: number): Shape {
  return (x, y) => {
    const qx = Math.abs(x - centerX) - halfWidth + radius;
    const qy = Math.abs(y - centerY) - halfHeight + radius;

    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
  };
}

/**
 * The lower half of a circle's outline, as a zero-width line.
 */
function lowerArc(centerX: number, centerY: number, radius: number): Shape {
  return (x, y) => {
    if (y >= centerY) {
      return Math.abs(Math.hypot(x - centerX, y - centerY) - radius);
    }

    return Math.min(Math.hypot(x - centerX + radius, y - centerY), Math.hypot(x - centerX - radius, y - centerY));
  };
}

/**
 * A straight line between two points, with zero width.
 */
function segment(ax: number, ay: number, bx: number, by: number): Shape {
  return (x, y) => {
    const dx = bx - ax;
    const dy = by - ay;
    const along = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0), 1);

    return Math.hypot(x - ax - along * dx, y - ay - along * dy);
  };
}

function grow(shape: Shape, amount: number): Shape {
  return (x, y) => shape(x, y) - amount;
}

/**
 * A line of the standard stroke width traced along a shape's edge.
 */
function stroke(shape: Shape): Shape {
  return (x, y) => Math.abs(shape(x, y)) - STROKE / 2;
}

function union(...shapes: Shape[]): Shape {
  return (x, y) => Math.min(...shapes.map((shape) => shape(x, y)));
}

function subtract(shape: Shape, cut: Shape): Shape {
  return (x, y) => Math.max(shape(x, y), -cut(x, y));
}
