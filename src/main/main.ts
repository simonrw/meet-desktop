import { join } from "node:path";

import { app } from "electron";

import { setAppMenu } from "./app-menu";
import { focusIntegration, shortcutRunner } from "./focus-integration";
import { fileLedger } from "./integration-ledger";
import { startJoinPrompt } from "./join-prompt";
import { connectMeetBridge } from "./meet-bridge";
import { createMeetingController, type Command, type MeetingController } from "./meeting-controller";
import { parseMeetingLink, URL_SCHEME } from "./meeting-link";
import { createMeetingWindow } from "./meeting-window";
import { startMenuBar, type MenuBar } from "./menu-bar";
import { startSettings } from "./settings";
import type { Settings } from "./settings-store";
import { startUpdates } from "./updates";

declare global {
  // Lets end-to-end tests read the Meeting State and send Commands. Set in unpackaged builds only.
  var meetingController: MeetingController | undefined;

  // Lets end-to-end tests read the menu bar icon and click its menu. Set in unpackaged builds only.
  var menuBar: MenuBar | undefined;
}

const MEET_ORIGIN = "https://meet.google.com";

/**
 * Reads an environment override that only unpackaged (development and test) builds honour.
 */
function unpackagedOverride(name: string): string | undefined {
  return app.isPackaged ? undefined : process.env[name] || undefined;
}

const userDataOverride = unpackagedOverride("MEET_DESKTOP_USER_DATA");
if (userDataOverride) {
  app.setPath("userData", userDataOverride);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // macOS delivers the URL that launched the app before the app is ready to open it.
  const earlyUrls: string[] = [];
  let openUrl = (url: string) => {
    earlyUrls.push(url);
  };

  app.on("open-url", (event, url) => {
    event.preventDefault();
    openUrl(url);
  });

  // Unpackaged builds would register the bare Electron binary, which can't open the app.
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(URL_SCHEME);
  }

  app.whenReady().then(() => {
    const sendCommand = (command: Command) => meetingController.command(command);

    const settingsWindow = startSettings(sendCommand, () => focus.test());
    const meetingWindow = createMeetingWindow(unpackagedOverride("MEET_DESKTOP_MEET_ORIGIN") ?? MEET_ORIGIN, sendCommand);

    const applySettings = (settings: Settings) => {
      meetingWindow.setMiniOpacity(settings.miniModeOpacity);
      meetingWindow.keepOnTop(settings.alwaysOnTop);
    };
    applySettings(settingsWindow.settings);
    settingsWindow.onChange(applySettings);

    // Only now, so the window first appears with the saved settings applied, already on top if the user asked.
    meetingWindow.show();

    const joinPrompt = startJoinPrompt(sendCommand);
    const openers = { openSettings: () => settingsWindow.open(), openJoinPrompt: () => joinPrompt.open() };

    const focus = focusIntegration(
      () => settingsWindow.settings.focus,
      shortcutRunner(unpackagedOverride("MEET_DESKTOP_SHORTCUTS") ?? "shortcuts"),
    );

    const meetBridge = connectMeetBridge(meetingWindow.webContents, (signal) => meetingController.signal(signal));
    const meetingController = createMeetingController({
      meetBridge,
      meetingWindow,
      integrations: [focus],
      ledger: fileLedger(join(app.getPath("userData"), "integration-ledger.json")),
      clock: {
        schedule(delayMs, callback) {
          const timer = setTimeout(callback, delayMs);
          return () => clearTimeout(timer);
        },
      },
      autoMiniMode: () => settingsWindow.settings.autoMiniMode,
    });

    restoreIntegrationsBeforeQuitting(meetingController);

    const updates = startUpdates(meetingController, unpackagedOverride("MEET_DESKTOP_UPDATES"));
    setAppMenu(openers, updates);
    const menuBar = startMenuBar(meetingController, updates, openers);

    openUrl = (url) => {
      const link = parseMeetingLink(url);
      if (link !== undefined) {
        sendCommand({ type: "join-meeting", link });
      }
    };
    earlyUrls.forEach(openUrl);

    if (!app.isPackaged) {
      globalThis.meetingController = meetingController;
      globalThis.menuBar = menuBar;
    }

    app.on("activate", () => meetingWindow.show());
    app.on("did-resign-active", () => meetingController.switchedAway());
    app.on("second-instance", () => meetingWindow.show());
  });
}

/**
 * Holds off quitting until the Meeting Controller has restored the Integrations applied for a call.
 */
function restoreIntegrationsBeforeQuitting(meetingController: MeetingController): void {
  let restored = false;

  app.on("before-quit", (event) => {
    if (restored) {
      return;
    }

    event.preventDefault();
    void meetingController.quit().finally(() => {
      restored = true;
      app.quit();
    });
  });
}
