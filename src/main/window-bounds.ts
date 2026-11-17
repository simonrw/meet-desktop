import { readJsonFile, writeJsonFile } from "./json-file";

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Enough of the window must stay on screen for the user to grab it and drag it back.
const MIN_VISIBLE_WIDTH = 100;
const MIN_VISIBLE_HEIGHT = 50;

/**
 * Reads window bounds saved by `saveBounds`, returning them only if they fit one of the given display work areas.
 */
export function loadBounds(file: string, workAreas: Rectangle[]): Rectangle | undefined {
  return restorableBounds(readJsonFile(file), workAreas);
}

/**
 * Persists window bounds so the next launch can restore them.
 */
export function saveBounds(file: string, bounds: Rectangle): void {
  writeJsonFile(file, bounds);
}

/**
 * Returns the saved window bounds if they can be restored onto one of the given display work areas.
 */
export function restorableBounds(saved: unknown, workAreas: Rectangle[]): Rectangle | undefined {
  const bounds = asRectangle(saved);
  if (bounds === undefined) {
    return undefined;
  }

  return workAreas.some((area) => overlapsEnough(bounds, area)) ? bounds : undefined;
}

function asRectangle(value: unknown): Rectangle | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const { x, y, width, height } = value as Record<string, unknown>;
  const numbers = [x, y, width, height];
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) {
    return undefined;
  }

  return { x, y, width, height } as Rectangle;
}

function overlapsEnough(a: Rectangle, b: Rectangle): boolean {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width >= MIN_VISIBLE_WIDTH && height >= MIN_VISIBLE_HEIGHT;
}
