import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

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
   * Brings the app forward, looks for a newer Release and shows a dialog with what it found, offering to restart to
   * update when one is ready and there's no call.
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
export interface UpdateSource {
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
 * Looks for Updates from `source` at launch and every hour after, and keeps the Update state the menus show. Without a
 * source, as in copies run with `npm start`, it never looks. Restarting to update calls `restoreIntegrations` before
 * installing.
 */
export function startUpdates(
  controller: MeetingController,
  restoreIntegrations: () => Promise<void>,
  source: UpdateSource | undefined,
): Updates {
  let state: UpdateState = { status: "none" };
  const listeners: ((state: UpdateState) => void)[] = [];

  const isReady = (version: string) => state.status === "ready" && state.version === version;

  if (source !== undefined) {
    source.onDownloaded((version) => {
      if (isReady(version)) {
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
      // Chosen from the menu bar menu or the mini window while another app is active, which would keep the dialog
      // behind its windows.
      app.focus({ steal: true });

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

      if (found !== undefined && !isReady(found)) {
        await tell(
          `Downloading ${app.name} ${found}`,
          '"Restart to Update" appears in the menu bar menu once it has downloaded.',
        );
      } else if (state.status !== "ready") {
        await tell("You're on the latest version", `${app.name} ${app.getVersion()}`);
      } else if (controller.inCall) {
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
      if (source === undefined || state.status !== "ready" || controller.inCall) {
        return;
      }

      // Installing closes the windows before "before-quit", so the usual quit can't be relied on to restore the
      // Integrations first.
      await restoreIntegrations();
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

/**
 * Gets Updates from this repository's GitHub Releases through electron-updater, downloading them in the background and
 * installing a downloaded one when the app quits.
 */
export function electronUpdaterSource(): UpdateSource {
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
