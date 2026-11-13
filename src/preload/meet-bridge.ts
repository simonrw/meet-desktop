// The Meet Bridge: the only code that knows Meet's DOM. It runs as a sandboxed preload script, which cannot load
// other local modules, so everything it needs at runtime lives in this file.

import { ipcRenderer } from "electron";

import type { ActionChannel, BridgeAction, SignalChannel } from "../main/meet-bridge";
import type { MeetingState, MeetSignal } from "../main/meeting-controller";

const SIGNAL_CHANNEL: SignalChannel = "meet-bridge:signal";
const ACTION_CHANNEL: ActionChannel = "meet-bridge:action";

// Present only while in a call.
const LEAVE_CALL_CONTROL = '[aria-label="Leave call"]';

// Present in the lobby and in a call. The camera control also carries `data-is-muted`.
const MICROPHONE_CONTROL = '[data-is-muted][aria-label*="microphone" i]';

// Meet's DOM changes many times a second during a call.
const OBSERVE_INTERVAL_MS = 100;

type Status = MeetingState["status"];

const STATUS_SIGNALS: Record<Status, MeetSignal> = {
  idle: { type: "left-call" },
  lobby: { type: "entered-lobby" },
  "in-call": { type: "entered-call" },
};

let lastStatus: Status | undefined;
let lastMuted: boolean | undefined;

function send(signal: MeetSignal): void {
  ipcRenderer.send(SIGNAL_CHANNEL, signal);
}

function reportChanges(): void {
  const microphone = document.querySelector(MICROPHONE_CONTROL);

  let status: Status = "idle";
  if (document.querySelector(LEAVE_CALL_CONTROL)) {
    status = "in-call";
  } else if (microphone) {
    status = "lobby";
  }

  const muted = microphone ? microphone.getAttribute("data-is-muted") === "true" : undefined;

  // Mute goes first so that a call entered without a lobby starts with the right mute.
  if (muted !== lastMuted) {
    lastMuted = muted;

    if (muted !== undefined) {
      send({ type: "mute-changed", muted });
    }
  }

  if (status !== lastStatus) {
    lastStatus = status;
    send(STATUS_SIGNALS[status]);
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
    attributeFilter: ["data-is-muted", "aria-label"],
  });

  reportChanges();
}

function pressMeetShortcut(key: string): void {
  // Meet reads the legacy `keyCode`, which the event constructor takes although the DOM typings omit it.
  const shortcut: KeyboardEventInit & { keyCode: number } = {
    key,
    code: `Key${key.toUpperCase()}`,
    keyCode: key.toUpperCase().charCodeAt(0),
    metaKey: true,
    bubbles: true,
    cancelable: true,
  };

  document.dispatchEvent(new KeyboardEvent("keydown", shortcut));
}

const ACTIONS: Record<BridgeAction, () => void> = {
  "toggle-mute": () => pressMeetShortcut("d"),
};

ipcRenderer.on(ACTION_CHANNEL, (_event, action: BridgeAction) => ACTIONS[action]());

window.addEventListener("DOMContentLoaded", observePage);
