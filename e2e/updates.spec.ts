import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, newUserData, shortcutsRun, startStubMeet, updatesInstalled, type LatestRelease } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let userData: string;
let app: ElectronApplication;
let page: Page;
let logs: string[];

async function launch(latestRelease?: LatestRelease) {
  app = await launchApp(meet.origin, userData, latestRelease);
  logs = [];
  app.on("console", (message) => logs.push(message.text()));
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

const runningVersion: string = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version;

function menuBarIds() {
  return app.evaluate(() => globalThis.menuBar?.menu.items.map((item) => item.id));
}

function restartItem() {
  return app.evaluate(() => {
    const item = globalThis.menuBar?.menu.getMenuItemById("restart-to-update");
    return item && { label: item.label, enabled: item.enabled };
  });
}

function meetingState() {
  return app.evaluate(() => globalThis.meetingController?.state?.status);
}

function restartToUpdate() {
  return app.evaluate(() => globalThis.menuBar?.menu.getMenuItemById("restart-to-update")?.click());
}

function lastWritten(log: "shortcuts.log" | "installed-updates.log") {
  return statSync(join(userData, log)).mtimeMs;
}

async function joinCall() {
  await page.getByRole("button", { name: "New meeting" }).click();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(meetingState).toBe("in-call");
}

async function leaveCall() {
  await page.getByRole("button", { name: "Leave call" }).click();

  await expect.poll(meetingState).toBe("idle");
}

test("with a newer Release, the menu bar menu offers to restart to update to it", async () => {
  await launch({ version: "99.0.0" });

  await expect.poll(restartItem).toEqual({ label: "Restart to Update (99.0.0)", enabled: true });
});

test("with no newer Release, the menu bar menu has no restart to update item", async () => {
  await launch({ version: runningVersion });

  await expect.poll(menuBarIds).toContain("quit");
  expect(await menuBarIds()).not.toContain("restart-to-update");
});

test("the restart to update item is greyed out during a call", async () => {
  await launch({ version: "99.0.0" });
  await expect.poll(restartItem).toMatchObject({ enabled: true });

  await joinCall();
  await expect.poll(restartItem).toMatchObject({ enabled: false });

  await leaveCall();
  await expect.poll(restartItem).toMatchObject({ enabled: true });
});

test("choosing restart to update installs the Update and quits", async () => {
  await launch({ version: "99.0.0" });
  await expect.poll(restartItem).toMatchObject({ enabled: true });
  const closed = app.waitForEvent("close");

  await restartToUpdate();

  await closed;
  expect(updatesInstalled(userData)).toEqual(["99.0.0"]);
});

test("during a call, restart to update does nothing", async () => {
  await launch({ version: "99.0.0" });
  await joinCall();

  await restartToUpdate();

  expect(await meetingState()).toBe("in-call");
  expect(updatesInstalled(userData)).toEqual([]);
});

test("restarting to update just after a call turns the Focus off before installing", async () => {
  writeFileSync(join(userData, "settings.json"), JSON.stringify({ focus: { enabled: true } }));
  await launch({ version: "99.0.0" });
  await joinCall();
  await expect.poll(() => shortcutsRun(userData)).toEqual(["run Turn On Meeting Focus"]);
  await leaveCall();
  const closed = app.waitForEvent("close");

  // The Focus stays on for 30 seconds after a call, so restarting now finds it still on.
  await restartToUpdate();

  await closed;
  expect(updatesInstalled(userData)).toEqual(["99.0.0"]);
  expect(shortcutsRun(userData)).toEqual(["run Turn On Meeting Focus", "run Turn Off Meeting Focus"]);
  expect(lastWritten("installed-updates.log")).toBeGreaterThan(lastWritten("shortcuts.log"));
});

test("with the override, the app checks for Updates at launch", async () => {
  await launch({ version: runningVersion });

  await expect.poll(() => logs).toContain("Checking for Updates");
});

test("without the override, the app never checks for Updates", async () => {
  await launch();

  await expect.poll(menuBarIds).toContain("quit");
  expect(logs).not.toContain("Checking for Updates");
});
