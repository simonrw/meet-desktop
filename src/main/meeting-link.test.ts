import { describe, expect, test } from "vitest";

import { meetingUrl, parseMeetingLink } from "./meeting-link";

describe("parseMeetingLink", () => {
  test.each([
    ["abc-defg-hij", "a bare Meeting Code"],
    ["  abc-defg-hij\n", "a code with surrounding whitespace"],
    ["ABC-DEFG-HIJ", "an upper case code"],
    ["abcdefghij", "a code without dashes"],
    ["https://meet.google.com/abc-defg-hij", "a Meet link"],
    ["https://meet.google.com/abc-defg-hij?hs=122&pli=1", "a Meet link with a query"],
    ["https://meet.google.com/abc-defg-hij/", "a Meet link with a trailing slash"],
    ["http://meet.google.com/abc-defg-hij", "an http Meet link"],
    ["meet.google.com/abc-defg-hij", "a Meet link without a scheme"],
    ["meet-desktop://abc-defg-hij", "a URL in the app's own scheme"],
  ])("reads %j (%s) as abc-defg-hij", (input) => {
    expect(parseMeetingLink(input)).toEqual({ code: "abc-defg-hij" });
  });

  test.each([
    ["https://meet.google.com/abc-defg-hij?authuser=1&hs=122", "1", "a Meet link"],
    ["https://meet.google.com/abc-defg-hij?authuser=someone@example.com", "someone@example.com", "a Meet link"],
    ["meet-desktop://abc-defg-hij?authuser=2", "2", "a URL in the app's own scheme"],
  ])("keeps the Google account %j picks (%s)", (input, authuser) => {
    expect(parseMeetingLink(input)).toEqual({ code: "abc-defg-hij", authuser });
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
    expect(parseMeetingLink(input)).toBeUndefined();
  });
});

describe("meetingUrl", () => {
  test("opens the meeting's page on the given Meet origin", () => {
    expect(meetingUrl({ code: "abc-defg-hij" }, "https://meet.google.com")).toBe("https://meet.google.com/abc-defg-hij");
  });

  test("opens the meeting under the Google account the link picked", () => {
    expect(meetingUrl({ code: "abc-defg-hij", authuser: "1" }, "http://127.0.0.1:4000")).toBe(
      "http://127.0.0.1:4000/abc-defg-hij?authuser=1",
    );
  });
});
