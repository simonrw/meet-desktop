import { expect, test } from "@playwright/test";

import { launchApp, startStubMeet } from "./app";

test("opens the Meet home screen in the Meeting Window", async () => {
  const meet = await startStubMeet();
  const app = await launchApp(meet.origin);

  const window = await app.firstWindow();
  await expect(window).toHaveTitle("Stub Meet");

  await app.close();
  meet.close();
});
