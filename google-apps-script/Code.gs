const SPREADSHEET_ID = "19LNiR-1HTfT8wwdAZtGnqXlCJh6y-HbxeuqZuo95p2Q";
const UPCOMING_JOBS_TAB = "Upcoming Jobs";
const RECURRING_JOBS_TAB = "Recurring Jobs";

function doPost(e) {
  const body = JSON.parse(e.postData.contents || "{}");

  if (body.action === "addUpcomingJob") {
    const row = body.row || {};
    appendUpcomingJob(row);
    return jsonResponse({ ok: true });
  }

  if (body.action === "updateJob") {
    updateJob(body);
    return jsonResponse({ ok: true });
  }

  if (body.action === "updateJobPhotos") {
    updateJob({ rowNumber: body.rowNumber, patch: body.photos || {} });
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
    "unpaid",
    0,
    0,
    "other",
    new Date().toISOString(),
  ]);
}

function formatJobDate(date, time) {
  if (!date) return "";
  if (!time) return date;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return `${date} ${time}`;
  return Utilities.formatDate(parsed, "America/Chicago", "yyyy-MM-dd h:mm a");
}

function updateJob(body) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(UPCOMING_JOBS_TAB);
  if (!sheet) throw new Error(`Missing tab: ${UPCOMING_JOBS_TAB}`);

  const rowNumber = Number(body.rowNumber);
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error("Could not match that job to a row in Upcoming Jobs.");
  }

  const patch = body.patch || {};
  const now = new Date().toISOString();

  if (Object.prototype.hasOwnProperty.call(patch, "price")) {
    sheet.getRange(rowNumber, 4).setValue(Number(patch.price) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "status")) {
    sheet.getRange(rowNumber, 5).setValue(displayJobStatus(patch.status));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "beforePhoto")) {
    sheet.getRange(rowNumber, 10).setValue(patch.beforePhoto || "");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "afterPhoto")) {
    sheet.getRange(rowNumber, 11).setValue(patch.afterPhoto || "");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "paymentStatus")) {
    sheet.getRange(rowNumber, 12).setValue(normalizePaymentStatus(patch.paymentStatus));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "amountPaid")) {
    sheet.getRange(rowNumber, 13).setValue(Number(patch.amountPaid) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "tipAmount")) {
    sheet.getRange(rowNumber, 14).setValue(Number(patch.tipAmount) || 0);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "paymentMethod")) {
    sheet.getRange(rowNumber, 15).setValue(normalizePaymentMethod(patch.paymentMethod));
  }
  if (Object.keys(patch).length) {
    sheet.getRange(rowNumber, 16).setValue(now);
  }
}

function displayJobStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "completed") return "Complete";
  if (normalized === "past due") return "Past due";
  if (normalized === "in progress") return "In progress";
  if (normalized === "canceled") return "Canceled";
  return "Incomplete";
}

function readServicePlans() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RECURRING_JOBS_TAB);
  if (!sheet) throw new Error(`Missing tab: ${RECURRING_JOBS_TAB}`);
  const values = sheet.getDataRange().getDisplayValues();
  const rows = values.slice(1).filter((row) => row[0]);

  return rows.map((row, index) => {
    const name = row[0] || "";
    const price = Number(String(row[1] || "").replace(/[^0-9.]/g, "")) || 0;
    const frequency = row[2] || "monthly";
    const renewalDate = row[3] || "Not listed";
    const phone = row[4] || "";
    const services = String(row[5] || "Recurring power washing")
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const paymentStatus = normalizePaymentStatus(row[6]);
    const customerId = `recurring-c-${String(index + 1).padStart(3, "0")}`;

    return {
      id: `sp-${String(index + 1).padStart(3, "0")}`,
      type: planTypeFromFrequency(frequency),
      customerId,
      customer: {
        id: customerId,
        name,
        phone,
        email: "",
        address: "",
        notes: `Imported directly from Recurring Jobs. Frequency: ${frequency}.`,
        subscribedPlanId: `sp-${String(index + 1).padStart(3, "0")}`,
        insights: ["repeat customer"],
      },
      discountPct: 0,
      renewalDate,
      servicesIncluded: services.length ? services.concat(frequency) : ["Recurring power washing", frequency],
      price,
      paymentStatus,
      notes: row[7] || `Imported from Recurring Jobs sheet: ${name}, $${price}, ${frequency}, next predicted date ${renewalDate}.`,
    };
  });
}

function planTypeFromFrequency(frequency) {
  const normalized = String(frequency || "").toLowerCase();
  if (normalized.includes("6 week")) return "6-week";
  if (normalized.includes("3 month")) return "3-month";
  if (normalized.includes("6 month")) return "6-month";
  if (normalized.includes("year")) return "yearly";
  return "monthly";
}

function normalizePaymentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["paid", "unpaid", "partially paid", "past due"].indexOf(normalized) >= 0) return normalized;
  return "unpaid";
}

function normalizePaymentMethod(value) {
  const normalized = String(value || "").trim();
  if (["Zelle", "cash", "card", "check", "other"].indexOf(normalized) >= 0) return normalized;
  return "other";
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
