import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, onMeetingWindow, startStubMeet } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  meet = await startStubMeet();
  app = await launchApp(meet.origin);
  page = await app.firstWindow();
});

test.afterEach(async () => {
  await app.close();
  meet.close();
});

function menuBarIcon() {
  return app.evaluate(() => globalThis.menuBar?.icon);
}

function enabledItems() {
  return app.evaluate(() =>
    globalThis.menuBar?.menu.items.filter((item) => item.type !== "separator" && item.enabled).map((item) => item.id),
  );
}

function click(id: string) {
  return app.evaluate((_electron, id) => globalThis.menuBar?.menu.getMenuItemById(id)?.click(), id);
}

function meetingWindowVisible() {
  return onMeetingWindow(app, "isVisible");
}

async function joinCall() {
  await page.getByRole("button", { name: "New meeting" }).click();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(menuBarIcon).toBe("in-call");
}

test("the icon follows the Meet page into a call, through mute and unmute, and out", async () => {
  await expect.poll(menuBarIcon).toBe("not-in-call");

  await page.getByRole("button", { name: "New meeting" }).click();
  await expect.poll(menuBarIcon).toBe("not-in-call");

  await page.getByRole("button", { name: "Join now" }).click();
  await expect.poll(menuBarIcon).toBe("in-call");

  await page.getByRole("button", { name: "Turn off microphone" }).click();
  await expect.poll(menuBarIcon).toBe("muted");

  await page.getByRole("button", { name: "Turn on microphone" }).click();
  await expect.poll(menuBarIcon).toBe("in-call");

  await page.getByRole("button", { name: "Leave call" }).click();
  await expect.poll(menuBarIcon).toBe("not-in-call");
});

test("call-only items are enabled only during a call", async () => {
  await expect.poll(enabledItems).toEqual(["show-window", "toggle-mini-mode", "join-meeting", "settings", "quit"]);

  await joinCall();
  await expect
    .poll(enabledItems)
    .toEqual(["toggle-mute", "toggle-camera", "show-window", "toggle-mini-mode", "leave-call", "join-meeting", "settings", "quit"]);

  await page.getByRole("button", { name: "Leave call" }).click();
  await expect.poll(enabledItems).toEqual(["show-window", "toggle-mini-mode", "join-meeting", "settings", "quit"]);
});

test("the mute item mutes Meet and the icon shows it", async () => {
  await joinCall();

  await click("toggle-mute");

  await expect(page.locator("#microphone")).toHaveAttribute("data-is-muted", "true");
  await expect.poll(menuBarIcon).toBe("muted");
});

test("the camera item toggles Meet's camera", async () => {
  await joinCall();

  await click("toggle-camera");

  await expect(page.locator("#camera")).toHaveAttribute("data-is-muted", "false");
});

test("the show window item brings back a hidden Meeting Window", async () => {
  await onMeetingWindow(app, "hide");

  await click("show-window");

  await expect.poll(meetingWindowVisible).toBe(true);
});

test("the leave call item asks before leaving", async () => {
  // A real dialog would block the test until someone answered it.
  const asked = app.evaluate(
    ({ dialog }) =>
      new Promise<void>((resolve) => {
        dialog.showMessageBox = async () => {
          resolve();
          return { response: 0, checkboxChecked: false };
        };
      }),
  );

  await joinCall();

  await click("leave-call");

  await asked;
  await expect(page.getByRole("heading", { name: "You left the meeting" })).toBeVisible();
  await expect.poll(menuBarIcon).toBe("not-in-call");
});

test("the settings item opens the settings window", async () => {
  const opened = app.waitForEvent("window");

  await click("settings");

  const settings = await opened;
  await expect(settings.getByRole("group", { name: "Mute" })).toBeVisible();
});

test("the quit item quits the app", async () => {
  const closed = app.waitForEvent("close");

  await click("quit");

  await closed;
});
