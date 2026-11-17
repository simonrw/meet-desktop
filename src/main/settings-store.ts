import { isRecord, readJsonFile, writeJsonFile } from "./json-file";

export type HotkeyName =
  | "toggle-mute"
  | "toggle-camera"
  | "toggle-hand"
  | "show-window"
  | "leave-call"
  | "toggle-mini-mode";

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

  /** Whether to enter Mini Mode when the user switches to another app during a call. */
  autoMiniMode: boolean;

  /** The mini window's opacity, one of `MINI_MODE_OPACITIES`. */
  miniModeOpacity: number;
}

/**
 * The opacities the user can choose for the mini window.
 */
// Any fainter and the call can't be made out.
export const MINI_MODE_OPACITIES = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

export const DEFAULT_SETTINGS: Settings = {
  hotkeys: {
    "toggle-mute": "Control+Alt+M",
    "toggle-camera": "Control+Alt+C",
    "toggle-hand": "Control+Alt+H",
    "show-window": "Control+Alt+S",
    "leave-call": "Control+Alt+L",
    "toggle-mini-mode": "Control+Alt+P",
  },
  alwaysOnTop: false,
  focus: {
    enabled: false,
    turnOnShortcut: "Turn On Meeting Focus",
    turnOffShortcut: "Turn Off Meeting Focus",
  },
  autoMiniMode: false,
  miniModeOpacity: 1,
};

export const HOTKEY_NAMES = Object.keys(DEFAULT_SETTINGS.hotkeys) as HotkeyName[];

/**
 * Reads settings saved by `saveSettings`, falling back to the default for anything missing or malformed.
 */
export function loadSettings(file: string): Settings {
  const saved = readJsonFile(file);
  if (saved === undefined) {
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

  const { autoMiniMode, miniModeOpacity } = saved;

  return {
    hotkeys,
    alwaysOnTop,
    focus,
    autoMiniMode: typeof autoMiniMode === "boolean" ? autoMiniMode : DEFAULT_SETTINGS.autoMiniMode,
    miniModeOpacity: isMiniModeOpacity(miniModeOpacity) ? miniModeOpacity : DEFAULT_SETTINGS.miniModeOpacity,
  };
}

export function isMiniModeOpacity(value: unknown): value is number {
  return typeof value === "number" && MINI_MODE_OPACITIES.includes(value);
}

/**
 * Persists settings so the next launch can load them.
 */
export function saveSettings(file: string, settings: Settings): void {
  writeJsonFile(file, settings);
}
