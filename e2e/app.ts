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
 * What the fake update source says the latest Release is: a version, or an error to fail checks with.
 */
export type LatestRelease = { version: string } | { error: string };

/**
 * Launches the built app against the given Meet origin, with a throwaway user data directory unless given one.
 *
 * The app runs Shortcuts through a fake `shortcuts` command, so tests never run the user's real ones. The fake logs
 * each run for `shortcutsRun`, and fails for Shortcut names starting with "Missing".
 *
 * Given `latestRelease`, the app looks for Updates through a fake update source, which logs each install for
 * `updatesInstalled`. Otherwise it never looks for Updates.
 */
export async function launchApp(
  meetOrigin: string,
  userData = newUserData(),
  latestRelease?: LatestRelease,
): Promise<ElectronApplication> {
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

  const { MEET_DESKTOP_UPDATES: _, ...env } = process.env as Record<string, string>;

  if (latestRelease !== undefined) {
    env.MEET_DESKTOP_UPDATES = join(userData, "latest-release.json");
    writeFileSync(env.MEET_DESKTOP_UPDATES, JSON.stringify(latestRelease));
  }

  return electron.launch({
    args: ["."],
    env: {
      ...env,
      MEET_DESKTOP_MEET_ORIGIN: meetOrigin,
      MEET_DESKTOP_USER_DATA: userData,
      MEET_DESKTOP_SHORTCUTS: fakeShortcuts,
    },
  });
}

/**
 * Lists the version of each Update installed through the fake update source by apps launched with this user data
 * directory.
 */
export function updatesInstalled(userData: string): string[] {
  const log = join(userData, "installed-updates.log");

  return existsSync(log) ? readFileSync(log, "utf8").trimEnd().split("\n") : [];
}

/**
 * Lists the arguments of each run of the fake `shortcuts` command by apps launched with this user data directory.
 */
export function shortcutsRun(userData: string): string[] {
  const log = join(userData, "shortcuts.log");

  return existsSync(log) ? readFileSync(log, "utf8").trimEnd().split("\n") : [];
}

/**
 * Clicks the item with the given id in the app menu or the menu bar menu.
 */
export function clickMenuItem(app: ElectronApplication, menu: "app menu" | "menu bar", id: string): Promise<void> {
  return app.evaluate(
    ({ Menu }, { menu, id }) => {
      const items = menu === "app menu" ? Menu.getApplicationMenu() : globalThis.menuBar?.menu;
      items?.getMenuItemById(id)?.click();
    },
    { menu, id },
  );
}

/**
 * What the app asked in a message box.
 */
export type Question = { message: string; detail: string; buttons: string[] };

/**
 * Answers the next question the app asks with the button labelled `button`, or the first button if none is given,
 * resolving to what it asked.
 */
export function answerNextQuestion(app: ElectronApplication, button?: string): Promise<Question> {
  // A real dialog would block the test until someone answered it.
  return app.evaluate(
    ({ dialog }, button) =>
      new Promise<Question>((resolve) => {
        dialog.showMessageBox = async (...args: unknown[]) => {
          const options = args.at(-1) as Electron.MessageBoxOptions;
          const question = { message: options.message, detail: options.detail ?? "", buttons: options.buttons ?? [] };
          resolve(question);

          return { response: Math.max(question.buttons.indexOf(button ?? ""), 0), checkboxChecked: false };
        };
      }),
    button,
  );
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
