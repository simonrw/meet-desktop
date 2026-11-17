import { readFileSync, renameSync, writeFileSync } from "node:fs";

export type HotkeyName = "toggle-mute" | "toggle-camera" | "toggle-hand" | "show-window" | "leave-call";

/**
 * The Focus Integration's settings: whether it runs, and the names of the Shortcuts that turn the Focus on and off.
 */
export interface FocusSettings {
  enabled: boolean;
  turnOnShortcut: string;
  turnOffShortcut: string;
}

/**
 * The user's settings. A hotkey bound to `null` is turned off.
 */
export interface Settings {
  hotkeys: Record<HotkeyName, string | null>;

  /** Whether the Meeting Window floats above other apps' windows. */
  alwaysOnTop: boolean;

  focus: FocusSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: {
    "toggle-mute": "Control+Alt+M",
    "toggle-camera": "Control+Alt+C",
    "toggle-hand": "Control+Alt+H",
    "show-window": "Control+Alt+S",
    "leave-call": "Control+Alt+L",
  },
  alwaysOnTop: false,
  focus: {
    enabled: false,
    turnOnShortcut: "Turn On Meeting Focus",
    turnOffShortcut: "Turn Off Meeting Focus",
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

  if (!isRecord(saved)) {
    return DEFAULT_SETTINGS;
  }

  const savedHotkeys = isRecord(saved.hotkeys) ? saved.hotkeys : {};

  const hotkeys = { ...DEFAULT_SETTINGS.hotkeys };
  for (const name of HOTKEY_NAMES) {
    const binding = savedHotkeys[name];
    if (typeof binding === "string" || binding === null) {
      hotkeys[name] = binding;
    }
  }

  const alwaysOnTop = typeof saved.alwaysOnTop === "boolean" ? saved.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop;

  const savedFocus: Record<string, unknown> = isRecord(saved.focus) ? saved.focus : {};
  const focus = { ...DEFAULT_SETTINGS.focus };

  if (typeof savedFocus.enabled === "boolean") {
    focus.enabled = savedFocus.enabled;
  }

  for (const name of ["turnOnShortcut", "turnOffShortcut"] as const) {
    const shortcut = savedFocus[name];
    if (typeof shortcut === "string") {
      focus[name] = shortcut;
    }
  }

  return { hotkeys, alwaysOnTop, focus };
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
