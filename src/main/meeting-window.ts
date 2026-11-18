import { join } from "node:path";

import {
  app,
  autoUpdater,
  BaseWindow,
  dialog,
  screen,
  session,
  shell,
  systemPreferences,
  View,
  WebContentsView,
  type Session,
  type WebContents,
} from "electron";

import { MEET_BRIDGE_PRELOAD } from "./meet-bridge";
import type { Command, MeetingWindowPort, Presentation } from "./meeting-controller";
import { meetingUrl } from "./meeting-link";
import { isInAppUrl, isMeetUrl } from "./navigation-policy";
import { shareScreenOnRequest } from "./screen-share";
import { loadBounds, saveBounds, type Rectangle } from "./window-bounds";

export type HandleChannel = "mini-mode-handle";

/**
 * What the mini window's handle reports: the pointer's screen position as the user drags, or a double-click.
 */
export type HandleMessage = { type: "drag-start" | "drag"; x: number; y: number } | { type: "double-click" };

// Persistent so the Google login survives relaunches, and dedicated so it never mixes with a browser profile.
const PARTITION = "persist:meet";

const DEFAULT_SIZE = { width: 1280, height: 800 };

const MINI_DEFAULT_SIZE = { width: 400, height: 225 };
const MINI_MIN_SIZE = { width: 240, height: 135 };
const MINI_DEFAULT_MARGIN = 24;

const HANDLE_HEIGHT = 20;
const HANDLE_CHANNEL: HandleChannel = "mini-mode-handle";
const HANDLE_PRELOAD = join(__dirname, "..", "preload", "mini-mode-handle.js");

const HANDLE_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Mini Mode handle</title>
    <style>
      html, body { margin: 0; height: 100%; }
      body { background: linear-gradient(rgb(0 0 0 / 45%), transparent); cursor: grab; }
      body::after {
        content: ""; position: absolute; top: 6px; left: calc(50% - 18px);
        width: 36px; height: 4px; border-radius: 2px; background: rgb(255 255 255 / 70%);
      }
    </style>
  </head>
  <body></body>
</html>`)}`;

const MEET_PERMISSIONS = new Set([
  "media",
  "display-capture",
  "notifications",
  "fullscreen",
  "clipboard-sanitized-write",
  "clipboard-read",
]);

export interface MeetingWindow extends MeetingWindowPort {
  readonly webContents: WebContents;

  /**
   * Sets whether the Full window floats above other apps' windows, on the current Space only. The mini window always
   * floats.
   */
  keepOnTop(onTop: boolean): void;

  /**
   * Sets the mini window's opacity, from 0 to 1. The Full window stays opaque.
   */
  setMiniOpacity(opacity: number): void;
}

interface MiniWindow {
  window: BaseWindow;
  handle: WebContentsView;
  saveBounds(): void;
}

/**
 * Creates the Meeting Window, hidden until `show` is called: Meet hosted in a dedicated persistent session, shown either Full or in Mini Mode, a
 * frameless window floating above every other app. Each presentation remembers its own bounds. Closing the window
 * sends the close window Command to `onCommand` in place of closing it, until the app quits, and double-clicking the
 * mini window sends the toggle Mini Mode Command.
 */
export function createMeetingWindow(meetOrigin: string, onCommand: (command: Command) => void): MeetingWindow {
  const meetSession = session.fromPartition(PARTITION);
  const userData = app.getPath("userData");

  let presentation: Presentation = "full";
  let miniOpacity = 1;
  let mini: MiniWindow | undefined;
  let openingMeeting = false;
  let quitting = false;

  const startQuitting = () => {
    quitting = true;
  };
  app.on("before-quit", startQuitting);
  // Installing an Update closes the windows before "before-quit".
  autoUpdater.on("before-quit-for-update", startQuitting);

  const meetView = new WebContentsView({
    webPreferences: { session: meetSession, sandbox: true, contextIsolation: true, preload: MEET_BRIDGE_PRELOAD },
  });

  const full = new BaseWindow({
    ...(loadBounds(join(userData, "window-bounds.json"), workAreas()) ?? DEFAULT_SIZE),
    title: "Meet",
    show: false,
  });
  full.setContentView(meetView);

  const shown = () => (presentation === "mini" && mini ? mini.window : full);

  configureSession(meetSession, meetOrigin, shown);
  routeNavigation(meetView.webContents, meetOrigin, () => openingMeeting || quitting);
  meetView.webContents.on("page-title-updated", (_event, title) => {
    // The page outlives the window while quitting, and an uncaught error here shows a modal alert that stops the quit.
    if (!full.isDestroyed()) {
      full.setTitle(title);
    }
  });

  const saveFullBounds = rememberBounds(full, join(userData, "window-bounds.json"));

  const interceptClose = (window: BaseWindow) => {
    window.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        onCommand({ type: "close-window" });
      }
    });
  };
  interceptClose(full);

  // Unlike a BrowserWindow's page, a view's page outlives its window, and one still loading holds up quitting.
  full.once("closed", () => meetView.webContents.close());

  meetView.webContents.loadURL(meetOrigin);

  const enterMini = () => {
    if (!mini) {
      mini = createMiniWindow(join(userData, "mini-window-bounds.json"), miniOpacity, () =>
        onCommand({ type: "toggle-mini-mode" }),
      );
      interceptClose(mini.window);
    }

    saveFullBounds();

    full.setContentView(new View());
    mini.window.setContentView(meetView);
    meetView.addChildView(mini.handle);

    // The user may be working in another app, which must keep the keyboard.
    mini.window.showInactive();
    full.hide();
  };

  const moveToFull = (mini: MiniWindow) => {
    mini.saveBounds();

    meetView.removeChildView(mini.handle);
    mini.window.setContentView(new View());
    full.setContentView(meetView);
  };

  const show = () => {
    const window = shown();
    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    meetView.webContents.focus();
  };

  return {
    webContents: meetView.webContents,

    get presentation() {
      return presentation;
    },

    show,

    hide() {
      if (presentation === "mini" && mini) {
        moveToFull(mini);
        mini.window.hide();
      }

      presentation = "full";
      leaveFullScreen(full, () => full.hide());
    },

    keepOnTop: (onTop) => full.setAlwaysOnTop(onTop, "floating"),

    setPresentation(next) {
      if (next === presentation) {
        return;
      }

      presentation = next;
      if (next === "mini") {
        leaveFullScreen(full, () => presentation === "mini" && enterMini());
      } else if (mini) {
        moveToFull(mini);
        full.showInactive();
        mini.window.hide();
      }
    },

    setMiniOpacity(opacity) {
      miniOpacity = opacity;
      mini?.window.setOpacity(opacity);
    },

    openMeeting(link) {
      openingMeeting = true;
      void meetView.webContents.loadURL(meetingUrl(link, meetOrigin)).finally(() => {
        openingMeeting = false;
      });
      show();
    },

    confirmLeave: () => askToLeave(shown(), show, "Leave the call?", "Leave"),
    confirmSwitch: (link) => askToLeave(shown(), show, `Leave the call and join ${link.code}?`, "Leave and Join"),
  };
}

/**
 * Asks `message` in a sheet on the window, resolving to true if the user picks the `leaveButton` over Cancel.
 */
async function askToLeave(window: BaseWindow, show: () => void, message: string, leaveButton: string): Promise<boolean> {
  // The question is a sheet on the window, which may be hidden or behind another app.
  show();

  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    message,
    buttons: [leaveButton, "Cancel"],

    // Return must not hang up: the question can appear while the user is typing in another app.
    defaultId: 1,
    cancelId: 1,
  });

  return response === 0;
}

/**
 * Creates the hidden mini window, with a handle along its top edge that the user drags it by and double-clicks to
 * call `onDoubleClick`.
 */
function createMiniWindow(boundsFile: string, opacity: number, onDoubleClick: () => void): MiniWindow {
  const window = new BaseWindow({
    ...(loadBounds(boundsFile, workAreas()) ?? defaultMiniBounds()),
    minWidth: MINI_MIN_SIZE.width,
    minHeight: MINI_MIN_SIZE.height,
    frame: false,
    show: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Joins every Space, including full-screen apps' Spaces. setVisibleOnAllWorkspaces would also do so, but by
    // default turns the whole app into a background app with no Dock icon, app switcher entry or menus.
    type: "panel",
  });

  window.setOpacity(opacity);
  window.setAlwaysOnTop(true, "floating");

  const handle = new WebContentsView({
    webPreferences: { sandbox: true, contextIsolation: true, preload: HANDLE_PRELOAD },
  });
  handle.setBackgroundColor("#00000000");
  handle.webContents.loadURL(HANDLE_PAGE);

  const layoutHandle = () => handle.setBounds({ x: 0, y: 0, width: window.getContentBounds().width, height: HANDLE_HEIGHT });
  layoutHandle();
  window.on("resize", layoutHandle);

  let dragStart: { pointer: { x: number; y: number }; window: number[] } | undefined;
  handle.webContents.ipc.on(HANDLE_CHANNEL, (_event, message: HandleMessage) => {
    if (message.type === "drag-start") {
      dragStart = { pointer: { x: message.x, y: message.y }, window: window.getPosition() };
    } else if (message.type === "drag" && dragStart) {
      const [x, y] = dragStart.window as [number, number];
      window.setPosition(x + message.x - dragStart.pointer.x, y + message.y - dragStart.pointer.y);
    } else if (message.type === "double-click") {
      onDoubleClick();
    }
  });

  window.once("closed", () => handle.webContents.close());

  return { window, handle, saveBounds: rememberBounds(window, boundsFile) };
}

function defaultMiniBounds(): Rectangle {
  const area = screen.getPrimaryDisplay().workArea;

  return {
    x: area.x + area.width - MINI_DEFAULT_SIZE.width - MINI_DEFAULT_MARGIN,
    y: area.y + area.height - MINI_DEFAULT_SIZE.height - MINI_DEFAULT_MARGIN,
    ...MINI_DEFAULT_SIZE,
  };
}

function workAreas(): Rectangle[] {
  return screen.getAllDisplays().map((display) => display.workArea);
}

function configureSession(meetSession: Session, meetOrigin: string, meetingWindow: () => BaseWindow): void {
  const isAllowed = (permission: string, url: string) => isMeetUrl(url, meetOrigin) && MEET_PERMISSIONS.has(permission);

  meetSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    return isAllowed(permission, requestingOrigin);
  });

  const chooseScreenShare = shareScreenOnRequest(meetSession);

  meetSession.setPermissionRequestHandler(async (_contents, permission, callback, details) => {
    if (!isAllowed(permission, details.requestingUrl)) {
      callback(false);
      return;
    }

    if (permission === "display-capture") {
      callback(await chooseScreenShare(meetingWindow()));
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

/**
 * Keeps Meet's own pages in the window and opens other links in the browser. The page may only be left despite its
 * "leave site?" prompt while `mayLeavePage` returns true.
 */
function routeNavigation(contents: WebContents, meetOrigin: string, mayLeavePage: () => boolean): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isInAppUrl(url, meetOrigin)) {
      contents.loadURL(url);
    } else {
      openInBrowser(url);
    }

    return { action: "deny" };
  });

  // Electron turns a page's "leave site?" prompt into a silent refusal, which would stop a confirmed switch to another
  // meeting or quitting.
  contents.on("will-prevent-unload", (event) => {
    if (mayLeavePage()) {
      event.preventDefault();
    }
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

/**
 * Saves the window's bounds whenever the user moves or resizes it, returning a function that saves them on demand.
 */
function rememberBounds(window: BaseWindow, boundsFile: string): () => void {
  const save = () => saveBounds(boundsFile, window.getNormalBounds());

  window.on("resized", save);
  window.on("moved", save);
  window.on("close", save);

  return save;
}

/**
 * Takes the window out of full screen, if it's in it, and then calls `then`.
 */
function leaveFullScreen(window: BaseWindow, then: () => void): void {
  // Hiding a full-screen window leaves an empty black Space behind.
  if (window.isFullScreen()) {
    window.once("leave-full-screen", then);
    window.setFullScreen(false);
  } else {
    then();
  }
}
