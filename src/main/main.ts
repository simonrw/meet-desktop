import { app } from "electron";

import { setAppMenu } from "./app-menu";
import { connectMeetBridge } from "./meet-bridge";
import { createMeetingController, type MeetingController } from "./meeting-controller";
import { createMeetingWindow } from "./meeting-window";
import { startSettings } from "./settings";

declare global {
  // Lets end-to-end tests read the Meeting State and send Commands. Set in unpackaged builds only.
  var meetingController: MeetingController | undefined;
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

    const settingsWindow = startSettings((command) => meetingController.command(command));
    setAppMenu(() => settingsWindow.open());

    if (!app.isPackaged) {
      globalThis.meetingController = meetingController;
    }

    app.on("activate", () => meetingWindow.show());
    app.on("second-instance", () => meetingWindow.show());
  });
}
