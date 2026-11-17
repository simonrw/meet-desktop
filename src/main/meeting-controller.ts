import { isDeepStrictEqual } from "node:util";

export type MeetingState =
  | { status: "idle" }
  | { status: "lobby" }
  | { status: "in-call"; muted: boolean; cameraOn: boolean; handRaised: boolean };

export type MeetSignal =
  | { type: "entered-lobby" }
  | { type: "entered-call" }
  | { type: "left-call" }
  | { type: "mute-changed"; muted: boolean }
  | { type: "camera-changed"; cameraOn: boolean }
  | { type: "hand-changed"; handRaised: boolean };

export type Command = {
  type: "toggle-mute" | "toggle-camera" | "toggle-hand" | "leave-call" | "show-window" | "close-window";
};

export interface MeetBridgePort {
  toggleMute(): void;
  toggleCamera(): void;
  toggleHand(): void;
  leaveCall(): void;
}

export interface MeetingWindowPort {
  show(): void;
  hide(): void;

  /**
   * Asks the user whether to leave the call, resolving to true if they agree.
   */
  confirmLeave(): Promise<boolean>;
}

export interface MeetingController {
  readonly state: MeetingState;

  /**
   * Calls `listener` with the new Meeting State each time it changes.
   */
  onStateChange(listener: (state: MeetingState) => void): void;

  signal(signal: MeetSignal): void;
  command(command: Command): void;
}

/**
 * Creates the Meeting Controller, which owns the Meeting State: it takes in Meet Signals and Commands, and acts on
 * the Meet page and the Meeting Window through their ports.
 */
export function createMeetingController({
  meetBridge,
  meetingWindow,
}: {
  meetBridge: MeetBridgePort;
  meetingWindow: MeetingWindowPort;
}): MeetingController {
  let status: MeetingState["status"] = "idle";
  let muted = false;
  let cameraOn = true;
  let handRaised = false;
  let confirmingLeave = false;
  const listeners: Array<(state: MeetingState) => void> = [];

  const state = (): MeetingState => (status === "in-call" ? { status, muted, cameraOn, handRaised } : { status });

  /**
   * Leaves the call if the user agrees to, resolving to whether they agreed.
   */
  async function leaveOnceConfirmed(): Promise<boolean> {
    if (confirmingLeave) {
      return false;
    }

    confirmingLeave = true;
    const confirmed = await meetingWindow.confirmLeave().finally(() => {
      confirmingLeave = false;
    });

    // The call may have ended while the question was on screen.
    if (confirmed && status === "in-call") {
      meetBridge.leaveCall();
    }

    return confirmed;
  }

  async function closeWindow(): Promise<void> {
    if (status !== "in-call" || (await leaveOnceConfirmed())) {
      meetingWindow.hide();
    }
  }

  return {
    get state() {
      return state();
    },

    onStateChange(listener) {
      listeners.push(listener);
    },

    signal(signal) {
      const before = state();

      switch (signal.type) {
        case "entered-lobby":
          status = "lobby";
          break;

        case "entered-call":
          status = "in-call";
          break;

        case "left-call":
          status = "idle";
          muted = false;
          cameraOn = true;
          handRaised = false;
          break;

        case "mute-changed":
          muted = signal.muted;
          break;

        case "camera-changed":
          cameraOn = signal.cameraOn;
          break;

        case "hand-changed":
          handRaised = signal.handRaised;
          break;
      }

      const after = state();
      if (!isDeepStrictEqual(before, after)) {
        listeners.forEach((listener) => listener(after));
      }
    },

    command(command) {
      switch (command.type) {
        case "show-window":
          meetingWindow.show();
          return;

        case "close-window":
          void closeWindow();
          return;
      }

      if (status !== "in-call") {
        return;
      }

      switch (command.type) {
        case "toggle-mute":
          meetBridge.toggleMute();
          break;

        case "toggle-camera":
          meetBridge.toggleCamera();
          break;

        case "toggle-hand":
          meetBridge.toggleHand();
          break;

        case "leave-call":
          void leaveOnceConfirmed();
          break;
      }
    },
  };
}
