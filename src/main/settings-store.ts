import { readFileSync, renameSync, writeFileSync } from "node:fs";

export type HotkeyName = "toggle-mute" | "toggle-camera" | "toggle-hand" | "show-window" | "leave-call";

/**
 * The user's settings. A hotkey bound to `null` is turned off.
 */
export interface Settings {
  hotkeys: Record<HotkeyName, string | null>;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: {
    "toggle-mute": "Control+Alt+M",
    "toggle-camera": "Control+Alt+C",
    "toggle-hand": "Control+Alt+H",
    "show-window": "Control+Alt+S",
    "leave-call": "Control+Alt+L",
  },
};

export const HOTKEY_NAMES = Object.keys(DEFAULT_SETTINGS.hotkeys) as HotkeyName[];

/**
 * Reads settings saved by `saveSettings`, falling back to the default for anything missing or malformed.
 */
export function loadSettings(file: string): Settings {
  let saved: unknown;
  try {
    saved = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return DEFAULT_SETTINGS;
  }

  const savedHotkeys = isRecord(saved) && isRecord(saved.hotkeys) ? saved.hotkeys : {};

  const hotkeys = { ...DEFAULT_SETTINGS.hotkeys };
  for (const name of HOTKEY_NAMES) {
    const binding = savedHotkeys[name];
    if (typeof binding === "string" || binding === null) {
      hotkeys[name] = binding;
    }
  }

  return { hotkeys };
}

/**
 * Persists settings so the next launch can load them.
 */
export function saveSettings(file: string, settings: Settings): void {
  // Renaming over the old file means a crash mid-write can't leave it half written.
  const partial = `${file}.partial`;
  writeFileSync(partial, JSON.stringify(settings, null, 2));
  renameSync(partial, file);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
