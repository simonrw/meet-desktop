import { join } from "node:path";

import { app, BrowserWindow, clipboard } from "electron";

import type { Command } from "./meeting-controller";
import { parseMeetingLink } from "./meeting-link";

export type PrefillChannel = "join-prompt:prefill";
export type JoinChannel = "join-prompt:join";
export type CloseChannel = "join-prompt:close";

/**
 * The join prompt's answer to an attempt to join: an error to show inline, or nothing once the meeting is opening.
 */
export type JoinResult = { error: string } | undefined;

export interface JoinPrompt {
  /**
   * Opens the join prompt, or brings it to the front when it's already open.
   */
  open(): void;
}

const PREFILL_CHANNEL: PrefillChannel = "join-prompt:prefill";
const JOIN_CHANNEL: JoinChannel = "join-prompt:join";
const CLOSE_CHANNEL: CloseChannel = "join-prompt:close";

const JOIN_PROMPT_PRELOAD = join(__dirname, "..", "preload", "join-prompt.js");

const INVALID_INPUT = "Enter a Meet link or a meeting code, such as abc-defg-hij.";

const JOIN_PROMPT_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Join Meeting</title>
    <style>
      :root { color-scheme: light dark; font: 13px system-ui; }
      body { margin: 0; padding: 16px 20px; }
      form { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
      label { grid-column: 1 / -1; font-weight: 600; }
      input { font: inherit; padding: 4px 6px; }
      .error { grid-column: 1 / -1; margin: 0; color: #d70015; }
    </style>
  </head>
  <body>
    <form>
      <label for="meeting">Meet link or code</label>
      <input id="meeting" type="text" autocomplete="off" spellcheck="false" placeholder="abc-defg-hij" />
      <button type="submit">Join</button>
      <p class="error" role="alert" hidden></p>
    </form>
  </body>
</html>`)}`;

/**
 * Sets up the join prompt, which takes a Meet link or meeting code and sends a join meeting Command to `onCommand`.
 * A Meet link or code on the clipboard is prefilled when the prompt opens.
 */
export function startJoinPrompt(onCommand: (command: Command) => void): JoinPrompt {
  let window: BrowserWindow | undefined;

  const attemptJoin = (input: string): JoinResult => {
    const link = parseMeetingLink(input);
    if (link === undefined) {
      return { error: INVALID_INPUT };
    }

    window?.close();
    onCommand({ type: "join-meeting", link });

    return undefined;
  };

  return {
    open() {
      // The menu bar item is clicked while another app is active, and the prompt must take the keyboard.
      app.focus({ steal: true });

      if (window) {
        window.focus();
        return;
      }

      window = new BrowserWindow({
        width: 380,
        height: 110,
        useContentSize: true,
        title: "Join Meeting",
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        webPreferences: { sandbox: true, contextIsolation: true, preload: JOIN_PROMPT_PRELOAD },
      });

      const prompt = window;
      prompt.webContents.ipc.handle(PREFILL_CHANNEL, async () => {
        const text = (await clipboard.readText()).trim();
        return parseMeetingLink(text) !== undefined ? text : "";
      });
      prompt.webContents.ipc.handle(JOIN_CHANNEL, (_event, input: string) => attemptJoin(input));
      prompt.webContents.ipc.on(CLOSE_CHANNEL, () => prompt.close());

      prompt.once("closed", () => {
        window = undefined;
      });

      prompt.loadURL(JOIN_PROMPT_PAGE);
    },
  };
}
