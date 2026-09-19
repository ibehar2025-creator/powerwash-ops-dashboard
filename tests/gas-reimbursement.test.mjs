import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../server/index.mjs", import.meta.url), "utf8");
const amounts = source.slice(source.indexOf("function earningAmounts("), source.indexOf("const toEarning"));
const payroll = source.slice(source.indexOf("async function eligiblePayrollLines("), source.indexOf("const toCalendarEvent"));
const context = vm.createContext({ isoDateValue: (value) => value });
vm.runInContext(amounts + payroll, context);
const row = {
  job_id: "test-job", employee_id: "test-employee", earning_id: "test-earning",
  original_job_price: 250, base_commission_pct: 0.22, upsell_amount: 100,
  upsell_commission_pct: 0.30, tip_amount: 20, tip_share_pct: 1,
  gas_cost: 12.75, work_date: "2026-09-19",
};

test("gas is reimbursed in full without changing commissions", () => {
  const result = context.earningAmounts(row);
  assert.equal(result.baseEarnings, 55);
  assert.equal(result.upsellEarnings, 30);
  assert.equal(result.totalEarnings, 117.75);
  assert.equal(context.earningAmounts({ ...row, gas_cost: undefined }).totalEarnings, 105);
});

test("weekly pay includes a separate reimbursement and matches Team total", async () => {
  const db = { query: async (sql) => {
    if (sql.includes("select j.id")) {
      assert.match(sql, /es.status = 'approved'/);
      return { rows: [row] };
    }
    if (sql.includes("count(*)")) return { rows: [{ count: 0 }] };
    return { rows: [] };
  } };
  const result = await context.eligiblePayrollLines(db, "2026-09-20");
  assert.equal(result.lines.find((line) => line.lineType === "gas_reimbursement").amount, 12.75);
  assert.equal(result.lines.reduce((sum, line) => sum + line.amount, 0), context.earningAmounts(row).totalEarnings);
});

test("gas already included in a payroll run cannot be reimbursed twice", async () => {
  const db = { query: async (sql, params) => {
    if (sql.includes("select j.id")) return { rows: [row] };
    if (sql.includes("count(*)")) return { rows: [{ count: 0 }] };
    return { rows: params[0].endsWith(":gas_reimbursement") ? [{ exists: 1 }] : [] };
  } };
  const result = await context.eligiblePayrollLines(db, "2026-09-20");
  assert.equal(result.lines.some((line) => line.lineType === "gas_reimbursement"), false);
});
