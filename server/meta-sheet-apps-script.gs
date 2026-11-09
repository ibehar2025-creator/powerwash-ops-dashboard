// Add this function to the existing Sheets sync project. The existing doPost
// must route action "readMetaLeads" to readMetaLeads_(body), before its other actions.
// Store a strong, unique shared secret in Script Properties as META_SHEET_SYNC_SECRET.
function readMetaLeads_(body) {
  const secret = PropertiesService.getScriptProperties().getProperty("META_SHEET_SYNC_SECRET");
  if (!secret || typeof body.secret !== "string" || body.secret !== secret) {
    return { ok: false, error: "Not authorized." };
  }
  const sheet = SpreadsheetApp.openById("1iVZKEVHcpGu2MR70peY3ty2ngHSk8ZQotI_GOYcO3kc").getSheetByName("Sheet1");
  if (!sheet) throw new Error("Meta leads sheet not found.");
  const rows = sheet.getDataRange().getDisplayValues();
  const header = (rows.shift() || []).map(value => String(value).trim().toLowerCase());
  const index = name => header.indexOf(name);
  if (["id", "full_name", "email", "phone_number"].some(name => index(name) < 0)) {
    throw new Error("Meta leads sheet is missing required columns.");
  }
  const value = (row, name) => index(name) >= 0 ? String(row[index(name)] || "").trim() : "";
  const leads = rows.filter(row => /^\d+$/.test(value(row, "id"))).map(row => {
    const questions = ["which_neighborhood?", "how_many_stories?", "about_how_many_windows?", "how_soon_do_you_want_it_done?"];
    return {
      id: "meta-" + value(row, "id"),
      name: value(row, "full_name") || "Meta lead",
      contact: [value(row, "phone_number"), value(row, "email")].filter(Boolean).join(" | "),
      address: "",
      source: "Meta Ads",
      status: "new",
      estimatedValue: 0,
      followUpDate: "",
      notes: questions.filter(name => value(row, name)).map(name => name.replace(/_/g, " ") + ": " + value(row, name)).join("\n"),
    };
  });
  return { ok: true, leads: leads };
}
