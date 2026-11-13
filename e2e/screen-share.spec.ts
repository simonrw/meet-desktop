import { expect, test, type ElectronApplication, type Page } from "@playwright/test";

import { launchApp, startStubMeet } from "./app";

let meet: Awaited<ReturnType<typeof startStubMeet>>;
let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  meet = await startStubMeet();
  app = await launchApp(meet.origin);
  page = await app.firstWindow();

  await page.getByRole("button", { name: "New meeting" }).click();
  await page.getByRole("button", { name: "Join now" }).click();
});

test.afterEach(async () => {
  await app.close();
  meet.close();
});

async function openSourcePicker(): Promise<Page> {
  const picker = app.waitForEvent("window");
  await page.getByRole("button", { name: "Share screen" }).click();

  return picker;
}

test("picking a screen in the source picker shares that screen", async () => {
  const picker = await openSourcePicker();

  await picker.getByRole("region", { name: "Screens" }).getByRole("button").first().click();

  await expect(page.locator("#share-status")).toHaveText("sharing monitor");
});

test("the source picker lists screens and windows with thumbnails and names", async () => {
  const picker = await openSourcePicker();

  for (const kind of ["Screens", "Windows"]) {
    const source = picker.getByRole("region", { name: kind }).getByRole("button").first();

    await expect(source).toHaveText(/\S/);
    await expect(source.locator("img")).toHaveJSProperty("complete", true);
    await expect(source.locator("img")).not.toHaveJSProperty("naturalWidth", 0);
  }
});

test("picking a window in the source picker shares only that window", async () => {
  const picker = await openSourcePicker();

  await picker.getByRole("region", { name: "Windows" }).getByRole("button").first().click();

  await expect(page.locator("#share-status")).toHaveText("sharing window");
});

test("cancelling the source picker reaches Meet as a cancelled share and leaves the call untouched", async () => {
  const picker = await openSourcePicker();

  await picker.getByRole("button", { name: "Cancel" }).click();

  await expect(page.locator("#share-status")).toHaveText("share cancelled");

  await expect(page.getByRole("button", { name: "Leave call" })).toBeVisible();
  expect(await app.evaluate(() => globalThis.meetingController?.state.status)).toBe("in-call");
});

test("without the Screen Recording permission, the app explains it and opens its System Settings pane", async () => {
  await app.evaluate(({ dialog, shell, systemPreferences }) => {
    const seen = globalThis as { explanation?: string; opened?: string };

    systemPreferences.getMediaAccessStatus = () => "denied";
    dialog.showMessageBox = async (...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxOptions;
      seen.explanation = `${options.message} [${options.buttons?.join(", ")}]`;

      return { response: 0, checkboxChecked: false };
    };
    shell.openExternal = async (url) => {
      seen.opened = url;
    };
  });

  await page.getByRole("button", { name: "Share screen" }).click();

  await expect(page.locator("#share-status")).toHaveText("share cancelled");

  expect(app.windows()).toHaveLength(1);

  const seen = await app.evaluate(() => {
    const { explanation, opened } = globalThis as { explanation?: string; opened?: string };

    return { explanation, opened };
  });
  expect(seen.explanation).toBe("Meet needs permission to share your screen [Open System Settings, Not Now]");

  expect(seen.opened).toBe("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
});
