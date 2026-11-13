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
