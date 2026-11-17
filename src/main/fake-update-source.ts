import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { app } from "electron";

import { isRecord, readJsonFile } from "./json-file";
import type { UpdateSource } from "./updates";

/**
 * An update source for end-to-end tests. `file` holds the latest Release, `{ "version": "x.y.z" }`, or an error to
 * fail checks with, `{ "error": "message" }`. A newer version counts as downloaded straight away. Installing quits the
 * app and, unless something cancels that quit, logs the version to `installed-updates.log` next to `file`.
 */
export function fakeUpdateSource(file: string): UpdateSource {
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
      // electron-updater's quit and install relies on the quit it starts going through, so a cancelled one counts as no
      // install.
      app.once("before-quit", (event) => {
        if (!event.defaultPrevented) {
          appendFileSync(join(dirname(file), "installed-updates.log"), `${downloaded}\n`);
        }
      });

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
