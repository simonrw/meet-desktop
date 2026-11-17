import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, startStubMeet } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  meet = await startStubMeet();
  app = await launchApp(meet.origin);
  page = await app.firstWindow();

  // The prompt reads the clipboard, and the tests must neither read nor overwrite the real one.
  await onClipboard("");
});

test.afterEach(async () => {
  await app.close();
  meet.close();
});

function onClipboard(text: string) {
  return app.evaluate(({ clipboard }, text) => {
    clipboard.readText = async () => text;
  }, text);
}

/**
 * Opens the join prompt through the given menu item and waits for it to show.
 */
async function openJoinPrompt(open: () => Promise<unknown>): Promise<Page> {
  const opened = app.waitForEvent("window");
  await open();

  const prompt = await opened;
  await expect(prompt.getByRole("textbox", { name: "Meet link or code" })).toBeVisible();

  return prompt;
}

function fromMenuBar() {
  return openJoinPrompt(() =>
    app.evaluate(() => globalThis.menuBar?.menu.getMenuItemById("join-meeting")?.click()),
  );
}

function fromAppMenu() {
  return openJoinPrompt(() =>
    app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("join-meeting")?.click()),
  );
}

async function press(prompt: Page, key: string) {
  // Joining or cancelling closes the prompt part way through the key press.
  await prompt.keyboard.press(key).catch(() => expect(prompt.isClosed()).toBe(true));
}

async function join(prompt: Page, input: string) {
  await prompt.getByRole("textbox", { name: "Meet link or code" }).fill(input);
  await press(prompt, "Enter");
}

function meetingWindowVisible() {
  return app.evaluate(({ webContents, BaseWindow }) => {
    const meeting = webContents.getAllWebContents().find((contents) => contents.getTitle() === "Stub Meet");
    return BaseWindow.getAllWindows().some(
      (window) => window.isVisible() && (window.contentView as Electron.WebContentsView).webContents === meeting,
    );
  });
}

function windowCount() {
  return app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows().length);
}

/**
 * Answers the next question the app asks with the button at `response`.
 */
function answerNextQuestion(response: number) {
  // A real dialog would block the test until someone answered it.
  return app.evaluate(
    ({ dialog }, response) =>
      new Promise<string>((resolve) => {
        dialog.showMessageBox = async (_window: unknown, options?: { message: string }) => {
          resolve(options?.message ?? "");
          return { response, checkboxChecked: false };
        };
      }),
    response,
  );
}

async function joinCall() {
  await page.getByRole("button", { name: "New meeting" }).click();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(() => app.evaluate(() => globalThis.meetingController?.state.status)).toBe("in-call");
}

test("the menu bar's Join Meeting item opens the join prompt", async () => {
  await fromMenuBar();
});

test("the app menu's Join Meeting item opens the join prompt with Cmd+J", async () => {
  const item = await app.evaluate(({ Menu }) => {
    const join = Menu.getApplicationMenu()?.getMenuItemById("join-meeting");
    return { label: join?.label, accelerator: join?.accelerator };
  });
  expect(item).toEqual({ label: "Join Meeting…", accelerator: "CommandOrControl+J" });

  await fromAppMenu();
});

test("a meeting code opens that meeting's pre-join screen and closes the prompt", async () => {
  const prompt = await fromMenuBar();

  await join(prompt, "abc-defg-hij");

  await expect(page).toHaveURL(`${meet.origin}/abc-defg-hij`);
  await expect(page.getByRole("heading", { name: "Ready to join?" })).toBeVisible();
  await expect.poll(windowCount).toBe(1);
});

test("a Meet link opens that meeting's pre-join screen", async () => {
  const prompt = await fromMenuBar();

  await join(prompt, "https://meet.google.com/abc-defg-hij?authuser=1");

  await expect(page).toHaveURL(`${meet.origin}/abc-defg-hij`);
});

test("joining brings back a hidden Meeting Window", async () => {
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0]?.hide());
  const prompt = await fromMenuBar();

  await join(prompt, "abc-defg-hij");

  await expect.poll(meetingWindowVisible).toBe(true);
});

test("a Meet link on the clipboard is prefilled so that Return joins it", async () => {
  await onClipboard("https://meet.google.com/abc-defg-hij");

  const prompt = await fromMenuBar();
  await expect(prompt.getByRole("textbox", { name: "Meet link or code" })).toHaveValue("abc-defg-hij");

  await press(prompt, "Enter");
  await expect(page).toHaveURL(`${meet.origin}/abc-defg-hij`);
});

test("anything else on the clipboard is ignored", async () => {
  await onClipboard("see you at https://example.com/abc-defg-hij");

  const prompt = await fromMenuBar();

  await expect(prompt.getByRole("textbox", { name: "Meet link or code" })).toHaveValue("");
});

test("invalid input shows an inline error and doesn't navigate", async () => {
  const prompt = await fromMenuBar();

  await join(prompt, "not a meeting");

  await expect(prompt.getByRole("alert")).toContainText("Enter a Meet link or a meeting code");
  await expect(page).toHaveURL(`${meet.origin}/`);
  expect(await windowCount()).toBe(2);
});

test("Escape closes the prompt without navigating", async () => {
  const prompt = await fromMenuBar();

  await press(prompt, "Escape");

  await expect.poll(windowCount).toBe(1);
  await expect(page).toHaveURL(`${meet.origin}/`);
});

test("joining during a call asks first, and stays in the call when the user cancels", async () => {
  await joinCall();
  const asked = answerNextQuestion(1);
  const prompt = await fromMenuBar();

  await join(prompt, "abc-defg-hij");

  expect(await asked).toContain("abc-defg-hij");
  await expect(page.getByRole("heading", { name: "In call" })).toBeVisible();
  await expect(page).toHaveURL(`${meet.origin}/`);
});

test("joining during a call switches meetings once the user confirms", async () => {
  await joinCall();
  const asked = answerNextQuestion(0);
  const prompt = await fromMenuBar();

  await join(prompt, "abc-defg-hij");

  await asked;
  await expect(page).toHaveURL(`${meet.origin}/abc-defg-hij`);
  await expect(page.getByRole("heading", { name: "Ready to join?" })).toBeVisible();
});

test("opening a meet-desktop URL opens the meeting in a hidden Meeting Window", async () => {
  await app.evaluate(({ BaseWindow }) => BaseWindow.getAllWindows()[0]?.hide());

  await app.evaluate(({ app }) => app.emit("open-url", { preventDefault() {} }, "meet-desktop://abc-defg-hij"));

  await expect(page).toHaveURL(`${meet.origin}/abc-defg-hij`);
  await expect.poll(meetingWindowVisible).toBe(true);
});
