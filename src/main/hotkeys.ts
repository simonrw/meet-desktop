import { globalShortcut } from "electron";

import type { Command } from "./meeting-controller";

const BINDINGS: Array<{ accelerator: string; command: Command }> = [
  { accelerator: "Control+Alt+M", command: { type: "toggle-mute" } },
  { accelerator: "Control+Alt+C", command: { type: "toggle-camera" } },
  { accelerator: "Control+Alt+H", command: { type: "toggle-hand" } },
  { accelerator: "Control+Alt+S", command: { type: "show-window" } },
  { accelerator: "Control+Alt+L", command: { type: "leave-call" } },
];

/**
 * Registers the global hotkeys, which send their Commands to `onCommand` whichever app is focused.
 */
export function registerHotkeys(onCommand: (command: Command) => void): void {
  for (const { accelerator, command } of BINDINGS) {
    const registered = globalShortcut.register(accelerator, () => onCommand(command));

    if (!registered) {
      console.warn(`Hotkey ${accelerator} (${command.type}) is taken by another app`);
    }
  }
}
