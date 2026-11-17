import { isDeepStrictEqual } from "node:util";

import type { MeetingLink } from "./meeting-link";

// Long enough to leave one call and join the next without Integrations restoring and applying again in between.
const BACK_TO_BACK_WINDOW_MS = 30_000;

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

export type Command = PlainCommand | { type: "join-meeting"; link: MeetingLink };

export type Presentation = "full" | "mini";

/**
 * State an Integration saves when it applies, kept in the Integration Ledger until it restores.
 */
export type RestoreState = string | number | boolean | null | RestoreState[] | { [key: string]: RestoreState };

/**
 * A system side effect tied to being in a call.
 */
export interface Integration {
  /** Names the Integration in the Integration Ledger, so it must stay the same between releases. */
  readonly id: string;

  /** Names the Integration in status the user sees. */
  readonly label: string;

  readonly enabled: boolean;

  /**
   * Applies the side effect, resolving to the state `restore` needs to undo it.
   */
  apply(): Promise<RestoreState>;

  /**
   * Undoes the side effect. `saved` is `null` when the apply never finished, so the state to return to isn't known.
   */
  restore(saved: RestoreState): Promise<void>;
}

/**
 * The applied Integrations, by id, with the state each needs to restore.
 */
export type LedgerEntries = Record<string, RestoreState>;

/**
 * Persists the Integration Ledger, so Integrations left applied by a crash can be restored on the next launch.
 */
export interface IntegrationLedgerPort {
  read(): LedgerEntries;
  write(entries: LedgerEntries): void;
}

export interface Clock {
  /**
   * Calls `callback` after `delayMs`, unless the returned function is called first.
   */
  schedule(delayMs: number, callback: () => void): () => void;
}

export interface MeetBridgePort {
  toggleMute(): void;
  toggleCamera(): void;
  toggleHand(): void;
  leaveCall(): void;
}

export interface MeetingWindowPort {
  readonly presentation: Presentation;

  show(): void;

  /**
   * Hides the Meeting Window, which shows Full when it next appears.
   */
  hide(): void;

  /**
   * Switches the Meeting Window to the given presentation, bringing it forward without taking the keyboard.
   */
  setPresentation(presentation: Presentation): void;

  /**
   * Opens the meeting's pre-join screen and brings the window to the front.
   */
  openMeeting(link: MeetingLink): void;

  /**
   * Asks the user whether to leave the call, resolving to true if they agree.
   */
  confirmLeave(): Promise<boolean>;

  /**
   * Asks the user whether to leave the call to join the given meeting, resolving to true if they agree.
   */
  confirmSwitch(link: MeetingLink): Promise<boolean>;
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
 *
 * Each Integration applies and restores independently of the others, with the Integration Ledger kept up to date.
 * Whatever the ledger lists is restored straight away, since leftover entries mean the last launch crashed during a
 * call.
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
  const listeners: Array<(state: MeetingState) => void> = [];

  const entries = { ...ledger.read() };
  const integrationQueues = new Map<string, Promise<void>>();
  const failures = new Map<string, string>();
  const failureListeners: Array<(failures: string[]) => void> = [];
  let integrationsApplied = false;
  let cancelRestore: (() => void) | undefined;

  const state = (): MeetingState => (status === "in-call" ? { status, muted, cameraOn, handRaised } : { status });

  /**
   * Runs `step` after every step queued before it for the same Integration, so an apply and its restore never overlap.
   */
  function enqueue(integration: Integration, step: () => Promise<void>): void {
    integrationQueues.set(integration.id, (integrationQueues.get(integration.id) ?? Promise.resolve()).then(step));
  }

  /**
   * Runs one Integration's apply or restore, reporting how it went, without letting a failure reach the call.
   */
  async function attempt(integration: Integration, turned: "on" | "off", work: () => Promise<void>): Promise<void> {
    const before = failures.get(integration.id);

    try {
      await work();
      failures.delete(integration.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.set(integration.id, `${integration.label} wasn't turned ${turned}: ${reason}`);
    }

    if (failures.get(integration.id) !== before) {
      const current = [...failures.values()];
      failureListeners.forEach((listener) => listener(current));
    }
  }

  function applyIntegrations(): void {
    integrationsApplied = true;

    for (const integration of integrations.filter((integration) => integration.enabled)) {
      enqueue(integration, () => {
        // Listed before applying, since a crash or a failure part way through may still leave it applied.
        entries[integration.id] ??= null;
        ledger.write({ ...entries });

        return attempt(integration, "on", async () => {
          entries[integration.id] = await integration.apply();
          ledger.write({ ...entries });
        });
      });
    }
  }

  function restoreIntegrations(): void {
    cancelRestore?.();
    cancelRestore = undefined;
    integrationsApplied = false;

    for (const integration of integrations) {
      enqueue(integration, async () => {
        // Read once earlier steps have run, since an apply still running may change the entry when it finishes.
        const saved = entries[integration.id];
        if (saved === undefined) {
          return;
        }

        await attempt(integration, "off", async () => {
          await integration.restore(saved);
          delete entries[integration.id];
          ledger.write({ ...entries });
        });
      });
    }
  }

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

  async function joinMeeting(link: MeetingLink): Promise<void> {
    if (status !== "in-call" || (await confirm(() => meetingWindow.confirmSwitch(link)))) {
      meetingWindow.openMeeting(link);
    }
  }

  async function closeWindow(): Promise<void> {
    if (status !== "in-call" || (await leaveOnceConfirmed())) {
      meetingWindow.hide();
    }
  }

  restoreIntegrations();

  return {
    get state() {
      return state();
    },

    onStateChange(listener) {
      listeners.push(listener);
    },

    get integrationFailures() {
      return [...failures.values()];
    },

    onIntegrationFailuresChange(listener) {
      failureListeners.push(listener);
    },

    signal(signal) {
      const before = state();

      switch (signal.type) {
        case "entered-lobby":
          status = "lobby";
          break;

        case "entered-call":
          cancelRestore?.();
          cancelRestore = undefined;

          if (!integrationsApplied) {
            applyIntegrations();
          }

          status = "in-call";
          break;

        case "left-call":
          if (status === "in-call" && meetingWindow.presentation === "mini") {
            meetingWindow.setPresentation("full");
          }

          if (integrationsApplied && cancelRestore === undefined) {
            cancelRestore = clock.schedule(BACK_TO_BACK_WINDOW_MS, restoreIntegrations);
          }

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
          void joinMeeting(command.link);
          return;

        case "toggle-mini-mode":
          if (meetingWindow.presentation === "full") {
            meetingWindow.setPresentation("mini");
          } else {
            meetingWindow.setPresentation("full");
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
      if (status === "in-call" && meetingWindow.presentation === "full" && autoMiniMode()) {
        meetingWindow.setPresentation("mini");
      }
    },

    async quit() {
      restoreIntegrations();

      await Promise.all(integrationQueues.values());
    },
  };
}
