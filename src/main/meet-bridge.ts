import { join } from "node:path";

import { ipcMain, type WebContents } from "electron";

import type { MeetBridgePort, MeetSignal } from "./meeting-controller";

export type SignalChannel = "meet-bridge:signal";
export type ActionChannel = "meet-bridge:action";
export type BridgeAction = "toggle-mute" | "toggle-camera" | "toggle-hand" | "leave-call";

const SIGNAL_CHANNEL: SignalChannel = "meet-bridge:signal";
const ACTION_CHANNEL: ActionChannel = "meet-bridge:action";

/**
 * The preload script that must be loaded into the Meet page for `connectMeetBridge` to reach it.
 */
export const MEET_BRIDGE_PRELOAD = join(__dirname, "..", "preload", "meet-bridge.js");

/**
 * Connects to the Meet Bridge running in the given Meet page: its Meet Signals are passed to `onSignal`, and the
 * returned port carries out Bridge actions on the page.
 */
export function connectMeetBridge(meetPage: WebContents, onSignal: (signal: MeetSignal) => void): MeetBridgePort {
  ipcMain.on(SIGNAL_CHANNEL, (event, signal: MeetSignal) => {
    if (event.sender === meetPage) {
      onSignal(signal);
    }
  });

  // A crashed page can't report that its call is over.
  meetPage.on("render-process-gone", () => onSignal({ type: "left-call" }));

  const act = (action: BridgeAction) => meetPage.send(ACTION_CHANNEL, action);

  return {
    toggleMute: () => act("toggle-mute"),
    toggleCamera: () => act("toggle-camera"),
    toggleHand: () => act("toggle-hand"),
    leaveCall: () => act("leave-call"),
  };
}
