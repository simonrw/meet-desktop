import { describe, expect, test } from "vitest";

import { restorableBounds } from "./window-bounds";

const LAPTOP = { x: 0, y: 25, width: 1512, height: 920 };

describe("restorableBounds", () => {
  test("restores bounds that sit on a connected display", () => {
    const saved = { x: 100, y: 120, width: 1000, height: 700 };

    expect(restorableBounds(saved, [LAPTOP])).toEqual(saved);
  });

  test("forgets bounds left on a display that is no longer connected", () => {
    const onExternalMonitor = { x: 1600, y: 100, width: 1000, height: 700 };

    expect(restorableBounds(onExternalMonitor, [LAPTOP])).toBeUndefined();
  });

  test("restores onto a secondary display", () => {
    const external = { x: 1512, y: 0, width: 2560, height: 1415 };
    const onExternalMonitor = { x: 1600, y: 100, width: 1000, height: 700 };

    expect(restorableBounds(onExternalMonitor, [LAPTOP, external])).toEqual(onExternalMonitor);
  });

  test("ignores saved data that is not a rectangle", () => {
    expect(restorableBounds(undefined, [LAPTOP])).toBeUndefined();
    expect(restorableBounds("garbage", [LAPTOP])).toBeUndefined();
    expect(restorableBounds({ x: 100, y: 100, width: "wide", height: 700 }, [LAPTOP])).toBeUndefined();
  });

  test("keeps only the rectangle from saved data", () => {
    const saved = { x: 100, y: 120, width: 1000, height: 700, extra: true };

    expect(restorableBounds(saved, [LAPTOP])).toEqual({ x: 100, y: 120, width: 1000, height: 700 });
  });
});
