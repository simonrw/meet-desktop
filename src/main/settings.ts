import { join } from "node:path";

import { app, BrowserWindow } from "electron";

import { acceleratorFromKey, acceleratorLabel, type RecordedKey } from "./accelerator";
import { pauseHotkeys, registerHotkeys } from "./hotkeys";
import type { FocusTestResult } from "./focus-integration";
import type { Command } from "./meeting-controller";
import {
  HOTKEY_NAMES,
  isMiniModeOpacity,
  loadSettings,
  MINI_MODE_OPACITIES,
  saveSettings,
  type FocusSettings,
  type HotkeyName,
  type Settings,
} from "./settings-store";

export type ViewChannel = "settings:view";
export type ChangeChannel = "settings:change";

/**
 * What the settings window shows.
 */
export interface SettingsView {
  hotkeys: Array<{
    name: HotkeyName;
    label: string;

    /** The combination as macOS shows it, or `null` when the hotkey is off. */
    combination: string | null;
    recording: boolean;
    error?: string;
  }>;
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  focus: FocusSettings & {
    /** How the last test of the Focus Shortcuts went, until the settings change. */
    testResult?: FocusTestResult;
  };
  autoMiniMode: boolean;
  miniModeOpacity: number;

  /** The opacities the user can choose for the mini window. */
  miniModeOpacities: number[];
}

/**
 * A change asked for in the settings window.
 */
export type SettingsChange =
  | { type: "record"; name: HotkeyName }
  | { type: "key"; key: RecordedKey }
  | { type: "cancel-recording" }
  | { type: "turn-off"; name: HotkeyName }
  | { type: "launch-at-login"; enabled: boolean }
  | { type: "always-on-top"; enabled: boolean }
  | { type: "focus"; focus: Partial<FocusSettings> }
  | { type: "test-focus" }
  | { type: "auto-mini-mode"; enabled: boolean }
  | { type: "mini-mode-opacity"; opacity: number };

export interface SettingsWindow {
  /** The settings as they are now. */
  readonly settings: Settings;

  /**
   * Calls `listener` with the new settings each time the user changes them.
   */
  onChange(listener: (settings: Settings) => void): void;

  /**
   * Opens the settings window, or brings it to the front when it's already open, taking the keyboard from whichever
   * app is active.
   */
  open(): void;
}

const VIEW_CHANNEL: ViewChannel = "settings:view";
const CHANGE_CHANNEL: ChangeChannel = "settings:change";

const SETTINGS_PRELOAD = join(__dirname, "..", "preload", "settings.js");

const HOTKEY_LABELS: Record<HotkeyName, string> = {
  "toggle-mute": "Mute",
  "toggle-camera": "Camera",
  "toggle-hand": "Raise hand",
  "show-window": "Show window",
  "leave-call": "Leave call",
  "toggle-mini-mode": "Mini Mode",
};

const SETTINGS_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Settings</title>
    <style>
      :root { color-scheme: light dark; font: 13px system-ui; }
      body { margin: 0; padding: 4px 20px 20px; }
      h2 { margin: 16px 0 8px; font-size: 13px; }
      .hotkey { display: grid; grid-template-columns: 1fr 9em auto auto; gap: 4px 8px; align-items: center; padding: 4px 0; }
      kbd { font: inherit; padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, CanvasText 8%, transparent); text-align: center; }
      kbd.recording { outline: 2px solid Highlight; }
      kbd.off { color: GrayText; }
      .error { grid-column: 1 / -1; margin: 0; color: #d70015; }
      label { display: block; padding: 2px 0; }
      .shortcut { display: grid; grid-template-columns: 9em 1fr; gap: 8px; align-items: center; padding: 4px 0; }
      .help { margin: 4px 0 8px; color: GrayText; }
      .help ol { margin: 4px 0; padding-left: 20px; }
      .test-result { margin: 8px 0 0; }
      .test-result.ok { color: #248a3d; }
      label { display: block; padding: 4px 0; }
    </style>
  </head>
  <body></body>
</html>`)}`;

/**
 * Loads the user's settings and applies them, registering the hotkeys that are turned on, which send their Commands
 * to `onCommand`. Returns the settings window, where each change takes effect straight away, and whose Focus test
 * button calls `testFocus`.
 */
export function startSettings(
  onCommand: (command: Command) => void,
  testFocus: () => Promise<FocusTestResult>,
): SettingsWindow {
  const file = join(app.getPath("userData"), "settings.json");

  let settings = loadSettings(file);
  let failed: HotkeyName[] = [];
  let refusal: { name: HotkeyName; accelerator: string; owner: string } | undefined;
  let recording: HotkeyName | undefined;
  let focusTestResult: FocusTestResult | undefined;
  let window: BrowserWindow | undefined;
  const listeners: Array<(settings: Settings) => void> = [];

  const applyHotkeys = () => {
    // Recording keeps the hotkeys paused, so other changes made meanwhile must not turn them back on.
    if (recording === undefined) {
      failed = registerHotkeys(settings.hotkeys, onCommand);
    }
  };

  const bind = (name: HotkeyName, accelerator: string | null): Settings => {
    return { ...settings, hotkeys: { ...settings.hotkeys, [name]: accelerator } };
  };

  const save = (changed: Settings) => {
    settings = changed;
    saveSettings(file, settings);
    listeners.forEach((listener) => listener(settings));
  };

  const saveHotkeys = (changed: Settings) => {
    save(changed);
    applyHotkeys();
  };

  const stopRecording = () => {
    if (recording !== undefined) {
      recording = undefined;
      applyHotkeys();
    }
  };

  const refuse = (name: HotkeyName, accelerator: string, owner: string) => {
    refusal = { name, accelerator, owner };
    applyHotkeys();
  };

  const record = (name: HotkeyName, key: RecordedKey) => {
    if (key.code === "Escape") {
      stopRecording();
      return;
    }

    const accelerator = acceleratorFromKey(key);
    if (accelerator === undefined) {
      return;
    }

    recording = undefined;

    const owner = HOTKEY_NAMES.find((other) => other !== name && settings.hotkeys[other] === accelerator);
    if (owner !== undefined) {
      refuse(name, accelerator, HOTKEY_LABELS[owner]);
      return;
    }

    // Trying the combination before saving it keeps the working one when another app owns the new one.
    const changed = bind(name, accelerator);
    if (registerHotkeys(changed.hotkeys, onCommand).includes(name)) {
      refuse(name, accelerator, "another app");
      return;
    }

    saveHotkeys(changed);
  };

  const change = async (change: SettingsChange) => {
    switch (change.type) {
      case "record":
        refusal = undefined;
        recording = change.name;

        // Otherwise pressing a combination already in use runs its Command instead of reaching the window.
        pauseHotkeys();
        break;

      case "key":
        if (recording !== undefined) {
          record(recording, change.key);
        }
        break;

      case "cancel-recording":
        stopRecording();
        break;

      case "turn-off":
        refusal = undefined;
        saveHotkeys(bind(change.name, null));
        break;

      case "launch-at-login":
        app.setLoginItemSettings({ openAtLogin: change.enabled });
        break;

      case "always-on-top":
        save({ ...settings, alwaysOnTop: change.enabled });
        break;

      case "focus":
        focusTestResult = undefined;
        save({ ...settings, focus: { ...settings.focus, ...change.focus } });
        break;

      case "test-focus":
        focusTestResult = await testFocus();
        break;

      case "auto-mini-mode":
        save({ ...settings, autoMiniMode: change.enabled });
        break;

      case "mini-mode-opacity":
        if (isMiniModeOpacity(change.opacity)) {
          save({ ...settings, miniModeOpacity: change.opacity });
        }
        break;
    }
  };

  const error = (name: HotkeyName): string | undefined => {
    const problem =
      refusal?.name === name
        ? refusal
        : failed.includes(name)
          ? { accelerator: settings.hotkeys[name] ?? "", owner: "another app" }
          : undefined;

    if (problem === undefined) {
      return undefined;
    }

    const combination = acceleratorLabel(problem.accelerator);
    return `${HOTKEY_LABELS[name]} couldn't use ${combination} because ${problem.owner} already does. Record a different combination.`;
  };

  const view = (): SettingsView => ({
    hotkeys: HOTKEY_NAMES.map((name) => {
      const accelerator = settings.hotkeys[name];

      return {
        name,
        label: HOTKEY_LABELS[name],
        combination: accelerator === null ? null : acceleratorLabel(accelerator),
        recording: recording === name,
        error: error(name),
      };
    }),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
    alwaysOnTop: settings.alwaysOnTop,
    focus: { ...settings.focus, testResult: focusTestResult },
    autoMiniMode: settings.autoMiniMode,
    miniModeOpacity: settings.miniModeOpacity,
    miniModeOpacities: MINI_MODE_OPACITIES,
  });

  applyHotkeys();

  return {
    get settings() {
      return settings;
    },

    onChange(listener) {
      listeners.push(listener);
    },

    open() {
      // Opened from the menu bar menu, or by its shortcut from the mini window, while another app is active, and must
      // take the keyboard.
      app.focus({ steal: true });

      if (window) {
        window.focus();
        return;
      }

      window = new BrowserWindow({
        width: 460,
        height: 720,
        useContentSize: true,
        title: "Settings",
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,

        // Otherwise a Meeting Window kept on top could cover the option that turns it off.
        alwaysOnTop: true,

        webPreferences: { sandbox: true, contextIsolation: true, preload: SETTINGS_PRELOAD },
      });

      window.webContents.ipc.handle(VIEW_CHANNEL, view);
      window.webContents.ipc.handle(CHANGE_CHANNEL, async (_event, requested: SettingsChange) => {
        await change(requested);
        return view();
      });

      window.once("closed", () => {
        window = undefined;
        refusal = undefined;
        focusTestResult = undefined;
        stopRecording();
      });

      window.loadURL(SETTINGS_PAGE);
    },
  };
}
