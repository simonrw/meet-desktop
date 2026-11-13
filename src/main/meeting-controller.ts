export type MeetingState = { status: "idle" } | { status: "lobby" } | { status: "in-call"; muted: boolean };

export type MeetSignal =
  | { type: "entered-lobby" }
  | { type: "entered-call" }
  | { type: "left-call" }
  | { type: "mute-changed"; muted: boolean };

export type Command = { type: "toggle-mute" };

export interface MeetBridgePort {
  toggleMute(): void;
}

export interface MeetingController {
  readonly state: MeetingState;
  signal(signal: MeetSignal): void;
  command(command: Command): void;
}

/**
 * Creates the Meeting Controller, which owns the Meeting State: it takes in Meet Signals and Commands, and acts on
 * the Meet page through the Meet Bridge port.
 */
export function createMeetingController({ meetBridge }: { meetBridge: MeetBridgePort }): MeetingController {
  let status: MeetingState["status"] = "idle";
  let muted = false;

  return {
    get state() {
      return status === "in-call" ? { status, muted } : { status };
    },

    signal(signal) {
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
          break;

        case "mute-changed":
          muted = signal.muted;
          break;
      }
    },

    command(command) {
      if (status !== "in-call") {
        return;
      }

      switch (command.type) {
        case "toggle-mute":
          meetBridge.toggleMute();
          break;
      }
    },
  };
}
