import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, newUserData, startStubMeet } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let userData: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  meet = await startStubMeet();
  userData = newUserData();
  app = await launchApp(meet.origin, userData);
  await app.firstWindow();
});

test.afterEach(async () => {
  await app.close();
  meet.close();
});

/**
 * Opens the settings window through the app menu's Settings item.
 */
async function openSettings(): Promise<Page> {
  const opened = app.waitForEvent("window");
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("settings")?.click());

  const settings = await opened;
  await expect(settings.getByRole("group", { name: "Mute" })).toBeVisible();

  return settings;
}

function isRegistered(accelerator: string) {
  return app.evaluate(({ globalShortcut }, accelerator) => globalShortcut.isRegistered(accelerator), accelerator);
}

/**
 * Reads the stacking, visibility and bounds of the window showing `origin`, which picks out the Meeting Window or
 * the settings window.
 */
function windowState(origin: string) {
  return app.evaluate(({ BrowserWindow }, origin) => {
    const window = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith(origin));
    return window && { onTop: window.isAlwaysOnTop(), visible: window.isVisible(), bounds: window.getBounds() };
  }, origin);
}

async function isMeetingWindowOnTop() {
  return (await windowState(meet.origin))?.onTop;
}

async function record(settings: Page, hotkey: string, keys: string) {
  await settings.getByRole("group", { name: hotkey }).getByRole("button", { name: "Record" }).click();
  await expect(settings.getByRole("group", { name: hotkey })).toContainText("Press a combination");

  await settings.keyboard.press(keys);
}

/**
 * Makes the given combination fail to register, as if another app owned it.
 */
function takenByAnotherApp(accelerator: string) {
  return app.evaluate(({ globalShortcut }, taken) => {
    const register = globalShortcut.register.bind(globalShortcut);
    globalShortcut.register = (accelerator, callback) => accelerator !== taken && register(accelerator, callback);
  }, accelerator);
}

test("the app menu's Settings item opens the settings window with Cmd+,", async () => {
  const item = await app.evaluate(({ Menu }) => {
    const settings = Menu.getApplicationMenu()?.getMenuItemById("settings");
    return { label: settings?.label, accelerator: settings?.accelerator };
  });
  expect(item).toEqual({ label: "Settings…", accelerator: "CommandOrControl+," });

  const settings = await openSettings();

  await expect(settings).toHaveTitle("Settings");
});

test("the settings window shows each hotkey's combination", async () => {
  const settings = await openSettings();

  await expect(settings.getByRole("group", { name: "Mute" })).toContainText("⌃⌥M");
  await expect(settings.getByRole("group", { name: "Camera" })).toContainText("⌃⌥C");
  await expect(settings.getByRole("group", { name: "Raise hand" })).toContainText("⌃⌥H");
  await expect(settings.getByRole("group", { name: "Show window" })).toContainText("⌃⌥S");
  await expect(settings.getByRole("group", { name: "Leave call" })).toContainText("⌃⌥L");
});

test("recording a new combination rebinds the hotkey straight away", async () => {
  const settings = await openSettings();

  await record(settings, "Mute", "Control+Shift+K");

  await expect(settings.getByRole("group", { name: "Mute" })).toContainText("⌃⇧K");

  expect(await isRegistered("Control+Shift+K")).toBe(true);
  expect(await isRegistered("Control+Alt+M")).toBe(false);
});

test("hotkeys are paused while recording", async () => {
  const settings = await openSettings();

  await settings.getByRole("group", { name: "Mute" }).getByRole("button", { name: "Record" }).click();

  await expect.poll(() => isRegistered("Control+Alt+M")).toBe(false);
});

test("changing another setting while recording keeps the hotkeys paused", async () => {
  const settings = await openSettings();
  await settings.getByRole("group", { name: "Mute" }).getByRole("button", { name: "Record" }).click();
  await expect.poll(() => isRegistered("Control+Alt+M")).toBe(false);

  await settings.getByRole("checkbox", { name: "Keep window on top" }).check();
  await expect.poll(isMeetingWindowOnTop).toBe(true);

  expect(await isRegistered("Control+Alt+M")).toBe(false);
});

test("Escape cancels recording and keeps the old combination", async () => {
  const settings = await openSettings();

  await record(settings, "Mute", "Escape");

  await expect(settings.getByRole("group", { name: "Mute" })).toContainText("⌃⌥M");
  expect(await isRegistered("Control+Alt+M")).toBe(true);
});

test("closing the settings window while recording resumes the hotkeys", async () => {
  const settings = await openSettings();
  await settings.getByRole("group", { name: "Mute" }).getByRole("button", { name: "Record" }).click();
  await expect.poll(() => isRegistered("Control+Alt+M")).toBe(false);

  await settings.close();

  await expect.poll(() => isRegistered("Control+Alt+M")).toBe(true);
});

test("turning a hotkey off unregisters it", async () => {
  const settings = await openSettings();

  await settings.getByRole("group", { name: "Camera" }).getByRole("button", { name: "Turn off" }).click();

  await expect(settings.getByRole("group", { name: "Camera" })).toContainText("Off");
  expect(await isRegistered("Control+Alt+C")).toBe(false);
});

test("a combination another app owns is refused with an error naming the hotkey, keeping the old one", async () => {
  const settings = await openSettings();
  await takenByAnotherApp("Control+Shift+K");

  await record(settings, "Mute", "Control+Shift+K");

  await expect(settings.getByRole("group", { name: "Mute" }).getByRole("alert")).toHaveText(
    "Mute couldn't use ⌃⇧K because another app already does. Record a different combination.",
  );
  await expect(settings.getByRole("group", { name: "Mute" })).toContainText("⌃⌥M");

  expect(await isRegistered("Control+Alt+M")).toBe(true);
});

test("recording another combination clears the error", async () => {
  const settings = await openSettings();
  await takenByAnotherApp("Control+Shift+K");
  await record(settings, "Mute", "Control+Shift+K");
  await expect(settings.getByRole("group", { name: "Mute" }).getByRole("alert")).toBeVisible();

  await record(settings, "Mute", "Control+Shift+J");

  await expect(settings.getByRole("group", { name: "Mute" }).getByRole("alert")).toHaveCount(0);
  expect(await isRegistered("Control+Shift+J")).toBe(true);
});

test("a combination another hotkey uses is refused", async () => {
  const settings = await openSettings();

  await record(settings, "Mute", "Control+Alt+C");

  await expect(settings.getByRole("group", { name: "Mute" }).getByRole("alert")).toHaveText(
    "Mute couldn't use ⌃⌥C because Camera already does. Record a different combination.",
  );
  await expect(settings.getByRole("group", { name: "Mute" })).toContainText("⌃⌥M");

  expect(await isRegistered("Control+Alt+M")).toBe(true);
  expect(await isRegistered("Control+Alt+C")).toBe(true);
});

test("hotkey changes survive a relaunch", async () => {
  const settings = await openSettings();
  await record(settings, "Mute", "Control+Shift+K");
  await settings.getByRole("group", { name: "Leave call" }).getByRole("button", { name: "Turn off" }).click();
  await expect(settings.getByRole("group", { name: "Leave call" })).toContainText("Off");

  await app.close();
  app = await launchApp(meet.origin, userData);
  await app.firstWindow();

  expect(await isRegistered("Control+Shift+K")).toBe(true);
  expect(await isRegistered("Control+Alt+M")).toBe(false);
  expect(await isRegistered("Control+Alt+L")).toBe(false);

  const reopened = await openSettings();
  await expect(reopened.getByRole("group", { name: "Mute" })).toContainText("⌃⇧K");
});

test("the launch at login option adds the app to and removes it from login items", async () => {
  await app.evaluate(({ app }) => {
    let openAtLogin = false;
    app.getLoginItemSettings = () => ({ openAtLogin }) as Electron.LoginItemSettings;
    app.setLoginItemSettings = (settings) => {
      openAtLogin = settings.openAtLogin ?? false;
    };
  });
  const openAtLogin = () => app.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin);

  const settings = await openSettings();
  const option = settings.getByRole("checkbox", { name: "Launch at login" });

  await option.check();

  await expect.poll(openAtLogin).toBe(true);

  await option.uncheck();

  await expect.poll(openAtLogin).toBe(false);
});

test("the keep window on top option is off by default", async () => {
  const settings = await openSettings();

  await expect(settings.getByRole("checkbox", { name: "Keep window on top" })).not.toBeChecked();

  expect(await isMeetingWindowOnTop()).toBe(false);
});

test("ticking keep window on top puts the Meeting Window on top straight away, and unticking takes it off", async () => {
  const settings = await openSettings();
  const option = settings.getByRole("checkbox", { name: "Keep window on top" });

  await option.check();

  await expect.poll(isMeetingWindowOnTop).toBe(true);

  await option.uncheck();

  await expect.poll(isMeetingWindowOnTop).toBe(false);
});

test("keep window on top survives a relaunch", async () => {
  const settings = await openSettings();
  await settings.getByRole("checkbox", { name: "Keep window on top" }).check();
  await expect.poll(isMeetingWindowOnTop).toBe(true);

  await app.close();
  app = await launchApp(meet.origin, userData);
  await app.firstWindow();

  expect(await isMeetingWindowOnTop()).toBe(true);

  const reopened = await openSettings();
  await expect(reopened.getByRole("checkbox", { name: "Keep window on top" })).toBeChecked();
});

test("keep window on top leaves the Meeting Window's size and position alone", async () => {
  const before = (await windowState(meet.origin))?.bounds;
  const settings = await openSettings();
  const option = settings.getByRole("checkbox", { name: "Keep window on top" });

  await option.check();
  await expect.poll(isMeetingWindowOnTop).toBe(true);

  expect((await windowState(meet.origin))?.bounds).toEqual(before);

  await option.uncheck();
  await expect.poll(isMeetingWindowOnTop).toBe(false);

  expect((await windowState(meet.origin))?.bounds).toEqual(before);
});

test("with keep window on top, closing hides the Meeting Window and the show window Command brings it back on top", async () => {
  const settings = await openSettings();
  await settings.getByRole("checkbox", { name: "Keep window on top" }).check();
  await expect.poll(isMeetingWindowOnTop).toBe(true);

  await app.evaluate(({ BrowserWindow }, origin) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().startsWith(origin))
      ?.close();
  }, meet.origin);

  await expect.poll(async () => (await windowState(meet.origin))?.visible).toBe(false);

  await app.evaluate(() => globalThis.meetingController?.command({ type: "show-window" }));

  expect(await windowState(meet.origin)).toMatchObject({ visible: true, onTop: true });
});

test("the settings window floats so a Meeting Window kept on top can't cover it", async () => {
  const settings = await openSettings();

  await settings.getByRole("checkbox", { name: "Keep window on top" }).check();
  await expect.poll(isMeetingWindowOnTop).toBe(true);

  expect((await windowState("data:"))?.onTop).toBe(true);
});
