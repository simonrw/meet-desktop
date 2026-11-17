import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, test } from "vitest";

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "./settings-store";

let file: string;

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), "settings-store-")), "settings.json");
});

describe("loadSettings", () => {
  test("uses the default hotkeys when there is no settings file", () => {
    const settings = loadSettings(file);

    expect(settings.hotkeys).toEqual({
      "toggle-mute": "Control+Alt+M",
      "toggle-camera": "Control+Alt+C",
      "toggle-hand": "Control+Alt+H",
      "show-window": "Control+Alt+S",
      "leave-call": "Control+Alt+L",
      "toggle-mini-mode": "Control+Alt+P",
    });
  });

  test("leaves auto Mini Mode off and the mini window opaque when there is no settings file", () => {
    const settings = loadSettings(file);

    expect(settings.autoMiniMode).toBe(false);
    expect(settings.miniModeOpacity).toBe(1);
  });

  test("keeps saved Mini Mode options", () => {
    writeFileSync(file, JSON.stringify({ autoMiniMode: true, miniModeOpacity: 0.8 }));

    const settings = loadSettings(file);

    expect(settings.autoMiniMode).toBe(true);
    expect(settings.miniModeOpacity).toBe(0.8);
  });

  test("defaults malformed Mini Mode options", () => {
    writeFileSync(file, JSON.stringify({ autoMiniMode: "yes", miniModeOpacity: "half" }));

    const settings = loadSettings(file);

    expect(settings.autoMiniMode).toBe(false);
    expect(settings.miniModeOpacity).toBe(1);
  });

  test("defaults a Mini Mode opacity that would make the mini window too faint or invalid", () => {
    for (const miniModeOpacity of [0, 0.2, 1.5]) {
      writeFileSync(file, JSON.stringify({ miniModeOpacity }));

      expect(loadSettings(file).miniModeOpacity).toBe(1);
    }
  });

  test("uses the defaults when the settings file is corrupt", () => {
    writeFileSync(file, "{ not json");

    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS);
  });

  test("uses the defaults when the settings file holds something other than settings", () => {
    writeFileSync(file, JSON.stringify(["toggle-mute"]));

    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS);
  });

  test("keeps valid hotkeys and defaults the missing or malformed ones", () => {
    writeFileSync(file, JSON.stringify({ hotkeys: { "toggle-mute": "Command+Shift+M", "toggle-camera": 7 } }));

    const { hotkeys } = loadSettings(file);

    expect(hotkeys["toggle-mute"]).toBe("Command+Shift+M");

    expect(hotkeys["toggle-camera"]).toBe("Control+Alt+C");
    expect(hotkeys["toggle-hand"]).toBe("Control+Alt+H");
  });

  test("leaves the Meeting Window off top by default", () => {
    expect(loadSettings(file).alwaysOnTop).toBe(false);
  });

  test("leaves the Meeting Window off top when the settings file is corrupt", () => {
    writeFileSync(file, "{ not json");

    expect(loadSettings(file).alwaysOnTop).toBe(false);
  });

  test("loads a saved keep window on top option", () => {
    writeFileSync(file, JSON.stringify({ alwaysOnTop: true }));

    expect(loadSettings(file).alwaysOnTop).toBe(true);
  });

  test("defaults a malformed keep window on top option without affecting the saved hotkeys", () => {
    writeFileSync(file, JSON.stringify({ alwaysOnTop: "yes", hotkeys: { "toggle-mute": "Command+Shift+M" } }));

    const settings = loadSettings(file);

    expect(settings.alwaysOnTop).toBe(false);

    expect(settings.hotkeys["toggle-mute"]).toBe("Command+Shift+M");
  });

  test("leaves the Focus Integration off until the user turns it on", () => {
    expect(loadSettings(file).focus).toEqual({
      enabled: false,
      turnOnShortcut: "Turn On Meeting Focus",
      turnOffShortcut: "Turn Off Meeting Focus",
    });
  });

  test("keeps valid Focus settings and defaults the missing or malformed ones", () => {
    writeFileSync(file, JSON.stringify({ focus: { enabled: true, turnOnShortcut: "Focus On", turnOffShortcut: 3 } }));

    expect(loadSettings(file).focus).toEqual({
      enabled: true,
      turnOnShortcut: "Focus On",
      turnOffShortcut: "Turn Off Meeting Focus",
    });
  });

  test("ignores hotkeys it does not know", () => {
    writeFileSync(file, JSON.stringify({ hotkeys: { "toggle-recording": "Control+Alt+R" } }));

    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  test("saved changes are loaded back", () => {
    const changed = {
      ...DEFAULT_SETTINGS,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, "toggle-mute": "Command+Shift+M", "leave-call": null },
      alwaysOnTop: true,
      focus: { enabled: true, turnOnShortcut: "Focus On", turnOffShortcut: "Focus Off" },
      autoMiniMode: true,
      miniModeOpacity: 0.7,
    };

    saveSettings(file, changed);

    expect(loadSettings(file)).toEqual(changed);
  });
});
