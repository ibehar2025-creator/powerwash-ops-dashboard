export async function fetchMetaSheetLeads(syncUrl, secret, fetchImpl = fetch) {
  const response = await fetchImpl(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "readMetaLeads", secret }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Meta lead sync failed (${response.status})`);
  const payload = await response.json();
  if (payload?.ok !== true || !Array.isArray(payload.leads)) throw new Error("Meta lead sync returned an invalid response.");
  return payload.leads;
}
