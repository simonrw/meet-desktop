import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, newUserData, onMeetingWindow, startStubMeet } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let userData: string;
let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  meet = await startStubMeet();
  userData = newUserData();
  app = await launchApp(meet.origin, userData);
  page = await app.firstWindow();
});

test.afterEach(async () => {
  await app.close();
  meet.close();
});

/**
 * Describes each Meeting Window on screen: the Full window, the mini window, or (while switching) both.
 */
function shownWindows() {
  return app.evaluate(({ BaseWindow, BrowserWindow }) =>
    BaseWindow.getAllWindows()
      .filter((window) => window.isVisible() && !(window instanceof BrowserWindow))
      .map((window) => {
        const bounds = window.getBounds();
        const content = window.getContentBounds();

        return {
          framed: bounds.height !== content.height,
          alwaysOnTop: window.isAlwaysOnTop(),
          onEveryWorkspace: window.isVisibleOnAllWorkspaces(),
          resizable: window.isResizable(),
          opacity: Math.round(window.getOpacity() * 100) / 100,
          bounds,
        };
      }),
  );
}

const FULL = { framed: true, alwaysOnTop: false, opacity: 1 };
const MINI = { framed: false, alwaysOnTop: true, onEveryWorkspace: true, resizable: true };

async function expectPresentation(presentation: typeof FULL | typeof MINI) {
  await expect.poll(shownWindows).toEqual([expect.objectContaining(presentation)]);
}

function clickMenuBarItem(id: string) {
  return app.evaluate((_electron, id) => globalThis.menuBar?.menu.getMenuItemById(id)?.click(), id);
}

async function toggleMiniMode(presentation: typeof FULL | typeof MINI) {
  await clickMenuBarItem("toggle-mini-mode");
  await expectPresentation(presentation);
}

function setShownWindowBounds(bounds: { x: number; y: number; width: number; height: number }) {
  return app.evaluate(({ BaseWindow, BrowserWindow }, bounds) => {
    const shown = BaseWindow.getAllWindows().find((window) => window.isVisible() && !(window instanceof BrowserWindow));
    shown?.setBounds(bounds);
  }, bounds);
}

async function shownBounds() {
  const [window] = await shownWindows();
  return window?.bounds;
}

/**
 * Finds the mini window's handle, the strip along its top edge for dragging it about. It opens as a page of its own
 * the first time the window enters Mini Mode.
 */
async function miniWindowHandle(): Promise<Page> {
  let handle: Page | undefined;

  await expect
    .poll(async () => {
      for (const window of app.windows()) {
        if ((await window.title()) === "Mini Mode handle") {
          handle = window;
        }
      }

      return handle !== undefined;
    })
    .toBe(true);

  return handle!;
}

async function joinCall() {
  await page.getByRole("button", { name: "New meeting" }).click();
  await page.getByRole("button", { name: "Join now" }).click();

  await expect.poll(() => app.evaluate(() => globalThis.meetingController?.state.status)).toBe("in-call");
}

function agreeToEveryQuestion() {
  // A real dialog would block the test until someone answered it.
  return app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  });
}

function switchToAnotherApp() {
  return app.evaluate(({ app }) => app.emit("did-resign-active"));
}

async function openSettings(): Promise<Page> {
  const opened = app.waitForEvent("window");
  await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById("settings")?.click());

  const settings = await opened;
  await expect(settings.getByRole("group", { name: "Mini Mode" })).toBeVisible();

  return settings;
}

function isRegistered(accelerator: string) {
  return app.evaluate(({ globalShortcut }, accelerator) => globalShortcut.isRegistered(accelerator), accelerator);
}

test("the menu bar item switches between Full and a frameless mini window floating on every Space", async () => {
  await expectPresentation(FULL);

  await toggleMiniMode(MINI);

  await toggleMiniMode(FULL);
});

test("the app stays a regular app after entering Mini Mode", async () => {
  await toggleMiniMode(MINI);

  // A regular app is what has a Dock icon, an app switcher entry and menus.
  expect(await app.evaluate(({ app }) => app.dock?.isVisible())).toBe(true);
});

test("the Meet page carries on in Mini Mode without reloading", async () => {
  await joinCall();

  await toggleMiniMode(MINI);
  await page.getByRole("button", { name: "Turn off microphone" }).click();

  await expect(page.locator("#microphone")).toHaveAttribute("data-is-muted", "true");
  await expect(page.getByRole("heading", { name: "In call" })).toBeVisible();
});

test("Full and Mini Mode each restore their own size and position", async () => {
  const full = await shownBounds();

  await toggleMiniMode(MINI);
  const mini = { x: 200, y: 150, width: 360, height: 220 };
  await setShownWindowBounds(mini);

  await toggleMiniMode(FULL);
  expect(await shownBounds()).toEqual(full);

  await toggleMiniMode(MINI);
  expect(await shownBounds()).toEqual(mini);
});

test("the mini window's size and position survive a relaunch", async () => {
  await toggleMiniMode(MINI);
  const mini = { x: 220, y: 160, width: 380, height: 230 };
  await setShownWindowBounds(mini);
  await toggleMiniMode(FULL);

  await app.close();
  app = await launchApp(meet.origin, userData);
  await app.firstWindow();

  await toggleMiniMode(MINI);
  expect(await shownBounds()).toEqual(mini);
});

test("double-clicking the mini window returns to Full", async () => {
  await toggleMiniMode(MINI);
  const handle = await miniWindowHandle();

  await handle.locator("body").dblclick();

  await expectPresentation(FULL);
});

test("the window returns to Full when the call ends in Mini Mode", async () => {
  await joinCall();
  await toggleMiniMode(MINI);

  await page.getByRole("button", { name: "Leave call" }).click();

  await expectPresentation(FULL);
});

test("closing the mini window during a call leaves the call and keeps the window hidden until shown", async () => {
  await joinCall();
  await toggleMiniMode(MINI);
  await agreeToEveryQuestion();

  await onMeetingWindow(app, "close");

  await expect.poll(() => app.evaluate(() => globalThis.meetingController?.state.status)).toBe("idle");
  expect(await shownWindows()).toEqual([]);

  await clickMenuBarItem("show-window");
  await expectPresentation(FULL);
});

test("with auto Mini Mode on, switching to another app enters Mini Mode only during a call", async () => {
  const settings = await openSettings();
  await settings.getByRole("checkbox", { name: "Enter Mini Mode when I switch to another app during a call" }).check();
  await settings.close();

  await switchToAnotherApp();
  await expectPresentation(FULL);

  await joinCall();
  await switchToAnotherApp();
  await expectPresentation(MINI);
});

test("with auto Mini Mode off, switching to another app during a call stays in Full", async () => {
  await joinCall();

  await switchToAnotherApp();

  await expectPresentation(FULL);
});

test("the opacity setting changes the mini window and leaves the Full window opaque", async () => {
  const settings = await openSettings();
  await settings.getByRole("combobox", { name: "Mini Mode opacity" }).selectOption("80%");

  await toggleMiniMode({ ...MINI, opacity: 0.8 });
  await toggleMiniMode(FULL);
});

test("changing the opacity applies straight away to the mini window", async () => {
  await toggleMiniMode(MINI);
  await miniWindowHandle();

  const settings = await openSettings();
  await settings.getByRole("combobox", { name: "Mini Mode opacity" }).selectOption("60%");

  await expectPresentation({ ...MINI, opacity: 0.6 });
});

test("the Mini Mode hotkey is listed in settings and can be turned off", async () => {
  expect(await isRegistered("Control+Alt+P")).toBe(true);

  const settings = await openSettings();
  await expect(settings.getByRole("group", { name: "Mini Mode" })).toContainText("⌃⌥P");

  await settings.getByRole("group", { name: "Mini Mode" }).getByRole("button", { name: "Turn off" }).click();

  await expect(settings.getByRole("group", { name: "Mini Mode" })).toContainText("Off");
  expect(await isRegistered("Control+Alt+P")).toBe(false);
});
