import { describe, expect, test } from "vitest";

import type { Integration, LedgerEntries } from "./integration-lifecycle";
import { createMeetingController, type PlainCommand } from "./meeting-controller";

interface FakeIntegrationOptions {
  enabled?: boolean;
  failApply?: string;
  failRestore?: string;
}

function setup({
  integrations: integrationOptions = { focus: {} },
  ledger: ledgerEntries = {},
  autoMiniMode = false,
}: {
  integrations?: Record<string, FakeIntegrationOptions>;
  ledger?: LedgerEntries;
  autoMiniMode?: boolean;
} = {}) {
  const bridgeActions: string[] = [];
  const windowActions: string[] = [];
  const integrationActions: string[] = [];
  const pendingConfirmations: Array<(confirmed: boolean) => void> = [];
  const announcedStates: unknown[] = [];

  const ledger = { entries: ledgerEntries };
  const clock = fakeClock();

  const integrations = Object.entries(integrationOptions).map(([id, options]): Integration => ({
    id,
    label: id,
    enabled: options.enabled ?? true,

    async apply() {
      integrationActions.push(`${id}:apply`);
      if (options.failApply) {
        throw new Error(options.failApply);
      }

      return { appliedBy: id };
    },

    async restore(saved) {
      integrationActions.push(`${id}:restore ${JSON.stringify(saved)}`);
      if (options.failRestore) {
        throw new Error(options.failRestore);
      }
    },
  }));

  const controller = createMeetingController({
    meetBridge: {
      toggleMute: () => bridgeActions.push("toggle-mute"),
      toggleCamera: () => bridgeActions.push("toggle-camera"),
      toggleHand: () => bridgeActions.push("toggle-hand"),
      leaveCall: () => bridgeActions.push("leave-call"),
    },
    meetingWindow: {
      show: () => windowActions.push("show"),
      hide: () => windowActions.push("hide"),
      setPresentation: (presentation) => windowActions.push(presentation),
      openMeeting: (code) => windowActions.push(`open ${code}`),
      confirmLeave: () => new Promise((resolve) => pendingConfirmations.push(resolve)),
      confirmSwitch: () => new Promise((resolve) => pendingConfirmations.push(resolve)),
    },
    integrations,
    ledger: {
      read: () => ledger.entries,
      write: (entries) => {
        ledger.entries = entries;
      },
    },
    clock,
    autoMiniMode: () => autoMiniMode,
  });
  controller.onStateChange((state) => announcedStates.push(state));

  /**
   * Answers the oldest leave confirmation still on screen, and waits for the controller to act on the answer.
   */
  async function answerConfirmation(confirmed: boolean) {
    pendingConfirmations.shift()?.(confirmed);

    await settle();
  }

  return {
    controller,
    bridgeActions,
    windowActions,
    integrationActions,
    pendingConfirmations,
    announcedStates,
    ledger,
    clock,
    answerConfirmation,
  };
}

/**
 * Waits for the controller to finish the Integration work it has started.
 */
function settle() {
  return new Promise((resolve) => setTimeout(resolve));
}

function fakeClock() {
  let now = 0;
  let timers: Array<{ at: number; callback: () => void }> = [];

  return {
    schedule(delayMs: number, callback: () => void) {
      const timer = { at: now + delayMs, callback };
      timers.push(timer);

      return () => {
        timers = timers.filter((other) => other !== timer);
      };
    },

    /**
     * Moves time forward, running the callbacks that fall due, and waits for the work they start.
     */
    async advance(ms: number) {
      now += ms;

      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      due.forEach((timer) => timer.callback());

      await settle();
    },
  };
}

function inCall(overrides: { muted?: boolean; cameraOn?: boolean; handRaised?: boolean } = {}) {
  return { status: "in-call", muted: false, cameraOn: true, handRaised: false, ...overrides };
}

describe("Meeting State", () => {
  test("follows the user from the Meet home screen through the lobby into a call and back", () => {
    const { controller } = setup();

    expect(controller.state).toEqual({ status: "idle" });

    controller.signal({ type: "entered-lobby" });
    expect(controller.state).toEqual({ status: "lobby" });

    controller.signal({ type: "entered-call" });
    expect(controller.state).toEqual(inCall());

    controller.signal({ type: "left-call" });
    expect(controller.state).toEqual({ status: "idle" });
  });

  test("reflects mute changes made inside Meet during a call", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });

    controller.signal({ type: "mute-changed", muted: true });
    expect(controller.state).toEqual(inCall({ muted: true }));

    controller.signal({ type: "mute-changed", muted: false });
    expect(controller.state).toEqual(inCall({ muted: false }));
  });

  test("reflects camera changes made inside Meet during a call", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });

    controller.signal({ type: "camera-changed", cameraOn: false });
    expect(controller.state).toEqual(inCall({ cameraOn: false }));

    controller.signal({ type: "camera-changed", cameraOn: true });
    expect(controller.state).toEqual(inCall({ cameraOn: true }));
  });

  test("reflects the hand being raised and lowered inside Meet during a call", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });

    controller.signal({ type: "hand-changed", handRaised: true });
    expect(controller.state).toEqual(inCall({ handRaised: true }));

    controller.signal({ type: "hand-changed", handRaised: false });
    expect(controller.state).toEqual(inCall({ handRaised: false }));
  });

  test("carries the mute and camera chosen in the lobby into the call", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-lobby" });
    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "camera-changed", cameraOn: false });

    controller.signal({ type: "entered-call" });

    expect(controller.state).toEqual(inCall({ muted: true, cameraOn: false }));
  });

  test("does not carry mute, camera or a raised hand over from one call to the next", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "camera-changed", cameraOn: false });
    controller.signal({ type: "hand-changed", handRaised: true });
    controller.signal({ type: "left-call" });

    controller.signal({ type: "entered-call" });

    expect(controller.state).toEqual(inCall());
  });

  test("stays put when Meet repeats a signal", () => {
    const { controller } = setup();

    controller.signal({ type: "left-call" });
    expect(controller.state).toEqual({ status: "idle" });

    controller.signal({ type: "entered-lobby" });
    controller.signal({ type: "entered-lobby" });
    expect(controller.state).toEqual({ status: "lobby" });

    controller.signal({ type: "entered-call" });
    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "mute-changed", muted: true });
    expect(controller.state).toEqual(inCall({ muted: true }));
  });

  test("starts a call joined without a lobby with the mute and camera Meet reported for it", () => {
    const { controller } = setup();

    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "camera-changed", cameraOn: false });
    controller.signal({ type: "entered-call" });

    expect(controller.state).toEqual(inCall({ muted: true, cameraOn: false }));
  });
});

describe("Meeting State changes", () => {
  test("are announced to listeners as the user enters a call, mutes, unmutes and leaves", () => {
    const { controller, announcedStates } = setup();

    controller.signal({ type: "entered-lobby" });
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "mute-changed", muted: false });
    controller.signal({ type: "left-call" });

    expect(announcedStates).toEqual([
      { status: "lobby" },
      inCall(),
      inCall({ muted: true }),
      inCall(),
      { status: "idle" },
    ]);
  });

  test("are not announced when a signal leaves the Meeting State as it was", () => {
    const { controller, announcedStates } = setup();

    controller.signal({ type: "left-call" });
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "mute-changed", muted: false });

    expect(announcedStates).toEqual([inCall()]);
  });
});

describe.each<PlainCommand["type"]>(["toggle-mute", "toggle-camera", "toggle-hand"])("%s Command", (type) => {
  test("is carried out through the Meet Bridge during a call", () => {
    const { controller, bridgeActions } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type });

    expect(bridgeActions).toEqual([type]);
  });

  test("leaves the Meeting State alone until Meet reports the change", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type });

    expect(controller.state).toEqual(inCall());
  });

  test("does nothing outside a call", () => {
    const { controller, bridgeActions } = setup();

    controller.command({ type });
    controller.signal({ type: "entered-lobby" });
    controller.command({ type });
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "left-call" });
    controller.command({ type });

    expect(bridgeActions).toEqual([]);
  });
});

describe("show window Command", () => {
  test("shows the Meeting Window in every Meeting State", () => {
    const { controller, windowActions } = setup();

    controller.command({ type: "show-window" });
    controller.signal({ type: "entered-lobby" });
    controller.command({ type: "show-window" });
    controller.signal({ type: "entered-call" });
    controller.command({ type: "show-window" });

    expect(windowActions).toEqual(["show", "show", "show"]);
  });
});

describe("leave call Command", () => {
  test("leaves the call once the user confirms, keeping the Meeting Window open", async () => {
    const { controller, bridgeActions, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "leave-call" });
    expect(bridgeActions).toEqual([]);

    await answerConfirmation(true);
    expect(bridgeActions).toEqual(["leave-call"]);
    expect(windowActions).toEqual([]);
  });

  test("keeps the call going when the user cancels", async () => {
    const { controller, bridgeActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "leave-call" });
    await answerConfirmation(false);

    expect(bridgeActions).toEqual([]);
    expect(controller.state).toEqual(inCall());
  });

  test("does nothing outside a call", () => {
    const { controller, pendingConfirmations } = setup();

    controller.command({ type: "leave-call" });
    controller.signal({ type: "entered-lobby" });
    controller.command({ type: "leave-call" });

    expect(pendingConfirmations).toHaveLength(0);
  });

  test("asks only once when repeated while the question is on screen", async () => {
    const { controller, bridgeActions, pendingConfirmations, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "leave-call" });
    controller.command({ type: "leave-call" });
    expect(pendingConfirmations).toHaveLength(1);

    await answerConfirmation(true);
    expect(bridgeActions).toEqual(["leave-call"]);
  });

  test("asks again after the user cancels", async () => {
    const { controller, pendingConfirmations, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    controller.command({ type: "leave-call" });
    await answerConfirmation(false);

    controller.command({ type: "leave-call" });

    expect(pendingConfirmations).toHaveLength(1);
  });

  test("does not leave a call that ended while the question was on screen", async () => {
    const { controller, bridgeActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    controller.command({ type: "leave-call" });

    controller.signal({ type: "left-call" });
    await answerConfirmation(true);

    expect(bridgeActions).toEqual([]);
  });
});

describe("close window Command", () => {
  test("hides the Meeting Window without asking outside a call", () => {
    const { controller, windowActions, pendingConfirmations } = setup();

    controller.command({ type: "close-window" });
    controller.signal({ type: "entered-lobby" });
    controller.command({ type: "close-window" });

    expect(windowActions).toEqual(["hide", "hide"]);
    expect(pendingConfirmations).toHaveLength(0);
  });

  test("leaves the call and hides the Meeting Window once the user confirms", async () => {
    const { controller, bridgeActions, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "close-window" });
    expect(bridgeActions).toEqual([]);
    expect(windowActions).toEqual([]);

    await answerConfirmation(true);
    expect(bridgeActions).toEqual(["leave-call"]);
    expect(windowActions).toEqual(["hide"]);
  });

  test("keeps the call going and the Meeting Window open when the user cancels", async () => {
    const { controller, bridgeActions, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "close-window" });
    await answerConfirmation(false);

    expect(bridgeActions).toEqual([]);
    expect(windowActions).toEqual([]);
    expect(controller.state).toEqual(inCall());
  });

  test("keeps the Meeting Window open when closed while the leave call question is on screen", async () => {
    const { controller, bridgeActions, windowActions, pendingConfirmations, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    controller.command({ type: "leave-call" });

    controller.command({ type: "close-window" });
    expect(pendingConfirmations).toHaveLength(1);

    await answerConfirmation(true);
    expect(bridgeActions).toEqual(["leave-call"]);
    expect(windowActions).toEqual([]);
  });

  test("still hides the Meeting Window when the call ended while the question was on screen", async () => {
    const { controller, bridgeActions, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    controller.command({ type: "close-window" });

    controller.signal({ type: "left-call" });
    await answerConfirmation(true);

    expect(bridgeActions).toEqual([]);
    expect(windowActions).toEqual(["hide"]);
  });
});

describe("Integrations", () => {
  test("apply on entering a call, not in the lobby", async () => {
    const { controller, integrationActions } = setup();

    controller.signal({ type: "entered-lobby" });
    await settle();
    expect(integrationActions).toEqual([]);

    controller.signal({ type: "entered-call" });
    await settle();
    expect(integrationActions).toEqual(["focus:apply"]);
  });

  test("apply only when turned on", async () => {
    const { controller, integrationActions } = setup({ integrations: { focus: { enabled: false }, slack: {} } });

    controller.signal({ type: "entered-call" });
    await settle();

    expect(integrationActions).toEqual(["slack:apply"]);
  });

  test("restore with the state they saved once the user has been out of a call for 30 seconds", async () => {
    const { controller, integrationActions, clock } = setup();
    controller.signal({ type: "entered-call" });
    await settle();

    controller.signal({ type: "left-call" });
    await clock.advance(29_000);
    expect(integrationActions).toEqual(["focus:apply"]);

    await clock.advance(1_000);
    expect(integrationActions).toEqual(["focus:apply", 'focus:restore {"appliedBy":"focus"}']);
  });

  test("stay applied, without restoring and applying again, when the user goes straight into another call", async () => {
    const { controller, integrationActions, clock } = setup();
    controller.signal({ type: "entered-call" });
    await settle();

    controller.signal({ type: "left-call" });
    await clock.advance(10_000);
    controller.signal({ type: "entered-lobby" });
    await clock.advance(10_000);
    controller.signal({ type: "entered-call" });
    await clock.advance(60_000);
    expect(integrationActions).toEqual(["focus:apply"]);

    controller.signal({ type: "left-call" });
    await clock.advance(30_000);
    expect(integrationActions).toEqual(["focus:apply", 'focus:restore {"appliedBy":"focus"}']);
  });

  test("stay applied when the user switches to another meeting with the join meeting Command", async () => {
    const { controller, integrationActions, clock, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    await settle();

    controller.command({ type: "join-meeting", code: "abc-defg-hij" });
    await answerConfirmation(true);
    controller.signal({ type: "left-call" });
    controller.signal({ type: "entered-lobby" });
    await clock.advance(5_000);
    controller.signal({ type: "entered-call" });
    await clock.advance(60_000);

    expect(integrationActions).toEqual(["focus:apply"]);
  });

  test("restore and apply again for a call joined after the 30 seconds", async () => {
    const { controller, integrationActions, clock } = setup();
    controller.signal({ type: "entered-call" });
    await settle();
    controller.signal({ type: "left-call" });
    await clock.advance(30_000);

    controller.signal({ type: "entered-call" });
    await settle();

    expect(integrationActions).toEqual(["focus:apply", 'focus:restore {"appliedBy":"focus"}', "focus:apply"]);
  });
});

describe.each<{ route: string; leave: (context: ReturnType<typeof setup>) => Promise<void> }>([
  {
    // Meet's leave button, being removed and the call ending all reach the controller as the left call signal.
    route: "Meet reports the call is over",
    leave: async ({ controller, clock }) => {
      controller.signal({ type: "left-call" });
      await clock.advance(30_000);
    },
  },
  {
    route: "the user leaves with the leave call Command",
    leave: async ({ controller, clock, answerConfirmation }) => {
      controller.command({ type: "leave-call" });
      await answerConfirmation(true);
      controller.signal({ type: "left-call" });
      await clock.advance(30_000);
    },
  },
  {
    route: "the user closes the Meeting Window",
    leave: async ({ controller, clock, answerConfirmation }) => {
      controller.command({ type: "close-window" });
      await answerConfirmation(true);
      controller.signal({ type: "left-call" });
      await clock.advance(30_000);
    },
  },
  {
    route: "the app quits",
    leave: ({ controller }) => controller.quit(),
  },
])("when $route", ({ leave }) => {
  test("Integrations restore and the Integration Ledger is cleared", async () => {
    const context = setup();
    context.controller.signal({ type: "entered-call" });
    await settle();
    expect(context.ledger.entries).toEqual({ focus: { appliedBy: "focus" } });

    await leave(context);

    expect(context.integrationActions).toEqual(["focus:apply", 'focus:restore {"appliedBy":"focus"}']);
    expect(context.ledger.entries).toEqual({});
  });
});

describe("quitting", () => {
  test("in the 30 seconds after a call restores Integrations straight away", async () => {
    const { controller, integrationActions } = setup();
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "left-call" });

    await controller.quit();

    expect(integrationActions).toEqual(["focus:apply", 'focus:restore {"appliedBy":"focus"}']);
  });

  test("outside a call leaves Integrations alone", async () => {
    const { controller, integrationActions } = setup();

    await controller.quit();

    expect(integrationActions).toEqual([]);
  });
});

describe("Integration failures", () => {
  test("of one Integration to apply leave the call and the other Integrations alone, and are shown as status", async () => {
    const { controller, integrationActions, ledger } = setup({
      integrations: { focus: { failApply: "Shortcut not found" }, slack: {} },
    });

    controller.signal({ type: "entered-call" });
    await settle();

    expect(controller.state).toEqual(inCall());
    expect(integrationActions).toEqual(["focus:apply", "slack:apply"]);
    expect(ledger.entries).toEqual({ slack: { appliedBy: "slack" } });

    expect(controller.integrationFailures).toEqual(["focus wasn't turned on: Shortcut not found"]);
  });

  test("of one Integration to restore leave the other Integrations alone, and keep it in the Integration Ledger", async () => {
    const { controller, integrationActions, ledger } = setup({
      integrations: { focus: { failRestore: "Shortcut not found" }, slack: {} },
    });
    controller.signal({ type: "entered-call" });
    await settle();

    await controller.quit();

    expect(integrationActions).toEqual([
      "focus:apply",
      "slack:apply",
      'focus:restore {"appliedBy":"focus"}',
      'slack:restore {"appliedBy":"slack"}',
    ]);
    expect(ledger.entries).toEqual({ focus: { appliedBy: "focus" } });

    expect(controller.integrationFailures).toEqual(["focus wasn't turned off: Shortcut not found"]);
  });

  test("are announced to listeners, and cleared once the Integration next succeeds", async () => {
    const { controller, clock } = setup({ integrations: { focus: { failRestore: "Shortcut not found" } } });
    const announced: unknown[] = [];
    controller.onIntegrationFailuresChange((failures) => announced.push(failures));
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "left-call" });
    await clock.advance(30_000);

    controller.signal({ type: "entered-call" });
    await settle();

    expect(announced).toEqual([["focus wasn't turned off: Shortcut not found"], []]);
    expect(controller.integrationFailures).toEqual([]);
  });
});

describe("Integration Ledger", () => {
  test("entries left by a crash mid-call are restored on startup, even for Integrations since turned off", async () => {
    const { integrationActions, ledger } = setup({
      integrations: { focus: { enabled: false }, slack: {} },
      ledger: { focus: { appliedBy: "the last launch" } },
    });

    await settle();

    expect(integrationActions).toEqual(['focus:restore {"appliedBy":"the last launch"}']);
    expect(ledger.entries).toEqual({});
  });

  test("entries are restored on startup before a call joined straight away applies", async () => {
    const { controller, integrationActions } = setup({ ledger: { focus: { appliedBy: "the last launch" } } });

    controller.signal({ type: "entered-call" });
    await settle();

    expect(integrationActions).toEqual(['focus:restore {"appliedBy":"the last launch"}', "focus:apply"]);
  });
});

describe("join meeting Command", () => {
  const join = { type: "join-meeting", code: "abc-defg-hij" } as const;

  test("opens the meeting without asking outside a call", () => {
    const { controller, windowActions, pendingConfirmations } = setup();

    controller.command(join);
    controller.signal({ type: "entered-lobby" });
    controller.command(join);

    expect(windowActions).toEqual(["open abc-defg-hij", "open abc-defg-hij"]);
    expect(pendingConfirmations).toHaveLength(0);
  });

  test("opens the meeting during a call once the user confirms", async () => {
    const { controller, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command(join);
    expect(windowActions).toEqual([]);

    await answerConfirmation(true);
    expect(windowActions).toEqual(["open abc-defg-hij"]);
  });

  test("keeps the call going when the user cancels", async () => {
    const { controller, bridgeActions, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });

    controller.command(join);
    await answerConfirmation(false);

    expect(windowActions).toEqual([]);
    expect(bridgeActions).toEqual([]);
    expect(controller.state).toEqual(inCall());
  });

  test("asks only once when another question is already on screen", async () => {
    const { controller, windowActions, pendingConfirmations, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    controller.command({ type: "leave-call" });

    controller.command(join);
    expect(pendingConfirmations).toHaveLength(1);

    await answerConfirmation(true);
    expect(windowActions).toEqual([]);
  });

  test("still opens the meeting when the call ended while the question was on screen", async () => {
    const { controller, windowActions, answerConfirmation } = setup();
    controller.signal({ type: "entered-call" });
    controller.command(join);

    controller.signal({ type: "left-call" });
    await answerConfirmation(true);

    expect(windowActions).toEqual(["open abc-defg-hij"]);
  });
});

describe("toggle Mini Mode Command", () => {
  test("switches the Meeting Window from Full to Mini Mode and back, bringing Full forward", () => {
    const { controller, windowActions } = setup();

    controller.command({ type: "toggle-mini-mode" });
    expect(windowActions).toEqual(["mini"]);

    controller.command({ type: "toggle-mini-mode" });
    expect(windowActions).toEqual(["mini", "full", "show"]);
  });

  test("works in every Meeting State", () => {
    const { controller, windowActions } = setup();

    controller.command({ type: "toggle-mini-mode" });
    controller.signal({ type: "entered-lobby" });
    controller.command({ type: "toggle-mini-mode" });
    controller.signal({ type: "entered-call" });
    controller.command({ type: "toggle-mini-mode" });

    expect(windowActions).toEqual(["mini", "full", "show", "mini"]);
  });
});

describe("Mini Mode when the call ends", () => {
  test("returns the Meeting Window to Full", () => {
    const { controller, windowActions } = setup();
    controller.signal({ type: "entered-call" });
    controller.command({ type: "toggle-mini-mode" });

    controller.signal({ type: "left-call" });

    expect(windowActions).toEqual(["mini", "full"]);
  });

  test("leaves a Full Meeting Window alone", () => {
    const { controller, windowActions } = setup();
    controller.signal({ type: "entered-call" });

    controller.signal({ type: "left-call" });

    expect(windowActions).toEqual([]);
  });

  test("stays on when the user backs out of the lobby", () => {
    const { controller, windowActions } = setup();
    controller.signal({ type: "entered-lobby" });
    controller.command({ type: "toggle-mini-mode" });

    controller.signal({ type: "left-call" });

    expect(windowActions).toEqual(["mini"]);
  });
});

describe("auto Mini Mode", () => {
  test("enters Mini Mode when the user switches to another app during a call", () => {
    const { controller, windowActions } = setup({ autoMiniMode: true });
    controller.signal({ type: "entered-call" });

    controller.switchedAway();

    expect(windowActions).toEqual(["mini"]);
  });

  test("does nothing when the user switches to another app outside a call", () => {
    const { controller, windowActions } = setup({ autoMiniMode: true });

    controller.switchedAway();
    controller.signal({ type: "entered-lobby" });
    controller.switchedAway();
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "left-call" });
    controller.switchedAway();

    expect(windowActions).toEqual([]);
  });

  test("does nothing when the option is off", () => {
    const { controller, windowActions } = setup({ autoMiniMode: false });
    controller.signal({ type: "entered-call" });

    controller.switchedAway();

    expect(windowActions).toEqual([]);
  });

  test("leaves a Meeting Window already in Mini Mode alone", () => {
    const { controller, windowActions } = setup({ autoMiniMode: true });
    controller.signal({ type: "entered-call" });
    controller.command({ type: "toggle-mini-mode" });

    controller.switchedAway();

    expect(windowActions).toEqual(["mini"]);
  });

  test("returns to Full when the call ends", () => {
    const { controller, windowActions } = setup({ autoMiniMode: true });
    controller.signal({ type: "entered-call" });
    controller.switchedAway();

    controller.signal({ type: "left-call" });

    expect(windowActions).toEqual(["mini", "full"]);
  });
});
