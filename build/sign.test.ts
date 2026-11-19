import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import sign from "./sign.js";

let app: string;

beforeEach(() => {
  app = join(mkdtempSync(join(tmpdir(), "sign-")), "Meet.app");
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  copyFileSync("/usr/bin/true", join(app, "Contents", "MacOS", "Meet"));
  writeFileSync(
    join(app, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>Meet</string>
  <key>CFBundleIdentifier</key>
  <string>dev.simonrw.meet-desktop</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
`,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function designatedRequirement(path: string): string {
  return execFileSync("codesign", ["--display", "--requirements", "-", path], { encoding: "utf8", stdio: "pipe" });
}

// CI runs this file on its macOS job, since codesign only exists on macOS.
describe.runIf(process.platform === "darwin")("sign", () => {
  test("signs a local build ad-hoc so it still runs", async () => {
    vi.stubEnv("CI", "");

    await sign({ app, platform: "darwin" });

    expect(() => execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" })).not.toThrow();
    expect(designatedRequirement(app)).toContain("cdhash");
  });

  test("fails a CI build that isn't signed with the release certificate", async () => {
    vi.stubEnv("CI", "true");

    await expect(sign({ app, platform: "darwin" })).rejects.toThrow(/release certificate/);
  });
});
