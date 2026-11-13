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
    });
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

  test("ignores hotkeys it does not know", () => {
    writeFileSync(file, JSON.stringify({ hotkeys: { "toggle-mini-mode": "Control+Alt+P" } }));

    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  test("saved changes are loaded back", () => {
    const changed = {
      ...DEFAULT_SETTINGS,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, "toggle-mute": "Command+Shift+M", "leave-call": null },
    };

    saveSettings(file, changed);

    expect(loadSettings(file)).toEqual(changed);
  });
});
