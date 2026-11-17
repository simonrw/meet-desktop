// The mini window's handle: reports drags and double-clicks to the main process, which moves the window or returns
// it to Full. It runs as a sandboxed preload script, which cannot load other local modules.

import { ipcRenderer } from "electron";

import type { HandleChannel, HandleMessage } from "../main/meeting-window";

const HANDLE_CHANNEL: HandleChannel = "mini-mode-handle";

let dragging = false;

function report(message: HandleMessage): void {
  ipcRenderer.send(HANDLE_CHANNEL, message);
}

window.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  dragging = true;
  report({ type: "drag-start", x: event.screenX, y: event.screenY });
});

window.addEventListener("pointermove", (event) => {
  if (dragging) {
    report({ type: "drag", x: event.screenX, y: event.screenY });
  }
});

window.addEventListener("pointerup", () => {
  dragging = false;
});

window.addEventListener("dblclick", () => report({ type: "double-click" }));
