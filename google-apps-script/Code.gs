const SPREADSHEET_ID = "19LNiR-1HTfT8wwdAZtGnqXlCJh6y-HbxeuqZuo95p2Q";
const UPCOMING_JOBS_TAB = "Upcoming Jobs";

function doPost(e) {
  const body = JSON.parse(e.postData.contents || "{}");

  if (body.action === "addUpcomingJob") {
    const row = body.row || {};
    appendUpcomingJob(row);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: false, error: "Unknown action." });
}

function appendUpcomingJob(row) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(UPCOMING_JOBS_TAB);
  if (!sheet) throw new Error(`Missing tab: ${UPCOMING_JOBS_TAB}`);
  const dateText = formatJobDate(row.date, row.time);
  const notes = [row.notes || row.serviceType || "", row.phone ? `Phone: ${row.phone}` : ""].filter(Boolean).join(" | ");

  sheet.appendRow([
    row.name || "",
    row.address || "",
    dateText,
    row.price || "",
    "Incomplete",
    notes,
    "",
    dateText,
    "",
    "",
    "",
  ]);
}

function formatJobDate(date, time) {
  if (!date) return "";
  if (!time) return date;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date} ${time}`;
  return Utilities.formatDate(parsed, "America/Chicago", "yyyy-MM-dd h:mm a");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
