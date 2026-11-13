import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import type { Command } from "../src/main/meeting-controller";
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

function send(type: Command["type"]) {
  return app.evaluate((_electron, type) => globalThis.meetingController?.command({ type }), type);
}

/**
 * Answers every leave confirmation from now on, in place of the dialog that would block the test.
 */
function answerLeaveConfirmations(confirmed: boolean) {
  return app.evaluate(({ dialog }, response) => {
    dialog.showMessageBox = async () => ({ response, checkboxChecked: false });
  }, confirmed ? 0 : 1);
}

function meetingWindowVisible() {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible());
}

// The stub starts every meeting with the microphone on, the camera off and the hand down.
function inCall(overrides: { muted?: boolean; cameraOn?: boolean; handRaised?: boolean } = {}) {
  return { status: "in-call", muted: false, cameraOn: false, handRaised: false, ...overrides };
}

async function enterLobby() {
  await page.getByRole("button", { name: "New meeting" }).click();

  await expect.poll(meetingState).toEqual({ status: "lobby" });
}

async function joinCall() {
  await enterLobby();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(meetingState).toEqual(inCall());
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

  await expect.poll(meetingState).toEqual(inCall({ muted: true }));
});

test("muting with Meet's own button is reflected in the Meeting State", async () => {
  await joinCall();

  await page.getByRole("button", { name: "Turn off microphone" }).click();
  await expect.poll(meetingState).toEqual(inCall({ muted: true }));

  await page.getByRole("button", { name: "Turn on microphone" }).click();
  await expect.poll(meetingState).toEqual(inCall());
});

test("the toggle mute Command presses Meet's mute shortcut, even with the Meeting Window hidden", async () => {
  await joinCall();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());

  await send("toggle-mute");

  await expect(page.locator("#microphone")).toHaveAttribute("data-is-muted", "true");
  await expect.poll(meetingState).toEqual(inCall({ muted: true }));
});

test("the toggle mute Command does nothing in the lobby", async () => {
  await enterLobby();

  await send("toggle-mute");
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(meetingState).toEqual(inCall());
});

test("camera changes made inside Meet are reflected in the Meeting State", async () => {
  await joinCall();

  await page.getByRole("button", { name: "Turn on camera" }).click();
  await expect.poll(meetingState).toEqual(inCall({ cameraOn: true }));

  await page.getByRole("button", { name: "Turn off camera" }).click();
  await expect.poll(meetingState).toEqual(inCall({ cameraOn: false }));
});

test("the hand raised and lowered inside Meet is reflected in the Meeting State", async () => {
  await joinCall();

  await page.getByRole("button", { name: "Raise hand" }).click();
  await expect.poll(meetingState).toEqual(inCall({ handRaised: true }));

  await page.getByRole("button", { name: "Lower hand" }).click();
  await expect.poll(meetingState).toEqual(inCall({ handRaised: false }));
});

test("the toggle camera Command presses Meet's camera shortcut", async () => {
  await joinCall();

  await send("toggle-camera");

  await expect(page.locator("#camera")).toHaveAttribute("data-is-muted", "false");
  await expect.poll(meetingState).toEqual(inCall({ cameraOn: true }));
});

test("the toggle hand Command presses Meet's hand shortcut", async () => {
  await joinCall();

  await send("toggle-hand");
  await expect(page.locator("#hand")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(meetingState).toEqual(inCall({ handRaised: true }));

  await send("toggle-hand");
  await expect(page.locator("#hand")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(meetingState).toEqual(inCall({ handRaised: false }));
});

test("the toggle camera Command does nothing in the lobby", async () => {
  await enterLobby();

  await send("toggle-camera");
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(meetingState).toEqual(inCall());
});

test("the show window Command brings back a hidden Meeting Window", async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide());

  await send("show-window");

  await expect.poll(meetingWindowVisible).toBe(true);
});

test("the leave call Command leaves once confirmed", async () => {
  await answerLeaveConfirmations(true);
  await joinCall();

  await send("leave-call");

  await expect(page.getByRole("heading", { name: "You left the meeting" })).toBeVisible();
  await expect.poll(meetingState).toEqual({ status: "idle" });
});

test("the leave call Command keeps the call going when cancelled", async () => {
  await answerLeaveConfirmations(false);
  await joinCall();

  await send("leave-call");
  await send("toggle-hand");

  await expect.poll(meetingState).toEqual(inCall({ handRaised: true }));
});

test("closing the Meeting Window during a call leaves and hides once confirmed", async () => {
  await answerLeaveConfirmations(true);
  await joinCall();

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());

  await expect.poll(meetingState).toEqual({ status: "idle" });
  await expect.poll(meetingWindowVisible).toBe(false);
});

test("closing the Meeting Window during a call keeps it open when cancelled", async () => {
  await answerLeaveConfirmations(false);
  await joinCall();

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await send("toggle-hand");

  await expect.poll(meetingState).toEqual(inCall({ handRaised: true }));
  expect(await meetingWindowVisible()).toBe(true);
});

test("closing the Meeting Window outside a call hides it without asking", async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());

  await expect.poll(meetingWindowVisible).toBe(false);
});
