import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, startStubMeet } from "./app";

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

function meetingState() {
  return app.evaluate(() => globalThis.meetingController?.state);
}

function sendToggleMute() {
  return app.evaluate(() => globalThis.meetingController?.command({ type: "toggle-mute" }));
}

async function enterLobby() {
  await page.getByRole("button", { name: "New meeting" }).click();

  await expect.poll(meetingState).toEqual({ status: "lobby" });
}

async function joinCall() {
  await enterLobby();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(meetingState).toEqual({ status: "in-call", muted: false });
}

test("Meeting State follows the Meet page from home through the lobby into a call and out", async () => {
  await expect.poll(meetingState).toEqual({ status: "idle" });

  await joinCall();

  await page.getByRole("button", { name: "Leave call" }).click();
  await expect.poll(meetingState).toEqual({ status: "idle" });
});

test("a call rejoined without a lobby keeps the mute shown on the page", async () => {
  await joinCall();
  await page.getByRole("button", { name: "Turn off microphone" }).click();
  await page.getByRole("button", { name: "Leave call" }).click();
  await expect.poll(meetingState).toEqual({ status: "idle" });

  await page.getByRole("button", { name: "Rejoin" }).click();

  await expect.poll(meetingState).toEqual({ status: "in-call", muted: true });
});

test("muting with Meet's own button is reflected in the Meeting State", async () => {
  await joinCall();

  await page.getByRole("button", { name: "Turn off microphone" }).click();
  await expect.poll(meetingState).toEqual({ status: "in-call", muted: true });

  await page.getByRole("button", { name: "Turn on microphone" }).click();
  await expect.poll(meetingState).toEqual({ status: "in-call", muted: false });
});

test("the toggle mute Command presses Meet's mute shortcut, even with the Meeting Window hidden", async () => {
  await joinCall();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());

  await sendToggleMute();

  await expect(page.locator("#microphone")).toHaveAttribute("data-is-muted", "true");
  await expect.poll(meetingState).toEqual({ status: "in-call", muted: true });
});

test("the toggle mute Command does nothing in the lobby", async () => {
  await enterLobby();

  await sendToggleMute();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(meetingState).toEqual({ status: "in-call", muted: false });
});
