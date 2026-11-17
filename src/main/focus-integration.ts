import { execFile } from "node:child_process";

import type { Integration } from "./integration-lifecycle";
import type { FocusSettings } from "./settings-store";

// A Shortcut waiting on a prompt the user never sees would otherwise hold up quitting forever.
const SHORTCUT_TIMEOUT_MS = 30_000;

export type RunShortcut = (name: string) => Promise<void>;

export interface FocusIntegration extends Integration {
  /**
   * Runs the turn on Shortcut and then the turn off Shortcut, resolving to whether both worked and a message saying
   * how it went.
   */
  test(): Promise<{ ok: boolean; message: string }>;
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
 * The Focus Integration: macOS has no API for setting a Focus, so it runs the user's Shortcuts to turn one on for a
 * call and off afterwards.
 */
export function focusIntegration(settings: () => FocusSettings, runShortcut: RunShortcut): FocusIntegration {
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
