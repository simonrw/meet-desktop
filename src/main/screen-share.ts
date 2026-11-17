import { join } from "node:path";

import {
  BrowserWindow,
  type BaseWindow,
  desktopCapturer,
  dialog,
  shell,
  systemPreferences,
  type DesktopCapturerSource,
  type Session,
} from "electron";

export type SourcesChannel = "source-picker:sources";
export type PickChannel = "source-picker:pick";

/**
 * A screen or window offered in the source picker.
 */
export interface PickerSource {
  id: string;
  name: string;
  thumbnail: string;
}

const SOURCES_CHANNEL: SourcesChannel = "source-picker:sources";
const PICK_CHANNEL: PickChannel = "source-picker:pick";

const SOURCE_PICKER_PRELOAD = join(__dirname, "..", "preload", "source-picker.js");

const SCREEN_RECORDING_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

const THUMBNAIL_SIZE = { width: 320, height: 200 };

const PICKER_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Share your screen</title>
    <style>
      :root { color-scheme: light dark; font: 13px system-ui; }
      body { margin: 0; padding: 16px; }
      h2 { margin: 0 0 8px; font-size: 13px; }
      section { margin-bottom: 16px; }
      .sources { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .sources button { padding: 8px; border: 1px solid transparent; border-radius: 8px; background: none; font: inherit; color: inherit; overflow: hidden; }
      .sources button:hover, .sources button:focus-visible { border-color: Highlight; background: color-mix(in srgb, Highlight 15%, transparent); outline: none; }
      .sources img { display: block; width: 100%; height: 100px; object-fit: contain; margin-bottom: 6px; }
      .sources span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      footer { text-align: right; }
    </style>
  </head>
  <body></body>
</html>`)}`;

/**
 * Sets up screen sharing for pages in the given session. The returned function answers a page's display-capture
 * permission request over the given Meeting Window: it lets the user pick a screen or window to share, after guiding
 * them to the Screen Recording permission when macOS hasn't granted it, and resolves to whether something was picked.
 */
export function shareScreenOnRequest(meetSession: Session): (meetingWindow: BaseWindow) => Promise<boolean> {
  let picked: DesktopCapturerSource | undefined;

  meetSession.setDisplayMediaRequestHandler((_request, respond) => {
    respond(picked ? { video: picked } : null);
    picked = undefined;
  });

  // The pick happens in the permission request, ahead of the display media request, because only a refused
  // permission reaches Meet as the cancelled share it expects.
  return async (meetingWindow) => {
    picked = await chooseSource(meetingWindow).catch(reportFailure);

    return picked !== undefined;
  };
}

async function chooseSource(meetingWindow: BaseWindow): Promise<DesktopCapturerSource | undefined> {
  if (systemPreferences.getMediaAccessStatus("screen") !== "granted") {
    await explainScreenRecordingPermission(meetingWindow);
    return undefined;
  }

  const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: THUMBNAIL_SIZE });

  return pickSource(meetingWindow, sources);
}

function reportFailure(error: unknown): undefined {
  console.error("Screen share failed", error);
}

async function explainScreenRecordingPermission(meetingWindow: BaseWindow): Promise<void> {
  const { response } = await dialog.showMessageBox(meetingWindow, {
    type: "info",
    message: "Meet needs permission to share your screen",
    detail:
      "macOS only lets apps you approve record the screen. Turn on Meet under Privacy & Security > Screen & System " +
      "Audio Recording in System Settings, reopen Meet when macOS asks, then share your screen again.",
    buttons: ["Open System Settings", "Not Now"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response !== 0) {
    return;
  }

  // macOS lists an app in the Screen Recording pane only once it has tried to capture the screen.
  await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } }).catch(() => []);

  await shell.openExternal(SCREEN_RECORDING_SETTINGS);
}

/**
 * Shows the source picker over the Meeting Window and resolves to the picked source, or `undefined` when the picker
 * is closed without a pick.
 */
function pickSource(
  meetingWindow: BaseWindow,
  sources: DesktopCapturerSource[],
): Promise<DesktopCapturerSource | undefined> {
  const picker = new BrowserWindow({
    parent: meetingWindow,
    modal: true,
    width: 640,
    height: 520,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: { sandbox: true, contextIsolation: true, preload: SOURCE_PICKER_PRELOAD },
  });

  picker.webContents.ipc.handle(SOURCES_CHANNEL, (): PickerSource[] => {
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    }));
  });

  picker.loadURL(PICKER_PAGE);

  return new Promise((resolve) => {
    let picked: DesktopCapturerSource | undefined;

    picker.webContents.ipc.once(PICK_CHANNEL, (_event, id: string) => {
      picked = sources.find((source) => source.id === id);
      picker.close();
    });

    picker.once("closed", () => resolve(picked));
  });
}
