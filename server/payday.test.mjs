import assert from "node:assert/strict";
import test from "node:test";
import { previousWeeklyPayPeriod } from "./payday.mjs";

test("Tuesday payday covers the preceding Monday through Sunday", () => {
  assert.deepEqual(previousWeeklyPayPeriod("2026-09-15"), {
    periodStart: "2026-09-07",
    periodEnd: "2026-09-13",
    payday: "2026-09-15",
  });
});
