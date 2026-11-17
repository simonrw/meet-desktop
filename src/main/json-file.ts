import { readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Reads the value saved in a JSON file, or `undefined` when the file is missing or unreadable.
 */
export function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Saves `value` to a JSON file, replacing whatever it held.
 */
export function writeJsonFile(file: string, value: unknown): void {
  // Renaming over the old file means a crash mid-write can't leave it half written.
  const partial = `${file}.partial`;
  writeFileSync(partial, JSON.stringify(value, null, 2));
  renameSync(partial, file);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
