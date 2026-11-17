import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, newUserData, shortcutsRun, startStubMeet } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let userData: string;
let app: ElectronApplication;
let page: Page;

/**
 * Launches the app with the given Focus settings saved from an earlier launch.
 */
async function launchWithFocus(focus: { enabled: boolean; turnOnShortcut?: string; turnOffShortcut?: string }) {
  writeFileSync(join(userData, "settings.json"), JSON.stringify({ focus }));

  app = await launchApp(meet.origin, userData);
  page = await app.firstWindow();
}

test.beforeEach(async () => {
  meet = await startStubMeet();
  userData = newUserData();
});

test.afterEach(async () => {
  await app.close();
  meet.close();
});

function meetingState() {
  return app.evaluate(() => globalThis.meetingController?.state?.status);
}

function menuBarLabels() {
  return app.evaluate(() => globalThis.menuBar?.menu.items.map((item) => item.label));
}

async function joinCall() {
  await page.getByRole("button", { name: "New meeting" }).click();
  await expect.poll(meetingState).toBe("lobby");

  await page.getByRole("button", { name: "Join now" }).click();
  await expect.poll(meetingState).toBe("in-call");
}

test("entering a call runs the turn on Shortcut, not before, and quitting runs the turn off Shortcut", async () => {
  await launchWithFocus({ enabled: true });

  await page.getByRole("button", { name: "New meeting" }).click();
  await expect.poll(meetingState).toBe("lobby");
  expect(shortcutsRun(userData)).toEqual([]);

  await page.getByRole("button", { name: "Join now" }).click();
  await expect.poll(() => shortcutsRun(userData)).toEqual(["run Turn On Meeting Focus"]);

  await app.close();
  expect(shortcutsRun(userData)).toEqual(["run Turn On Meeting Focus", "run Turn Off Meeting Focus"]);
});

test("with the Focus Integration off, a call runs no Shortcuts", async () => {
  await launchWithFocus({ enabled: false });

  await joinCall();
  await app.close();

  expect(shortcutsRun(userData)).toEqual([]);
});

test("after the app is killed mid-call, the next launch runs the turn off Shortcut", async () => {
  await launchWithFocus({ enabled: true, turnOnShortcut: "Focus On", turnOffShortcut: "Focus Off" });
  await joinCall();
  await expect.poll(() => shortcutsRun(userData)).toEqual(["run Focus On"]);

  app.process().kill("SIGKILL");
  await app.waitForEvent("close");
  app = await launchApp(meet.origin, userData);

  await expect.poll(() => shortcutsRun(userData)).toEqual(["run Focus On", "run Focus Off"]);
});

test("a failing Shortcut shows in the menu bar menu and the call carries on", async () => {
  await launchWithFocus({ enabled: true, turnOnShortcut: "Missing Focus" });

  await joinCall();

  await expect
    .poll(menuBarLabels)
    .toContain("Focus wasn't turned on: Shortcut “Missing Focus” failed: The operation couldn’t be completed. Couldn’t find shortcut");
  expect(await meetingState()).toBe("in-call");
});

test.describe("the settings window's Focus section", () => {
  async function openSettings(): Promise<Page> {
    const opened = app.waitForEvent("window");
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("settings")?.click());

    const settings = await opened;
    await expect(settings.getByRole("checkbox", { name: "Turn on a Focus during calls" })).toBeVisible();

    return settings;
  }

  test("explains how to create the Shortcuts", async () => {
    await launchWithFocus({ enabled: false });

    const settings = await openSettings();

    await expect(settings.getByText('create a shortcut with the "Set Focus" action')).toBeVisible();
  });

  test("turns the Focus Integration on with the Shortcut names given", async () => {
    await launchWithFocus({ enabled: false });
    const settings = await openSettings();

    await settings.getByRole("checkbox", { name: "Turn on a Focus during calls" }).check();
    await settings.getByRole("textbox", { name: "Turn on Shortcut" }).fill("Deep Work On");
    await settings.getByRole("textbox", { name: "Turn on Shortcut" }).press("Tab");
    await expect(settings.getByRole("textbox", { name: "Turn on Shortcut" })).toHaveValue("Deep Work On");

    await joinCall();

    await expect.poll(() => shortcutsRun(userData)).toEqual(["run Deep Work On"]);
  });

  test("turns the Focus Integration off", async () => {
    await launchWithFocus({ enabled: true });
    const settings = await openSettings();

    await settings.getByRole("checkbox", { name: "Turn on a Focus during calls" }).uncheck();
    await expect(settings.getByRole("checkbox", { name: "Turn on a Focus during calls" })).not.toBeChecked();

    await joinCall();
    await app.close();

    expect(shortcutsRun(userData)).toEqual([]);
  });

  test("tests the Shortcuts, reporting success", async () => {
    await launchWithFocus({ enabled: false });
    const settings = await openSettings();

    await settings.getByRole("button", { name: "Test" }).click();

    await expect(settings.getByRole("status")).toHaveText("Both Shortcuts ran: the Focus turned on and then off.");
    expect(shortcutsRun(userData)).toEqual(["run Turn On Meeting Focus", "run Turn Off Meeting Focus"]);
  });

  test("tests the Shortcuts, reporting failure", async () => {
    await launchWithFocus({ enabled: false, turnOffShortcut: "Missing Focus Off" });
    const settings = await openSettings();

    await settings.getByRole("button", { name: "Test" }).click();

    await expect(settings.getByRole("alert")).toHaveText(
      "Shortcut “Missing Focus Off” failed: The operation couldn’t be completed. Couldn’t find shortcut",
    );
  });
});
