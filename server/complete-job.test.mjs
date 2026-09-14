import assert from "node:assert/strict";
import test from "node:test";
import { completeJobAfterEarnings } from "./complete-job.mjs";

test("earnings submission completes the same job in Sheets and the database", async () => {
  const databaseCalls = [];
  const sheetCalls = [];
  const db = {
    async query(sql, params) {
      databaseCalls.push({ sql, params });
      if (sql.startsWith("select price")) return { rows: [{ price: "250.00" }] };
      return { rows: [] };
    },
  };

  const result = await completeJobAfterEarnings({
    db,
    jobId: "test-job-123",
    updateSheet: async (action, payload) => sheetCalls.push({ action, payload }),
  });

  assert.deepEqual(result, { status: "completed", paymentStatus: "paid", amountPaid: 250 });
  assert.deepEqual(sheetCalls, [{
    action: "updateJob",
    payload: { jobId: "test-job-123", status: "completed", paymentStatus: "paid", amountPaid: 250 },
  }]);
  assert.equal(databaseCalls.length, 2);
  assert.match(databaseCalls[1].sql, /status = 'completed'/);
  assert.match(databaseCalls[1].sql, /payment_status = 'paid'/);
  assert.deepEqual(databaseCalls[1].params, ["test-job-123"]);
});

test("a missing job cannot create a false completion", async () => {
  let sheetWasCalled = false;
  const db = { query: async () => ({ rows: [] }) };

  await assert.rejects(
    completeJobAfterEarnings({ db, jobId: "missing-job", updateSheet: async () => { sheetWasCalled = true; } }),
    /assigned job was not found/i,
  );
  assert.equal(sheetWasCalled, false);
});
