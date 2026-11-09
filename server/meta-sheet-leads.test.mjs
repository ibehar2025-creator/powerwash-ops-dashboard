import test from "node:test";
import assert from "node:assert/strict";
import { fetchMetaSheetLeads } from "./meta-sheet-leads.mjs";

test("requests Meta leads using a server-side secret", async () => {
  let request;
  const leads = await fetchMetaSheetLeads("https://example.test", "secret", async (url, options) => {
    request = { url, ...options };
    return new Response(JSON.stringify({ ok: true, leads: [{ id: "meta-123", name: "Test" }] }));
  });
  assert.equal(JSON.parse(request.body).secret, "secret");
  assert.equal(JSON.parse(request.body).action, "readMetaLeads");
  assert.equal(leads[0].id, "meta-123");
});

test("rejects errors and malformed data", async () => {
  await assert.rejects(fetchMetaSheetLeads("https://example.test", "secret", async () => new Response("{}", { status: 403 })));
  await assert.rejects(fetchMetaSheetLeads("https://example.test", "secret", async () => new Response('{"ok":true}')));
});
