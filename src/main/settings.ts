import { join } from "node:path";

import { app, BrowserWindow } from "electron";

import { acceleratorFromKey, acceleratorLabel, type RecordedKey } from "./accelerator";
import { pauseHotkeys, registerHotkeys } from "./hotkeys";
import type { Command } from "./meeting-controller";
import { HOTKEY_NAMES, loadSettings, saveSettings, type HotkeyName, type Settings } from "./settings-store";

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
}

/**
 * A change asked for in the settings window.
 */
export type SettingsChange =
  | { type: "record"; name: HotkeyName }
  | { type: "key"; key: RecordedKey }
  | { type: "cancel-recording" }
  | { type: "turn-off"; name: HotkeyName }
  | { type: "launch-at-login"; enabled: boolean };

export interface SettingsWindow {
  /**
   * Opens the settings window, or brings it to the front when it's already open.
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
    </style>
  </head>
  <body></body>
</html>`)}`;

/**
 * Loads the user's settings and applies them, registering the hotkeys that are turned on, which send their Commands
 * to `onCommand`. Returns the settings window, where each change takes effect straight away.
 */
export function startSettings(onCommand: (command: Command) => void): SettingsWindow {
  const file = join(app.getPath("userData"), "settings.json");

  let settings = loadSettings(file);
  let failed: HotkeyName[] = [];
  let refusal: { name: HotkeyName; accelerator: string; owner: string } | undefined;
  let recording: HotkeyName | undefined;
  let window: BrowserWindow | undefined;

  const applyHotkeys = () => {
    failed = registerHotkeys(settings.hotkeys, onCommand);
  };

  const bind = (name: HotkeyName, accelerator: string | null): Settings => {
    return { ...settings, hotkeys: { ...settings.hotkeys, [name]: accelerator } };
  };

  const save = (changed: Settings) => {
    settings = changed;
    saveSettings(file, settings);
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

    save(changed);
  };

  const change = (change: SettingsChange) => {
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
        save(bind(change.name, null));
        break;

      case "launch-at-login":
        app.setLoginItemSettings({ openAtLogin: change.enabled });
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
  });

  applyHotkeys();

  return {
    open() {
      if (window) {
        window.focus();
        return;
      }

      window = new BrowserWindow({
        width: 460,
        height: 340,
        useContentSize: true,
        title: "Settings",
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        webPreferences: { sandbox: true, contextIsolation: true, preload: SETTINGS_PRELOAD },
      });

      window.webContents.ipc.handle(VIEW_CHANNEL, view);
      window.webContents.ipc.handle(CHANGE_CHANNEL, (_event, requested: SettingsChange) => {
        change(requested);
        return view();
      });

      window.once("closed", () => {
        window = undefined;
        refusal = undefined;
        stopRecording();
      });

      window.loadURL(SETTINGS_PAGE);
    },
  };
}
