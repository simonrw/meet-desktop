import { describe, expect, test } from "vitest";

import { createMeetingController, type Command } from "./meeting-controller";

function setup() {
  const bridgeActions: string[] = [];
  const windowActions: string[] = [];
  const pendingConfirmations: Array<(confirmed: boolean) => void> = [];
  const announcedStates: unknown[] = [];

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
      confirmLeave: () => new Promise((resolve) => pendingConfirmations.push(resolve)),
    },
  });
  controller.onStateChange((state) => announcedStates.push(state));

  /**
   * Answers the oldest leave confirmation still on screen, and waits for the controller to act on the answer.
   */
  async function answerConfirmation(confirmed: boolean) {
    pendingConfirmations.shift()?.(confirmed);

    await new Promise((resolve) => setTimeout(resolve));
  }

  return { controller, bridgeActions, windowActions, pendingConfirmations, announcedStates, answerConfirmation };
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

describe.each<Command["type"]>(["toggle-mute", "toggle-camera", "toggle-hand"])("%s Command", (type) => {
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
