// The Meet Bridge: the only code that knows Meet's DOM. It runs as a sandboxed preload script, which cannot load
// other local modules, so everything it needs at runtime lives in this file.

import { ipcRenderer } from "electron";

import type { ActionChannel, BridgeAction, SignalChannel } from "../main/meet-bridge";
import type { MeetingState, MeetSignal } from "../main/meeting-controller";

const SIGNAL_CHANNEL: SignalChannel = "meet-bridge:signal";
const ACTION_CHANNEL: ActionChannel = "meet-bridge:action";

// Present only while in a call.
const LEAVE_CALL_CONTROL = '[aria-label="Leave call"]';

// Present in the lobby and in a call.
const MICROPHONE_CONTROL = '[data-is-muted][aria-label*="microphone" i]';
const CAMERA_CONTROL = '[data-is-muted][aria-label*="camera" i]';

// Present only while in a call.
const HAND_CONTROL = '[aria-pressed][aria-label*="hand" i]';

// Meet's DOM changes many times a second during a call.
const OBSERVE_INTERVAL_MS = 100;

type Status = MeetingState["status"];

const STATUS_SIGNALS: Record<Status, MeetSignal> = {
  idle: { type: "left-call" },
  lobby: { type: "entered-lobby" },
  "in-call": { type: "entered-call" },
};

function attribute(selector: string, name: string): string | undefined {
  return document.querySelector(selector)?.getAttribute(name) ?? undefined;
}

/**
 * Reads the Meet Signal describing each aspect of the page as it stands, leaving out aspects the page doesn't show.
 */
function readPage(): Record<string, MeetSignal | undefined> {
  const microphoneOff = attribute(MICROPHONE_CONTROL, "data-is-muted");
  const cameraOff = attribute(CAMERA_CONTROL, "data-is-muted");
  const handPressed = attribute(HAND_CONTROL, "aria-pressed");

  let status: Status = "idle";
  if (document.querySelector(LEAVE_CALL_CONTROL)) {
    status = "in-call";
  } else if (microphoneOff !== undefined) {
    status = "lobby";
  }

  // Status goes last so that a call entered without a lobby starts with the right mute and camera.
  return {
    mute: microphoneOff === undefined ? undefined : { type: "mute-changed", muted: microphoneOff === "true" },
    camera: cameraOff === undefined ? undefined : { type: "camera-changed", cameraOn: cameraOff !== "true" },
    hand: handPressed === undefined ? undefined : { type: "hand-changed", handRaised: handPressed === "true" },
    status: STATUS_SIGNALS[status],
  };
}

const lastReported: Record<string, string | undefined> = {};

function reportChanges(): void {
  for (const [aspect, signal] of Object.entries(readPage())) {
    const reading = JSON.stringify(signal);
    if (reading === lastReported[aspect]) {
      continue;
    }

    lastReported[aspect] = reading;

    if (signal) {
      ipcRenderer.send(SIGNAL_CHANNEL, signal);
    }
  }
}

function observePage(): void {
  let reportScheduled = false;

  const observer = new MutationObserver(() => {
    if (reportScheduled) {
      return;
    }

    reportScheduled = true;
    setTimeout(() => {
      reportScheduled = false;
      reportChanges();
    }, OBSERVE_INTERVAL_MS);
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-is-muted", "aria-pressed", "aria-label"],
  });

  reportChanges();
}

// Meet ignores its own keyboard shortcuts while another app is focused, so every action clicks.
const ACTION_CONTROLS: Record<BridgeAction, string> = {
  "toggle-mute": MICROPHONE_CONTROL,
  "toggle-camera": CAMERA_CONTROL,
  "toggle-hand": HAND_CONTROL,
  "leave-call": LEAVE_CALL_CONTROL,
};

ipcRenderer.on(ACTION_CHANNEL, (_event, action: BridgeAction) => {
  document.querySelector<HTMLElement>(ACTION_CONTROLS[action])?.click();
});

window.addEventListener("DOMContentLoaded", observePage);
