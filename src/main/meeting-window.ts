import { join } from "node:path";

import {
  app,
  BrowserWindow,
  screen,
  session,
  shell,
  systemPreferences,
  type Session,
  type WebContents,
} from "electron";

import { MEET_BRIDGE_PRELOAD } from "./meet-bridge";
import { isInAppUrl, isMeetUrl } from "./navigation-policy";
import { shareScreenOnRequest } from "./screen-share";
import { loadBounds, saveBounds } from "./window-bounds";

// Persistent so the Google login survives relaunches, and dedicated so it never mixes with a browser profile.
const PARTITION = "persist:meet";

const DEFAULT_SIZE = { width: 1280, height: 800 };

const MEET_PERMISSIONS = new Set([
  "media",
  "display-capture",
  "notifications",
  "fullscreen",
  "clipboard-sanitized-write",
  "clipboard-read",
]);

export interface MeetingWindow {
  readonly webContents: WebContents;
  show(): void;
}

/**
 * Opens the Meeting Window: Meet hosted in a dedicated persistent session, which hides on close and remembers
 * its bounds.
 */
export function createMeetingWindow(meetOrigin: string): MeetingWindow {
  const meetSession = session.fromPartition(PARTITION);
  configureSession(meetSession, meetOrigin);

  const boundsFile = join(app.getPath("userData"), "window-bounds.json");
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);

  const window = new BrowserWindow({
    ...(loadBounds(boundsFile, workAreas) ?? DEFAULT_SIZE),
    title: "Meet",
    webPreferences: { session: meetSession, sandbox: true, contextIsolation: true, preload: MEET_BRIDGE_PRELOAD },
  });

  routeNavigation(window, meetOrigin);
  rememberBounds(window, boundsFile);
  hideOnClose(window);

  window.loadURL(meetOrigin);

  return {
    webContents: window.webContents,
    show: () => window.show(),
  };
}

function configureSession(meetSession: Session, meetOrigin: string): void {
  const isAllowed = (permission: string, url: string) => isMeetUrl(url, meetOrigin) && MEET_PERMISSIONS.has(permission);

  meetSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return isAllowed(permission, requestingOrigin);
  });

  const chooseScreenShare = shareScreenOnRequest(meetSession);

  meetSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (!isAllowed(permission, details.requestingUrl)) {
      callback(false);
      return;
    }

    if (permission === "display-capture") {
      callback(await chooseScreenShare(contents));
      return;
    }

    if (permission === "media" && "mediaTypes" in details) {
      callback(await askMacOSForMedia(details.mediaTypes ?? []));
      return;
    }

    callback(true);
  });
}

async function askMacOSForMedia(mediaTypes: Array<"video" | "audio">): Promise<boolean> {
  for (const mediaType of mediaTypes) {
    const granted = await systemPreferences.askForMediaAccess(mediaType === "video" ? "camera" : "microphone");
    if (!granted) {
      return false;
    }
  }

  return true;
}

function routeNavigation(window: BrowserWindow, meetOrigin: string): void {
  const contents = window.webContents;

  contents.setWindowOpenHandler(({ url }) => {
    if (isInAppUrl(url, meetOrigin)) {
      contents.loadURL(url);
    } else {
      openInBrowser(url);
    }

    return { action: "deny" };
  });

  contents.on("will-navigate", (event) => {
    // Only links clicked inside Meet are policed: sign-in flows (including Workspace SSO providers) hop across
    // origins and must stay in the window to complete.
    if (!isMeetUrl(contents.getURL(), meetOrigin) || isInAppUrl(event.url, meetOrigin)) {
      return;
    }

    event.preventDefault();
    openInBrowser(event.url);
  });
}

function openInBrowser(url: string): void {
  if (URL.canParse(url) && ["http:", "https:", "mailto:"].includes(new URL(url).protocol)) {
    shell.openExternal(url);
  }
}

function rememberBounds(window: BrowserWindow, boundsFile: string): void {
  const save = () => saveBounds(boundsFile, window.getNormalBounds());

  window.on("resized", save);
  window.on("moved", save);
  window.on("close", save);
}

function hideOnClose(window: BrowserWindow): void {
  let quitting = false;
  app.on("before-quit", () => {
    quitting = true;
  });

  window.on("close", (event) => {
    if (quitting) {
      return;
    }

    event.preventDefault();

    // Hiding a full-screen window leaves an empty black Space behind.
    if (window.isFullScreen()) {
      window.once("leave-full-screen", () => window.hide());
      window.setFullScreen(false);
    } else {
      window.hide();
    }
  });
}
