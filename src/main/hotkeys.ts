import { globalShortcut } from "electron";

import type { Command } from "./meeting-controller";
import { HOTKEY_NAMES, type HotkeyName, type Settings } from "./settings-store";

let registered: string[] = [];

/**
 * Registers the hotkeys that are turned on in place of any registered before. Each one sends its Command to
 * `onCommand` whichever app is focused. Returns the hotkeys whose combination couldn't be registered.
 */
export function registerHotkeys(hotkeys: Settings["hotkeys"], onCommand: (command: Command) => void): HotkeyName[] {
  pauseHotkeys();

  const failed: HotkeyName[] = [];
  for (const name of HOTKEY_NAMES) {
    const accelerator = hotkeys[name];
    if (accelerator === null) {
      continue;
    }

    if (tryRegister(accelerator, () => onCommand({ type: name }))) {
      registered.push(accelerator);
    } else {
      failed.push(name);
    }
  }

  return failed;
}

/**
 * Unregisters every hotkey until the next `registerHotkeys`.
 */
export function pauseHotkeys(): void {
  for (const accelerator of registered) {
    globalShortcut.unregister(accelerator);
  }

  registered = [];
}

function tryRegister(accelerator: string, callback: () => void): boolean {
  // A hand-edited settings file can hold a combination already registered or one Electron can't parse.
  if (globalShortcut.isRegistered(accelerator)) {
    return false;
  }

  try {
    return globalShortcut.register(accelerator, callback);
  } catch {
    return false;
  }
}
