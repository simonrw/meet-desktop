import { app } from "electron";

import { setAppMenu } from "./app-menu";
import { startJoinPrompt } from "./join-prompt";
import { connectMeetBridge } from "./meet-bridge";
import { createMeetingController, type Command, type MeetingController } from "./meeting-controller";
import { parseMeetingCode, URL_SCHEME } from "./meeting-link";
import { createMeetingWindow } from "./meeting-window";
import { startMenuBar, type MenuBar } from "./menu-bar";
import { startSettings } from "./settings";

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
    const meetingWindow = createMeetingWindow(unpackagedOverride("MEET_DESKTOP_MEET_ORIGIN") ?? MEET_ORIGIN, () =>
      meetingController.command({ type: "close-window" }),
    );

    const meetBridge = connectMeetBridge(meetingWindow.webContents, (signal) => meetingController.signal(signal));
    const meetingController = createMeetingController({ meetBridge, meetingWindow });

    const sendCommand = (command: Command) => meetingController.command(command);

    const settingsWindow = startSettings(meetingWindow, sendCommand);

    // Only now, so the window first appears with the saved settings applied, already on top if the user asked.
    meetingWindow.show();

    const joinPrompt = startJoinPrompt(sendCommand);
    const windows = { openSettings: () => settingsWindow.open(), openJoinPrompt: () => joinPrompt.open() };

    setAppMenu(windows);
    const menuBar = startMenuBar(meetingController, windows);

    openUrl = (url) => {
      const code = parseMeetingCode(url);
      if (code !== undefined) {
        sendCommand({ type: "join-meeting", code });
      }
    };
    earlyUrls.forEach(openUrl);

    if (!app.isPackaged) {
      globalThis.meetingController = meetingController;
      globalThis.menuBar = menuBar;
    }

    app.on("activate", () => meetingWindow.show());
    app.on("second-instance", () => meetingWindow.show());
  });
}
