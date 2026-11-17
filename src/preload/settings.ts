// The settings window's page: shows the settings the main process sends and asks it for changes. It runs as a
// sandboxed preload script, which cannot load other local modules.

import { ipcRenderer } from "electron";

import type { ChangeChannel, SettingsChange, SettingsView, ViewChannel } from "../main/settings";

const VIEW_CHANNEL: ViewChannel = "settings:view";
const CHANGE_CHANNEL: ChangeChannel = "settings:change";

let recording = false;

async function change(requested: SettingsChange): Promise<void> {
  render(await ipcRenderer.invoke(CHANGE_CHANNEL, requested));
}

function button(id: string, label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.id = id;
  element.textContent = label;
  element.addEventListener("click", onClick);

  return element;
}

function hotkeyRow(hotkey: SettingsView["hotkeys"][number]): HTMLElement {
  const label = document.createElement("span");
  label.textContent = hotkey.label;

  const combination = document.createElement("kbd");
  combination.textContent = hotkey.recording ? "Press a combination…" : (hotkey.combination ?? "Off");
  combination.classList.toggle("recording", hotkey.recording);
  combination.classList.toggle("off", hotkey.combination === null);

  const record = button(`${hotkey.name}-record`, "Record", () => change({ type: "record", name: hotkey.name }));

  const turnOff = button(`${hotkey.name}-off`, "Turn off", () => change({ type: "turn-off", name: hotkey.name }));
  turnOff.disabled = hotkey.combination === null;

  const row = document.createElement("div");
  row.className = "hotkey";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", hotkey.label);
  row.append(label, combination, record, turnOff);

  if (hotkey.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    error.textContent = hotkey.error;
    row.append(error);
  }

  return row;
}

function option(type: "launch-at-login" | "always-on-top", text: string, enabled: boolean): HTMLElement {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = type;
  checkbox.checked = enabled;
  checkbox.addEventListener("change", () => change({ type, enabled: checkbox.checked }));

  const label = document.createElement("label");
  label.append(checkbox, ` ${text}`);

  return label;
}

function heading(text: string): HTMLElement {
  const element = document.createElement("h2");
  element.textContent = text;

  return element;
}

function render(view: SettingsView): void {
  recording = view.hotkeys.some((hotkey) => hotkey.recording);

  // Rebuilding the page drops focus, which keyboard users need kept.
  const focused = document.activeElement?.id;

  document.body.replaceChildren(
    heading("Hotkeys"),
    ...view.hotkeys.map(hotkeyRow),
    heading("General"),
    option("launch-at-login", "Launch at login", view.launchAtLogin),
    option("always-on-top", "Keep window on top", view.alwaysOnTop),
  );

  if (focused) {
    document.getElementById(focused)?.focus();
  }
}

window.addEventListener("DOMContentLoaded", async () => render(await ipcRenderer.invoke(VIEW_CHANNEL)));

window.addEventListener("keydown", (event) => {
  if (!recording || event.repeat) {
    return;
  }

  event.preventDefault();

  const { code, metaKey, ctrlKey, altKey, shiftKey } = event;
  change({ type: "key", key: { code, metaKey, ctrlKey, altKey, shiftKey } });
});

// Hotkeys stay paused while recording, so recording must not outlast the user's attention.
window.addEventListener("blur", () => {
  if (recording) {
    change({ type: "cancel-recording" });
  }
});
