import assert from "node:assert/strict";
import test from "node:test";
import { metaAdsAccess, metaLeadCount, normalizeMetaInsight, parseMetaAdsQuery, validateMetaPermissions } from "./meta-ads.mjs";

test("Meta reporting rejects unauthenticated, employee, and mutation requests", () => {
  assert.equal(metaAdsAccess(undefined, "GET").status, 401);
  assert.equal(metaAdsAccess("employee", "GET").status, 403);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(metaAdsAccess("owner", method).status, 405);
  assert.equal(metaAdsAccess("owner", "GET"), null);
});

test("Meta query accepts only allowlisted levels and bounded dates", () => {
  assert.deepEqual(parseMetaAdsQuery({ since: "2026-09-01", until: "2026-09-20", level: "adset" }, "2026-09-20"), { since: "2026-09-01", until: "2026-09-20", level: "adset" });
  assert.throws(() => parseMetaAdsQuery({ level: "account" }, "2026-09-20"), /campaign, ad set, or ad/i);
  assert.throws(() => parseMetaAdsQuery({ since: "2026-09-21", until: "2026-09-20" }, "2026-09-20"), /start date/i);
  assert.throws(() => parseMetaAdsQuery({ since: "2026-09-01", until: "2026-09-21" }, "2026-09-20"), /future/i);
});

test("Meta token permissions are limited to read-only reporting", () => {
  assert.deepEqual(validateMetaPermissions([{ permission: "ads_read", status: "granted" }, { permission: "public_profile", status: "granted" }]), ["ads_read", "public_profile"]);
  assert.throws(() => validateMetaPermissions([{ permission: "ads_management", status: "granted" }, { permission: "ads_read", status: "granted" }]), /does not allow: ads_management/i);
  assert.throws(() => validateMetaPermissions([{ permission: "public_profile", status: "granted" }]), /must grant ads_read/i);
});

test("lead and cost metrics are derived without double-counting Meta action variants", () => {
  assert.equal(metaLeadCount([{ action_type: "lead", value: "4" }, { action_type: "offsite_conversion.fb_pixel_lead", value: "4" }]), 4);
  const row = normalizeMetaInsight({ campaign_id: "1", campaign_name: "Leads", spend: "100", impressions: "2000", reach: "1500", clicks: "50", actions: [{ action_type: "lead", value: "4" }] }, "campaign");
  assert.equal(row.ctr, 2.5);
  assert.equal(row.cpc, 2);
  assert.equal(row.costPerLead, 25);
});
