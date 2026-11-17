import { isDeepStrictEqual } from "node:util";

import {
  startIntegrationLifecycle,
  type Clock,
  type Integration,
  type IntegrationLedgerPort,
} from "./integration-lifecycle";

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

/**
 * A Command that carries nothing beyond its type.
 */
export type PlainCommand = {
  type:
    | "toggle-mute"
    | "toggle-camera"
    | "toggle-hand"
    | "leave-call"
    | "show-window"
    | "close-window"
    | "toggle-mini-mode";
};

export type Command = PlainCommand | { type: "join-meeting"; code: string };

export type Presentation = "full" | "mini";

export interface MeetBridgePort {
  toggleMute(): void;
  toggleCamera(): void;
  toggleHand(): void;
  leaveCall(): void;
}

export interface MeetingWindowPort {
  show(): void;
  hide(): void;
  setPresentation(presentation: Presentation): void;

  /**
   * Opens the pre-join screen of the meeting with the given code and brings the window to the front.
   */
  openMeeting(code: string): void;

  /**
   * Asks the user whether to leave the call, resolving to true if they agree.
   */
  confirmLeave(): Promise<boolean>;

  /**
   * Asks the user whether to leave the call to join the meeting with the given code, resolving to true if they agree.
   */
  confirmSwitch(code: string): Promise<boolean>;
}

export interface MeetingController {
  readonly state: MeetingState;

  /**
   * Calls `listener` with the new Meeting State each time it changes.
   */
  onStateChange(listener: (state: MeetingState) => void): void;

  /**
   * Describes, for the user, each Integration whose last apply or restore failed.
   */
  readonly integrationFailures: string[];

  /**
   * Calls `listener` with the new Integration failures each time they change.
   */
  onIntegrationFailuresChange(listener: (failures: string[]) => void): void;

  signal(signal: MeetSignal): void;
  command(command: Command): void;

  /**
   * Tells the controller the user switched from the app to another one.
   */
  switchedAway(): void;

  /**
   * Restores every applied Integration, resolving once they have all finished, so the app can quit.
   */
  quit(): Promise<void>;
}

/**
 * Creates the Meeting Controller, which owns the Meeting State: it takes in Meet Signals and Commands, acts on the Meet
 * page and the Meeting Window through their ports, and applies Integrations while the user is in a call.
 * `autoMiniMode` reads whether the user wants Mini Mode whenever they switch away from the app during a call.
 */
export function createMeetingController({
  meetBridge,
  meetingWindow,
  integrations,
  ledger,
  clock,
  autoMiniMode,
}: {
  meetBridge: MeetBridgePort;
  meetingWindow: MeetingWindowPort;
  integrations: Integration[];
  ledger: IntegrationLedgerPort;
  clock: Clock;
  autoMiniMode: () => boolean;
}): MeetingController {
  let status: MeetingState["status"] = "idle";
  let muted = false;
  let cameraOn = true;
  let handRaised = false;
  let confirming = false;
  let presentation: Presentation = "full";
  const listeners: Array<(state: MeetingState) => void> = [];

  const integrationLifecycle = startIntegrationLifecycle({ integrations, ledger, clock });

  const state = (): MeetingState => (status === "in-call" ? { status, muted, cameraOn, handRaised } : { status });

  /**
   * Puts a question to the user, resolving to whether they agreed. Resolves to false without asking while another
   * question is on screen.
   */
  async function confirm(ask: () => Promise<boolean>): Promise<boolean> {
    if (confirming) {
      return false;
    }

    confirming = true;
    return ask().finally(() => {
      confirming = false;
    });
  }

  /**
   * Leaves the call if the user agrees to, resolving to whether they agreed.
   */
  async function leaveOnceConfirmed(): Promise<boolean> {
    const confirmed = await confirm(() => meetingWindow.confirmLeave());

    // The call may have ended while the question was on screen.
    if (confirmed && status === "in-call") {
      meetBridge.leaveCall();
    }

    return confirmed;
  }

  async function joinMeeting(code: string): Promise<void> {
    if (status !== "in-call" || (await confirm(() => meetingWindow.confirmSwitch(code)))) {
      meetingWindow.openMeeting(code);
    }
  }

  function present(next: Presentation): void {
    presentation = next;
    meetingWindow.setPresentation(next);
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

    get integrationFailures() {
      return integrationLifecycle.failures;
    },

    onIntegrationFailuresChange(listener) {
      integrationLifecycle.onFailuresChange(listener);
    },

    signal(signal) {
      const before = state();

      switch (signal.type) {
        case "entered-lobby":
          status = "lobby";
          break;

        case "entered-call":
          integrationLifecycle.enteredCall();
          status = "in-call";
          break;

        case "left-call":
          if (status === "in-call" && presentation === "mini") {
            present("full");
          }

          integrationLifecycle.leftCall();
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

        case "join-meeting":
          void joinMeeting(command.code);
          return;

        case "toggle-mini-mode":
          if (presentation === "full") {
            present("mini");
          } else {
            present("full");
            meetingWindow.show();
          }
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

    switchedAway() {
      if (status === "in-call" && presentation === "full" && autoMiniMode()) {
        present("mini");
      }
    },

    quit() {
      return integrationLifecycle.quit();
    },
  };
}
