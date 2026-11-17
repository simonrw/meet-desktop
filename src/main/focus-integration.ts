import { execFile } from "node:child_process";

import type { Integration } from "./meeting-controller";
import type { FocusSettings } from "./settings-store";

// A Shortcut waiting on a prompt the user never sees would otherwise hold up quitting forever.
const SHORTCUT_TIMEOUT_MS = 30_000;

export type RunShortcut = (name: string) => Promise<void>;

/**
 * How a test of the Focus Shortcuts went: whether both worked, and a message saying so.
 */
export interface FocusTestResult {
  ok: boolean;
  message: string;
}

export interface FocusIntegration extends Integration {
  /**
   * Runs the turn on Shortcut and then the turn off Shortcut.
   */
  test(): Promise<FocusTestResult>;
}

/**
 * Returns a function that runs the named Shortcut with the given `shortcuts` command, rejecting with a message the
 * user can read when it fails.
 */
export function shortcutRunner(command: string): RunShortcut {
  return (name) =>
    new Promise((resolve, reject) => {
      if (name.trim() === "") {
        reject(new Error("No Shortcut name is set"));
        return;
      }

      execFile(command, ["run", name], { timeout: SHORTCUT_TIMEOUT_MS }, (error, _stdout, stderr) => {
        if (!error) {
          resolve();
        } else if ("code" in error && error.code === "ENOENT") {
          reject(new Error("The shortcuts command isn't available"));
        } else if (error.killed) {
          reject(new Error(`Shortcut “${name}” didn't finish within ${SHORTCUT_TIMEOUT_MS / 1000} seconds`));
        } else {
          const reason = String(stderr).trim().replace(/^Error: /, "") || `exit code ${error.code}`;
          reject(new Error(`Shortcut “${name}” failed: ${reason}`));
        }
      });
    });
}

/**
 * The Focus Integration: runs the user's Shortcuts to turn a Focus on for a call and off afterwards.
 */
export function focusIntegration(settings: () => FocusSettings, runShortcut: RunShortcut): FocusIntegration {
  // macOS has no API for setting a Focus, but a Shortcut can set one.
  return {
    id: "focus",
    label: "Focus",

    get enabled() {
      return settings().enabled;
    },

    async apply() {
      await runShortcut(settings().turnOnShortcut);

      // The app can't read the Focus that was on before, so restoring always just turns it off.
      return null;
    },

    async restore() {
      await runShortcut(settings().turnOffShortcut);
    },

    async test() {
      try {
        await runShortcut(settings().turnOnShortcut);
        await runShortcut(settings().turnOffShortcut);
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }

      return { ok: true, message: "Both Shortcuts ran: the Focus turned on and then off." };
    },
  };
}
