const allowedLevels = new Set(["campaign", "adset", "ad"]);
const leadActionTypes = new Set([
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.lead",
  "onsite_conversion.lead_grouped",
]);
const allowedGrantedPermissions = new Set(["ads_read", "public_profile"]);

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return isoDate(new Date(`${value}T12:00:00Z`)) === value;
}

export function metaAdsAccess(role, method) {
  if (!role) return { status: 401, error: "Sign in is required." };
  if (role !== "owner") return { status: 403, error: "Owner access is required." };
  if (method !== "GET") return { status: 405, error: "Meta Ads reporting is read-only." };
  return null;
}

export function validateMetaPermissions(rows) {
  const granted = (Array.isArray(rows) ? rows : [])
    .filter((permission) => permission?.status === "granted")
    .map((permission) => String(permission.permission || ""))
    .filter(Boolean);
  if (!granted.includes("ads_read")) throw new Error("The Meta token must grant ads_read.");
  const disallowed = granted.filter((permission) => !allowedGrantedPermissions.has(permission));
  if (disallowed.length) throw new Error(`The Meta token has permissions this read-only integration does not allow: ${disallowed.join(", ")}.`);
  return granted;
}

export function parseMetaAdsQuery(query, todayIso) {
  const until = String(query.until || todayIso);
  const fallbackSince = new Date(`${until}T12:00:00Z`);
  fallbackSince.setUTCDate(fallbackSince.getUTCDate() - 29);
  const since = String(query.since || isoDate(fallbackSince));
  const level = String(query.level || "campaign");
  if (!validIsoDate(since) || !validIsoDate(until)) throw new Error("Use valid YYYY-MM-DD reporting dates.");
  if (since > until) throw new Error("The start date must be on or before the end date.");
  if (until > todayIso) throw new Error("The reporting end date cannot be in the future.");
  const span = (new Date(`${until}T12:00:00Z`) - new Date(`${since}T12:00:00Z`)) / 86400000;
  if (span > 370) throw new Error("Choose a reporting range of 371 days or fewer.");
  if (!allowedLevels.has(level)) throw new Error("Breakdown must be campaign, ad set, or ad.");
  return { since, until, level };
}

export function metaLeadCount(actions) {
  if (!Array.isArray(actions)) return 0;
  const primary = actions.find((action) => action?.action_type === "lead");
  if (primary) return Number(primary.value || 0);
  return actions.reduce((sum, action) => leadActionTypes.has(action?.action_type) ? sum + Number(action.value || 0) : sum, 0);
}

function numeric(value) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

export function normalizeMetaInsight(row, level) {
  const spend = numeric(row.spend);
  const impressions = numeric(row.impressions);
  const clicks = numeric(row.clicks);
  const leads = metaLeadCount(row.actions);
  const identity = level === "ad" ? [row.ad_id, row.ad_name] : level === "adset" ? [row.adset_id, row.adset_name] : [row.campaign_id, row.campaign_name];
  return {
    id: String(identity[0] || `${row.date_start || "row"}-${identity[1] || level}`),
    name: String(identity[1] || (level === "account" ? row.account_name : `Unnamed ${level}`) || "Meta ads"),
    dateStart: String(row.date_start || ""),
    dateStop: String(row.date_stop || ""),
    spend,
    impressions,
    reach: numeric(row.reach),
    clicks,
    ctr: impressions ? (clicks / impressions) * 100 : numeric(row.ctr),
    cpc: clicks ? spend / clicks : numeric(row.cpc),
    leads,
    costPerLead: leads ? spend / leads : null,
  };
}

function insightsFields(level) {
  const identity = level === "ad" ? "ad_id,ad_name," : level === "adset" ? "adset_id,adset_name," : level === "campaign" ? "campaign_id,campaign_name," : "account_id,account_name,account_currency,";
  return `${identity}date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,actions`;
}

function metaUrl(version, path, params) {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url;
}

async function getMetaJson(url, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = body?.error?.code ? ` (${body.error.code})` : "";
      throw new Error(`Meta reporting request failed${code}: ${body?.error?.message || response.statusText}`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

async function getInsights({ token, version, accountPath, since, until, level, daily = false }) {
  const rows = [];
  let after = "";
  for (let page = 0; page < 5; page += 1) {
    const params = {
      fields: insightsFields(level),
      level,
      time_range: JSON.stringify({ since, until }),
      action_report_time: "conversion",
      limit: 100,
      ...(daily ? { time_increment: 1 } : {}),
      ...(after ? { after } : {}),
    };
    const body = await getMetaJson(metaUrl(version, `${accountPath}/insights`, params), token);
    rows.push(...(Array.isArray(body.data) ? body.data : []));
    after = body?.paging?.cursors?.after || "";
    if (!after || !body?.paging?.next) break;
  }
  return rows;
}

export async function loadMetaAdsReport({ token, accountId, version, since, until, level, refreshedAt = new Date() }) {
  const accountPath = `act_${String(accountId).replace(/^act_/, "")}`;
  const permissionsResponse = await getMetaJson(metaUrl(version, "me/permissions", {}), token);
  const verifiedPermissions = validateMetaPermissions(permissionsResponse.data);
  const [account, summaryRows, trendRows, breakdownRows] = await Promise.all([
    getMetaJson(metaUrl(version, accountPath, { fields: "id,name,currency,timezone_name" }), token),
    getInsights({ token, version, accountPath, since, until, level: "account" }),
    getInsights({ token, version, accountPath, since, until, level: "account", daily: true }),
    getInsights({ token, version, accountPath, since, until, level }),
  ]);
  const summary = normalizeMetaInsight(summaryRows[0] || { date_start: since, date_stop: until, account_name: account.name }, "account");
  const trend = trendRows.map((row) => normalizeMetaInsight(row, "account"));
  const breakdown = breakdownRows.map((row) => normalizeMetaInsight(row, level)).sort((left, right) => right.spend - left.spend);
  const missingData = [];
  if (!summaryRows.length) missingData.push("Meta returned no delivery data for this date range.");
  if ([...summaryRows, ...breakdownRows].every((row) => !Array.isArray(row.actions))) missingData.push("Lead action data was not returned; lead totals and cost per lead may be unavailable.");
  return {
    configured: true,
    readOnly: true,
    permission: "ads_read",
    verifiedPermissions,
    account: { id: String(account.id || accountId).replace(/^act_/, ""), name: account.name || "Powerwashing Pros", currency: account.currency || "USD" },
    range: { since, until },
    level,
    summary,
    trend,
    breakdown,
    reporting: {
      timezone: account.timezone_name || "Meta ad account timezone unavailable",
      lastSuccessfulRefresh: refreshedAt.toISOString(),
      delayNotice: "Meta may revise conversion and lead results as attributed events are received and processed.",
      missingData,
    },
  };
}
