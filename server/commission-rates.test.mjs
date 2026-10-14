import assert from "node:assert/strict";
import test from "node:test";
import { commissionRateForService, serviceCommissionCategory } from "./commission-rates.mjs";

const darnell = {
  base_commission_pct: 0.20,
  pressure_washing_commission_pct: 0.31,
  window_washing_commission_pct: 0.22,
};

test("classifies the two Upcoming Jobs dropdown values", () => {
  assert.equal(serviceCommissionCategory("Pressure washing"), "pressure-washing");
  assert.equal(serviceCommissionCategory("Window washing"), "window-washing");
});

test("uses Darnell's pressure-washing and window-washing rates", () => {
  assert.equal(commissionRateForService("Pressure washing", darnell), 0.31);
  assert.equal(commissionRateForService("Window washing", darnell), 0.22);
});

test("recognizes common pressure-washing descriptions and safely falls back for unknown services", () => {
  assert.equal(commissionRateForService("Driveway + sidewalks", darnell), 0.31);
  assert.equal(commissionRateForService("Interior cleaning", darnell), 0.20);
});
