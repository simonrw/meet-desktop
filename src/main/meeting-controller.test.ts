import { describe, expect, test } from "vitest";

import { createMeetingController } from "./meeting-controller";

function setup() {
  const bridgeActions: string[] = [];
  const controller = createMeetingController({
    meetBridge: { toggleMute: () => bridgeActions.push("toggle-mute") },
  });

  return { controller, bridgeActions };
}

describe("Meeting State", () => {
  test("follows the user from the Meet home screen through the lobby into a call and back", () => {
    const { controller } = setup();

    expect(controller.state).toEqual({ status: "idle" });

    controller.signal({ type: "entered-lobby" });
    expect(controller.state).toEqual({ status: "lobby" });

    controller.signal({ type: "entered-call" });
    expect(controller.state).toEqual({ status: "in-call", muted: false });

    controller.signal({ type: "left-call" });
    expect(controller.state).toEqual({ status: "idle" });
  });

  test("reflects mute changes made inside Meet during a call", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });

    controller.signal({ type: "mute-changed", muted: true });
    expect(controller.state).toEqual({ status: "in-call", muted: true });

    controller.signal({ type: "mute-changed", muted: false });
    expect(controller.state).toEqual({ status: "in-call", muted: false });
  });

  test("carries the mute chosen in the lobby into the call", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-lobby" });
    controller.signal({ type: "mute-changed", muted: true });

    controller.signal({ type: "entered-call" });

    expect(controller.state).toEqual({ status: "in-call", muted: true });
  });

  test("does not carry mute over from one call to the next", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "left-call" });

    controller.signal({ type: "entered-call" });

    expect(controller.state).toEqual({ status: "in-call", muted: false });
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
    expect(controller.state).toEqual({ status: "in-call", muted: true });
  });

  test("starts a call joined without a lobby with the mute Meet reported for it", () => {
    const { controller } = setup();

    controller.signal({ type: "mute-changed", muted: true });
    controller.signal({ type: "entered-call" });

    expect(controller.state).toEqual({ status: "in-call", muted: true });
  });
});

describe("toggle mute Command", () => {
  test("toggles the microphone through the Meet Bridge during a call", () => {
    const { controller, bridgeActions } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "toggle-mute" });

    expect(bridgeActions).toEqual(["toggle-mute"]);
  });

  test("leaves the Meeting State alone until Meet reports the mute change", () => {
    const { controller } = setup();
    controller.signal({ type: "entered-call" });

    controller.command({ type: "toggle-mute" });

    expect(controller.state).toEqual({ status: "in-call", muted: false });
  });

  test("does nothing outside a call", () => {
    const { controller, bridgeActions } = setup();

    controller.command({ type: "toggle-mute" });
    controller.signal({ type: "entered-lobby" });
    controller.command({ type: "toggle-mute" });
    controller.signal({ type: "entered-call" });
    controller.signal({ type: "left-call" });
    controller.command({ type: "toggle-mute" });

    expect(bridgeActions).toEqual([]);
  });
});
