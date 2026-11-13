/**
 * A key press seen while recording a hotkey, as reported by a keyboard event.
 */
export interface RecordedKey {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const NAMED_KEYS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Space: "Space",
  Tab: "Tab",
  Enter: "Return",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

const SYMBOLS: Record<string, string> = {
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Command: "⌘",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
};

/**
 * Turns a key press into an Electron accelerator, or `undefined` when it isn't a usable hotkey yet: only modifiers
 * are held, a key other than a function key lacks Command, Control or Option, or the key can't be bound.
 */
export function acceleratorFromKey(key: RecordedKey): string | undefined {
  const keyName = keyNameFor(key.code);
  if (keyName === undefined) {
    return undefined;
  }

  const isFunctionKey = /^F\d+$/.test(keyName);
  if (!isFunctionKey && !(key.metaKey || key.ctrlKey || key.altKey)) {
    return undefined;
  }

  const modifiers = [
    key.ctrlKey && "Control",
    key.altKey && "Alt",
    key.shiftKey && "Shift",
    key.metaKey && "Command",
  ].filter((modifier) => modifier !== false);

  return [...modifiers, keyName].join("+");
}

/**
 * Shows an accelerator the way macOS menus do, for example "⌃⌥M".
 */
export function acceleratorLabel(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => SYMBOLS[part] ?? part)
    .join("");
}

function keyNameFor(code: string): string | undefined {
  // Codes name the physical key, unlike `key`, which Option turns into a different character.
  const match = /^(?:Key([A-Z])|Digit(\d)|(F(?:[1-9]|1\d|2[0-4])))$/.exec(code);
  if (match) {
    return match[1] ?? match[2] ?? match[3];
  }

  return NAMED_KEYS[code];
}
