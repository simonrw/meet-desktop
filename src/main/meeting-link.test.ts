import { describe, expect, test } from "vitest";

import { parseMeetingCode } from "./meeting-link";

describe("parseMeetingCode", () => {
  test.each([
    ["abc-defg-hij", "a bare meeting code"],
    ["  abc-defg-hij\n", "a code with surrounding whitespace"],
    ["ABC-DEFG-HIJ", "an upper case code"],
    ["abcdefghij", "a code without dashes"],
    ["https://meet.google.com/abc-defg-hij", "a Meet link"],
    ["https://meet.google.com/abc-defg-hij?authuser=1&hs=122", "a Meet link with a query"],
    ["https://meet.google.com/abc-defg-hij/", "a Meet link with a trailing slash"],
    ["http://meet.google.com/abc-defg-hij", "an http Meet link"],
    ["meet.google.com/abc-defg-hij", "a Meet link without a scheme"],
    ["meet-desktop://abc-defg-hij", "a URL in the app's own scheme"],
  ])("reads %j (%s) as abc-defg-hij", (input) => {
    expect(parseMeetingCode(input)).toBe("abc-defg-hij");
  });

  test.each([
    ["", "empty input"],
    ["hello there", "plain text"],
    ["abc-defg-hi", "a code that is too short"],
    ["abc-defg-hijk", "a code that is too long"],
    ["abc-123g-hij", "a code with digits"],
    ["https://meet.google.com/", "the Meet home page"],
    ["https://meet.google.com/landing", "another Meet page"],
    ["https://meet.google.com/abc-defg-hij/extra", "a Meet link with extra path"],
    ["https://example.com/abc-defg-hij", "a code on another site"],
    ["https://meet.google.com.example.com/abc-defg-hij", "a look-alike host"],
    ["ftp://meet.google.com/abc-defg-hij", "a Meet link with another scheme"],
    ["meet-desktop://hello", "the app's own scheme without a code"],
    ["Join at https://meet.google.com/abc-defg-hij", "a link inside other text"],
  ])("rejects %j (%s)", (input) => {
    expect(parseMeetingCode(input)).toBeUndefined();
  });
});
