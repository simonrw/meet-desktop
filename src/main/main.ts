import { app } from "electron";

import { setAppMenu } from "./app-menu";
import { connectMeetBridge } from "./meet-bridge";
import { createMeetingController, type MeetingController } from "./meeting-controller";
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
  app.whenReady().then(() => {
    const meetingWindow = createMeetingWindow(unpackagedOverride("MEET_DESKTOP_MEET_ORIGIN") ?? MEET_ORIGIN, () =>
      meetingController.command({ type: "close-window" }),
    );

    const meetBridge = connectMeetBridge(meetingWindow.webContents, (signal) => meetingController.signal(signal));
    const meetingController = createMeetingController({ meetBridge, meetingWindow });

    const settingsWindow = startSettings(meetingWindow, (command) => meetingController.command(command));

    // Only now, so the window first appears with the saved settings applied, already on top if the user asked.
    meetingWindow.show();

    setAppMenu(() => settingsWindow.open());
    const menuBar = startMenuBar(meetingController, () => settingsWindow.open());

    if (!app.isPackaged) {
      globalThis.meetingController = meetingController;
      globalThis.menuBar = menuBar;
    }

    app.on("activate", () => meetingWindow.show());
    app.on("second-instance", () => meetingWindow.show());
  });
}
