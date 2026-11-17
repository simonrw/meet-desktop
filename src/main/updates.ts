import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

import { isRecord, readJsonFile } from "./json-file";
import type { MeetingController } from "./meeting-controller";

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Whether there's an Update to install: nothing, or one downloaded and ready, with its version.
 */
export type UpdateState = { status: "none" } | { status: "ready"; version: string };

export interface Updates {
  readonly state: UpdateState;

  /**
   * Calls `listener` with the new Update state each time it changes.
   */
  onStateChange(listener: (state: UpdateState) => void): void;

  /**
   * Looks for a newer Release now and shows a dialog with what it found, offering to restart to update when one is
   * ready and there's no call.
   */
  checkForUpdates(): Promise<void>;

  /**
   * Restores the applied Integrations and installs the downloaded Update, relaunching the app on the new version. Does
   * nothing during a call.
   */
  restartToUpdate(): Promise<void>;
}

/**
 * Where Updates come from: it looks for a newer Release, downloading it in the background, and installs the
 * downloaded one.
 */
interface UpdateSource {
  /**
   * Looks for a newer Release, resolving to its version if there is one and rejecting when the check fails.
   */
  check(): Promise<string | undefined>;

  /**
   * Calls `listener` with the version of each Update once it has downloaded.
   */
  onDownloaded(listener: (version: string) => void): void;

  /**
   * Quits the app and installs the downloaded Update.
   */
  install(): void;
}

/**
 * Looks for Updates at launch and every hour after, and keeps the Update state the menus show.
 *
 * Packaged builds get Updates from GitHub Releases. Unpackaged builds never look for them, unless given
 * `fakeSourceFile`, a JSON file naming the latest Release (see `fakeUpdateSource`).
 */
export function startUpdates(controller: MeetingController, fakeSourceFile: string | undefined): Updates {
  const source = fakeSourceFile ? fakeUpdateSource(fakeSourceFile) : app.isPackaged ? electronUpdaterSource() : undefined;

  let state: UpdateState = { status: "none" };
  const listeners: ((state: UpdateState) => void)[] = [];

  if (source !== undefined) {
    source.onDownloaded((version) => {
      if (state.status === "ready" && state.version === version) {
        return;
      }

      state = { status: "ready", version };
      listeners.forEach((listener) => listener(state));
    });

    const check = () => {
      console.log("Checking for Updates");
      source.check().catch((error) => console.error("Checking for Updates failed:", error));
    };
    check();
    setInterval(check, CHECK_INTERVAL_MS);
  }

  const updates: Updates = {
    get state() {
      return state;
    },

    onStateChange(listener) {
      listeners.push(listener);
    },

    async checkForUpdates() {
      let found: string | undefined;
      try {
        if (source === undefined) {
          throw new Error("Copies run with npm start never update.");
        }

        found = await source.check();
      } catch (error) {
        await tell("Couldn't check for Updates", error instanceof Error ? error.message : String(error));
        return;
      }

      if (found !== undefined && !(state.status === "ready" && state.version === found)) {
        await tell(`Downloading ${app.name} ${found}`, '"Restart to Update" appears in the menu bar once it has downloaded.');
      } else if (state.status !== "ready") {
        await tell("You're on the latest version", `${app.name} ${app.getVersion()}`);
      } else if (controller.state.status === "in-call") {
        await tell(`${app.name} ${state.version} is ready to install`, "You can restart to update once you leave the call.");
      } else {
        const { response } = await dialog.showMessageBox({
          message: `${app.name} ${state.version} is ready to install`,
          detail: "Restart now to install it?",
          buttons: ["Restart", "Later"],
          defaultId: 0,
          cancelId: 1,
        });
        if (response === 0) {
          await updates.restartToUpdate();
        }
      }
    },

    async restartToUpdate() {
      if (source === undefined || state.status !== "ready" || controller.state.status === "in-call") {
        return;
      }

      // Installing closes the windows before "before-quit", so the usual quit can't be relied on to restore them first.
      await controller.quit();
      source.install();
    },
  };

  return updates;
}

/**
 * Shows `message` with `detail` in a dialog with an OK button.
 */
async function tell(message: string, detail: string): Promise<void> {
  await dialog.showMessageBox({ message, detail, buttons: ["OK"] });
}

function electronUpdaterSource(): UpdateSource {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // electron-updater logs its own errors, but an "error" event with no listener would throw.
  autoUpdater.on("error", () => {});

  return {
    async check() {
      const result = await autoUpdater.checkForUpdates();
      return result?.isUpdateAvailable ? result.updateInfo.version : undefined;
    },

    onDownloaded(listener) {
      autoUpdater.on("update-downloaded", (info) => listener(info.version));
    },

    install() {
      autoUpdater.quitAndInstall();
    },
  };
}

/**
 * An update source for end-to-end tests. `file` holds the latest Release, `{ "version": "x.y.z" }`, or an error to
 * fail checks with, `{ "error": "message" }`. A newer version counts as downloaded straight away, and installing logs
 * its version to `installed-updates.log` next to `file` before quitting.
 */
function fakeUpdateSource(file: string): UpdateSource {
  const listeners: ((version: string) => void)[] = [];
  let downloaded: string | undefined;

  return {
    async check() {
      const latest = readJsonFile(file);
      if (!isRecord(latest)) {
        throw new Error(`Can't read the latest Release from ${file}`);
      }

      if (typeof latest.error === "string") {
        throw new Error(latest.error);
      }

      if (typeof latest.version !== "string" || !isNewer(latest.version, app.getVersion())) {
        return undefined;
      }

      downloaded = latest.version;
      listeners.forEach((listener) => listener(latest.version as string));
      return latest.version;
    },

    onDownloaded(listener) {
      listeners.push(listener);
    },

    install() {
      appendFileSync(join(dirname(file), "installed-updates.log"), `${downloaded}\n`);
      app.quit();
    },
  };
}

function isNewer(version: string, than: string): boolean {
  const parts = version.split(".").map(Number);
  const thanParts = than.split(".").map(Number);

  for (let i = 0; i < Math.max(parts.length, thanParts.length); i++) {
    const difference = (parts[i] ?? 0) - (thanParts[i] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }

  return false;
}
