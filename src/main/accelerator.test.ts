import { describe, expect, test } from "vitest";

import { acceleratorFromKey, acceleratorLabel, type RecordedKey } from "./accelerator";

function key(code: string, modifiers: Partial<Omit<RecordedKey, "code">> = {}): RecordedKey {
  return { code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers };
}

describe("acceleratorFromKey", () => {
  test("combines the held modifiers with the pressed key", () => {
    expect(acceleratorFromKey(key("KeyM", { ctrlKey: true, altKey: true }))).toBe("Control+Alt+M");
    expect(acceleratorFromKey(key("Digit1", { metaKey: true, shiftKey: true }))).toBe("Shift+Command+1");
  });

  test("names the physical key, whatever character Option turns it into", () => {
    expect(acceleratorFromKey(key("KeyM", { altKey: true, shiftKey: true }))).toBe("Alt+Shift+M");
    expect(acceleratorFromKey(key("Slash", { altKey: true }))).toBe("Alt+/");
  });

  test("names arrows and other named keys", () => {
    expect(acceleratorFromKey(key("ArrowUp", { ctrlKey: true }))).toBe("Control+Up");
    expect(acceleratorFromKey(key("Space", { altKey: true }))).toBe("Alt+Space");
  });

  test("waits while only modifiers are held", () => {
    expect(acceleratorFromKey(key("ControlLeft", { ctrlKey: true }))).toBeUndefined();
    expect(acceleratorFromKey(key("MetaRight", { metaKey: true }))).toBeUndefined();
  });

  test("refuses a key without Command, Control or Option, which would take over typing system-wide", () => {
    expect(acceleratorFromKey(key("KeyM"))).toBeUndefined();
    expect(acceleratorFromKey(key("KeyM", { shiftKey: true }))).toBeUndefined();
  });

  test("allows function keys on their own", () => {
    expect(acceleratorFromKey(key("F13"))).toBe("F13");
  });

  test("ignores keys it can't bind", () => {
    expect(acceleratorFromKey(key("IntlBackslash", { ctrlKey: true }))).toBeUndefined();
  });
});

describe("acceleratorLabel", () => {
  test("shows modifiers and arrows as the macOS symbols", () => {
    expect(acceleratorLabel("Control+Alt+Shift+Command+M")).toBe("⌃⌥⇧⌘M");
    expect(acceleratorLabel("Control+Up")).toBe("⌃↑");
  });

  test("keeps other keys as they are", () => {
    expect(acceleratorLabel("F13")).toBe("F13");
    expect(acceleratorLabel("Alt+Space")).toBe("⌥Space");
  });
});
