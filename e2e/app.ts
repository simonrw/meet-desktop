import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron as electron, type ElectronApplication } from "@playwright/test";

/**
 * Serves the stub Meet page on a random local port and returns its origin.
 */
export async function startStubMeet(): Promise<{ origin: string; close: () => void }> {
  const page = readFileSync(join(__dirname, "stub", "index.html"));
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(page);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return { origin: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/**
 * Creates a throwaway user data directory for the app.
 */
export function newUserData(): string {
  return mkdtempSync(join(tmpdir(), "meet-desktop-e2e-"));
}

/**
 * Launches the built app against the given Meet origin, with a throwaway user data directory unless given one.
 *
 * The app runs Shortcuts through a fake `shortcuts` command, so tests never run the user's real ones. The fake logs
 * each run for `shortcutsRun`, and fails for Shortcut names starting with "Missing".
 */
export async function launchApp(meetOrigin: string, userData = newUserData()): Promise<ElectronApplication> {
  const fakeShortcuts = join(userData, "fake-shortcuts");
  writeFileSync(
    fakeShortcuts,
    `#!/bin/sh
echo "$*" >> "${join(userData, "shortcuts.log")}"
case "$2" in
  Missing*) echo "Error: The operation couldn’t be completed. Couldn’t find shortcut" >&2; exit 1 ;;
esac
`,
    { mode: 0o755 },
  );

  return electron.launch({
    args: ["."],
    env: {
      ...process.env,
      MEET_DESKTOP_MEET_ORIGIN: meetOrigin,
      MEET_DESKTOP_USER_DATA: userData,
      MEET_DESKTOP_SHORTCUTS: fakeShortcuts,
    },
  });
}

/**
 * Lists the arguments of each run of the fake `shortcuts` command by apps launched with this user data directory.
 */
export function shortcutsRun(userData: string): string[] {
  const log = join(userData, "shortcuts.log");

  return existsSync(log) ? readFileSync(log, "utf8").trimEnd().split("\n") : [];
}

/**
 * Calls `method` on the Meeting Window, Full or mini, whichever is showing the Meet page.
 */
export function onMeetingWindow(app: ElectronApplication, method: "isVisible" | "hide" | "close"): Promise<unknown> {
  return app.evaluate(
    ({ BaseWindow, WebContentsView }, method) => {
      const window = BaseWindow.getAllWindows().find((window) => {
        const content = window.contentView;
        return content instanceof WebContentsView && content.webContents.getTitle() === "Stub Meet";
      });

      return window?.[method]();
    },
    method,
  );
}
