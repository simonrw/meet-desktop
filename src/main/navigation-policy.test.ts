import { describe, expect, test } from "vitest";

import { isInAppUrl } from "./navigation-policy";

const MEET = "https://meet.google.com";

describe("isInAppUrl", () => {
  test("keeps Meet pages in the Meeting Window", () => {
    expect(isInAppUrl("https://meet.google.com/abc-defg-hij", MEET)).toBe(true);
  });

  test("keeps Google sign-in and the account switcher in the Meeting Window", () => {
    expect(isInAppUrl("https://accounts.google.com/v3/signin/identifier", MEET)).toBe(true);
    expect(isInAppUrl("https://accounts.google.com/AccountChooser?continue=x", MEET)).toBe(true);
  });

  test("honours an overridden Meet origin", () => {
    const stub = "http://127.0.0.1:4321";

    expect(isInAppUrl("http://127.0.0.1:4321/abc-defg-hij", stub)).toBe(true);
    expect(isInAppUrl("https://meet.google.com/abc-defg-hij", stub)).toBe(false);
  });

  test("never keeps an unparseable URL in the Meeting Window", () => {
    expect(isInAppUrl("not a url", MEET)).toBe(false);
  });

  test("sends shared docs and help pages to the default browser", () => {
    expect(isInAppUrl("https://docs.google.com/document/d/123", MEET)).toBe(false);
    expect(isInAppUrl("https://support.google.com/meet", MEET)).toBe(false);
    expect(isInAppUrl("https://example.com/", MEET)).toBe(false);
  });
});
