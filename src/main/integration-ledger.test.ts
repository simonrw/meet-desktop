import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, expect, test } from "vitest";

import { fileLedger } from "./integration-ledger";

let file: string;

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), "integration-ledger-")), "integration-ledger.json");
});

test("reads back the entries last written, including ones saving no state", () => {
  fileLedger(file).write({ focus: null, slack: { status: "Lunch", emoji: ":sandwich:" } });

  expect(fileLedger(file).read()).toEqual({ focus: null, slack: { status: "Lunch", emoji: ":sandwich:" } });
});

test("is empty when nothing has been written", () => {
  expect(fileLedger(file).read()).toEqual({});
});

test("is empty when the file is corrupt", () => {
  writeFileSync(file, "{ not json");

  expect(fileLedger(file).read()).toEqual({});
});

test("is empty when the file holds something other than entries", () => {
  writeFileSync(file, JSON.stringify(["focus"]));

  expect(fileLedger(file).read()).toEqual({});
});
