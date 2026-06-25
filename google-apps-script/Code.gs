const SPREADSHEET_ID = "19LNiR-1HTfT8wwdAZtGnqXlCJh6y-HbxeuqZuo95p2Q";
const REVIEWS_SHEET_ID = "1x4MrwSPwwn_bqNP__skWQGcUtxSH88vtag1VesWUbRU";
const UPCOMING_JOBS_TAB = "Upcoming Jobs";
const CHECK_UPS_TAB = "Check-Ups";
const RECURRING_JOBS_TAB = "Recurring Jobs";
const EXPENSES_TAB = "Expenses";
const TIME_ZONE = "America/Chicago";

function doGet() {
  return jsonResponse(readPayload());
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || "{}");

    if (body.action === "addUpcomingJob") {
      appendUpcomingJob(body.row || {});
      return jsonResponse(Object.assign({ ok: true }, readPayload()));
    }

    if (body.action === "addServicePlan") {
      appendServicePlan(body.row || {});
      return jsonResponse(Object.assign({ ok: true }, readPayload()));
    }

    if (body.action === "updateJob") {
      updateJob(body);
      return jsonResponse({ ok: true });
    }

    if (body.action === "updateJobLocation") {
      updateJobLocation(body);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "Unknown action." });
  } catch (error) {
    return jsonResponse({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function readPayload() {
  const jobsSheet = getSheet(SPREADSHEET_ID, [UPCOMING_JOBS_TAB, "Sheet1"]);
  const jobData = readJobs(jobsSheet);
  return {
    customers: jobData.customers,
    jobs: jobData.jobs,
    invoices: buildInvoices(jobData.jobs),
    expenses: readExpenses(),
    leads: readLeads(),
    servicePlans: readServicePlans(),
    reviews: readReviews(),
  };
}

function readJobs(sheet) {
  const displayValues = sheet.getDataRange().getDisplayValues();
  const rawValues = sheet.getDataRange().getValues();
  const customers = [];
  const jobs = [];

  for (let rowIndex = 1; rowIndex < displayValues.length; rowIndex += 1) {
    const row = displayValues[rowIndex];
    const rawRow = rawValues[rowIndex];
    const name = clean(row[0]);
    const address = clean(row[1]);
    const dateInfo = parseJobDate(rawRow[2], row[2] || row[7]);
    const price = money(row[3]);
    const notes = clean(row[5]);

    if (!name) continue;

    const index = jobs.length + 1;
    const customerId = "sheet-c-" + String(index).padStart(3, "0");
    const jobId = "sheet-job-" + String(index).padStart(3, "0");
    const status = normalizeJobStatus(row[4]);
    const paymentStatus = normalizePaymentStatus(row[11]) || (status === "completed" ? "paid" : "unpaid");
    const amountPaid = hasValue(row[12]) ? money(row[12]) : (paymentStatus === "paid" ? price : 0);
    const tipAmount = money(row[13]);

    customers.push({
      id: customerId,
      name: name,
      phone: phoneFromNotes(notes),
      email: "",
      address: address,
      notes: "Imported from Upcoming Jobs. Original date: " + clean(row[2] || row[7]) + ". " + (notes || "No notes in spreadsheet."),
      insights: status === "completed" ? ["repeat customer"] : ["inactive customer"],
    });

    jobs.push({
      id: jobId,
      rowNumber: rowIndex + 1,
      date: dateInfo.date || todayString(),
      time: dateInfo.time || "09:00",
      customerId: customerId,
      address: address,
      serviceType: notes || "Pressure washing service",
      status: status,
      crewIds: [],
      price: price,
      amountPaid: amountPaid,
      tipAmount: tipAmount,
      paymentStatus: paymentStatus,
      paymentMethod: normalizePaymentMethod(row[14]),
      notes: "Spreadsheet status: " + (clean(row[4]) || "blank") + ". Original date: " + clean(row[2] || row[7]) + ".",
      lat: numberOrUndefined(row[9]),
      lng: numberOrUndefined(row[10]),
      source: "spreadsheet-import",
    });
  }

  return { customers: customers, jobs: jobs };
}

function buildInvoices(jobs) {
  return jobs.map((job, index) => ({
    id: "inv-sheet-" + String(index + 1).padStart(3, "0"),
    customerId: job.customerId,
    jobId: job.id,
    serviceDescription: job.serviceType,
    price: job.price,
    discount: 0,
    tip: job.tipAmount,
    paymentMethod: job.paymentMethod,
    status: job.paymentStatus,
    amountPaid: job.amountPaid + job.tipAmount,
    dueDate: job.date,
    issuedDate: job.date,
  }));
}

function readServicePlans() {
  try {
    const sheet = getSheet(SPREADSHEET_ID, [RECURRING_JOBS_TAB]);
    const values = sheet.getDataRange().getDisplayValues();
    const rows = values.slice(1).filter(row => isActiveServicePlanRow(row));

    return rows.map((row, index) => {
      const name = clean(row[0]);
      const price = money(row[1]);
      const frequency = clean(row[2]) || "monthly";
      const renewalDate = clean(row[3]) || "Not listed";
      const phone = clean(row[4]);
      const services = splitServices(row[5] || "Recurring power washing");
      const paymentStatus = normalizePaymentStatus(row[6]);
      const customerId = "recurring-c-" + String(index + 1).padStart(3, "0");
      const planId = "sp-" + String(index + 1).padStart(3, "0");

      return {
        id: planId,
        type: planTypeFromFrequency(frequency),
        customerId: customerId,
        customer: {
          id: customerId,
          name: name,
          phone: phone,
          email: "",
          address: "",
          notes: "Imported directly from Recurring Jobs. Frequency: " + frequency + ".",
          subscribedPlanId: planId,
          insights: ["repeat customer"],
        },
        discountPct: 0,
        renewalDate: renewalDate,
        servicesIncluded: services.length ? services.concat(frequency) : ["Recurring power washing", frequency],
        price: price,
        paymentStatus: paymentStatus,
        notes: clean(row[7]) || "Imported from Recurring Jobs sheet: " + name + ", $" + price + ", " + frequency + ", next predicted date " + renewalDate + ".",
      };
    });
  } catch (error) {
    return [];
  }
}

function readExpenses() {
  try {
    const sheet = getSheet(SPREADSHEET_ID, [EXPENSES_TAB]);
    const values = sheet.getDataRange().getDisplayValues();
    return values.slice(1).filter(row => clean(row[0]) || clean(row[1]) || money(row[3])).map((row, index) => ({
      id: "expense-sheet-" + String(index + 1).padStart(3, "0"),
      date: normalizeDateText(row[0]) || todayString(),
      category: clean(row[1]) || "General",
      vendor: clean(row[2]),
      amount: money(row[3]),
      notes: clean(row[4]),
    }));
  } catch (error) {
    return [];
  }
}

function readLeads() {
  try {
    const sheet = getSheet(SPREADSHEET_ID, [CHECK_UPS_TAB]);
    const values = sheet.getDataRange().getDisplayValues();
    return values.slice(1).filter(row => clean(row[0]) || clean(row[1]) || clean(row[2]) || clean(row[3])).map((row, index) => {
      const name = clean(row[0]) || "Unknown";
      const address = clean(row[1]);
      const dateText = clean(row[2]);
      const probability = clean(row[3]);
      return {
        id: "lead-checkup-" + String(index + 1).padStart(3, "0"),
        name: name,
        contact: "",
        address: address,
        source: "Check-Ups sheet",
        status: leadStatusFromProbability(probability),
        estimatedValue: estimatedLeadValue(probability),
        followUpDate: leadFollowUpDate(dateText),
        notes: (dateText || "No date listed") + " check-up" + (probability ? " probability " + probability : ", probability blank in sheet") + ".",
      };
    });
  } catch (error) {
    return [];
  }
}

function leadStatusFromProbability(probability) {
  const numeric = Number(clean(probability).replace(/[^0-9.]/g, ""));
  return numeric >= 70 ? "contacted" : "new";
}

function estimatedLeadValue(probability) {
  const numeric = Number(clean(probability).replace(/[^0-9.]/g, ""));
  if (numeric >= 70) return 250;
  if (numeric > 0) return 175;
  return 0;
}

function leadFollowUpDate(value) {
  const normalized = normalizeDateText(value);
  if (normalized) return normalized;

  const text = clean(value).toLowerCase();
  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  for (const monthName in months) {
    if (text.indexOf(monthName) >= 0) {
      return isoDate(new Date().getFullYear(), months[monthName], 1);
    }
  }

  return todayString();
}

function readReviews() {
  try {
    const sheet = getSheet(REVIEWS_SHEET_ID, ["Sheet1", "Powerwashing reviews", "Reviews"]);
    const values = sheet.getDataRange().getValues();
    return values.slice(1).filter(row => clean(row[1]) || clean(row[3])).map((row, index) => ({
      id: "sheet-review-" + String(index + 1),
      submittedAt: row[0] instanceof Date ? row[0].toISOString() : clean(row[0]) || new Date().toISOString(),
      name: clean(row[1]) || "Customer",
      rating: Number(row[2]) || 5,
      review: clean(row[3]),
      source: "spreadsheet-import",
    }));
  } catch (error) {
    return [];
  }
}

function appendUpcomingJob(row) {
  const sheet = getSheet(SPREADSHEET_ID, [UPCOMING_JOBS_TAB]);
  const dateText = formatJobDate(row.date, row.time);
  const notes = [row.notes || row.serviceType || "", row.phone ? "Phone: " + row.phone : ""].filter(Boolean).join(" | ");

  sheet.appendRow([
    clean(row.name),
    clean(row.address),
    dateText,
    money(row.price),
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

function appendServicePlan(row) {
  const sheet = getSheet(SPREADSHEET_ID, [RECURRING_JOBS_TAB]);
  sheet.appendRow([
    clean(row.name),
    money(row.price),
    clean(row.frequency) || "Monthly",
    clean(row.renewalDate),
    clean(row.phone),
    clean(row.servicesIncluded) || "Recurring power washing",
    normalizePaymentStatus(row.paymentStatus),
    clean(row.notes),
  ]);
}

function updateJob(body) {
  const sheet = getSheet(SPREADSHEET_ID, [UPCOMING_JOBS_TAB]);
  const rowNumber = Number(body.rowNumber);
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error("Could not match that job to a row in Upcoming Jobs.");
  }

  const patch = body.patch || {};
  const now = new Date().toISOString();

  if (has(patch, "price")) sheet.getRange(rowNumber, 4).setValue(money(patch.price));
  if (has(patch, "status")) sheet.getRange(rowNumber, 5).setValue(displayJobStatus(patch.status));
  if (has(patch, "paymentStatus")) sheet.getRange(rowNumber, 12).setValue(normalizePaymentStatus(patch.paymentStatus));
  if (has(patch, "amountPaid")) sheet.getRange(rowNumber, 13).setValue(money(patch.amountPaid));
  if (has(patch, "tipAmount")) sheet.getRange(rowNumber, 14).setValue(money(patch.tipAmount));
  if (has(patch, "paymentMethod")) sheet.getRange(rowNumber, 15).setValue(normalizePaymentMethod(patch.paymentMethod));
  if (Object.keys(patch).length) sheet.getRange(rowNumber, 16).setValue(now);
}

function updateJobLocation(body) {
  const sheet = getSheet(SPREADSHEET_ID, [UPCOMING_JOBS_TAB]);
  const rowNumber = Number(body.rowNumber);
  if (!rowNumber || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error("Could not match that job to a row in Upcoming Jobs.");
  }
  const location = body.location || {};
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Location must include numeric lat and lng.");
  }
  sheet.getRange(rowNumber, 10).setValue(lat);
  sheet.getRange(rowNumber, 11).setValue(lng);
  sheet.getRange(rowNumber, 16).setValue(new Date().toISOString());
}

function getSheet(spreadsheetId, names) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  for (const name of names) {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet) return sheet;
  }
  throw new Error("Missing tab: " + names.join(" or "));
}

function parseJobDate(rawValue, displayValue) {
  if (rawValue instanceof Date && !Number.isNaN(rawValue.getTime())) {
    return {
      date: Utilities.formatDate(rawValue, TIME_ZONE, "yyyy-MM-dd"),
      time: Utilities.formatDate(rawValue, TIME_ZONE, "HH:mm"),
    };
  }

  const text = clean(displayValue);
  const parsed = new Date(text);
  const time = timeFromText(text);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      date: Utilities.formatDate(parsed, TIME_ZONE, "yyyy-MM-dd"),
      time: time || Utilities.formatDate(parsed, TIME_ZONE, "HH:mm"),
    };
  }

  return {
    date: normalizeDateText(text),
    time: time || "09:00",
  };
}

function normalizeDateText(value) {
  const text = clean(value);
  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return isoDate(iso[1], iso[2], iso[3]);

  const us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (us) return isoDate(us[3], us[1], us[2]);

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : Utilities.formatDate(parsed, TIME_ZONE, "yyyy-MM-dd");
}

function timeFromText(value) {
  const match = clean(value).match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\b/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const meridian = (match[3] || "").toUpperCase();
  if (meridian === "PM" && hour < 12) hour += 12;
  if (meridian === "AM" && hour === 12) hour = 0;
  return String(hour).padStart(2, "0") + ":" + minute;
}

function isoDate(year, month, day) {
  return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

function formatJobDate(date, time) {
  if (!date) return "";
  if (!time) return date;
  const parsed = new Date(date + "T" + time + ":00");
  if (Number.isNaN(parsed.getTime())) return date + " " + time;
  return Utilities.formatDate(parsed, TIME_ZONE, "yyyy-MM-dd h:mm a");
}

function todayString() {
  return Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");
}

function normalizeJobStatus(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized.indexOf("incomplete") >= 0) return "scheduled";
  if (normalized.indexOf("complete") >= 0) return "completed";
  if (normalized.indexOf("past") >= 0) return "past due";
  if (normalized.indexOf("progress") >= 0) return "in progress";
  if (normalized.indexOf("cancel") >= 0) return "canceled";
  return "scheduled";
}

function displayJobStatus(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "completed") return "Complete";
  if (normalized === "past due") return "Past due";
  if (normalized === "in progress") return "In progress";
  if (normalized === "canceled") return "Canceled";
  return "Incomplete";
}

function isActiveServicePlanRow(row) {
  return !!clean(row[0]) && !!(clean(row[3]) || clean(row[5]) || clean(row[6]) || clean(row[7]));
}

function planTypeFromFrequency(frequency) {
  const normalized = clean(frequency).toLowerCase();
  if (normalized.indexOf("6 week") >= 0) return "6-week";
  if (normalized.indexOf("3 month") >= 0) return "3-month";
  if (normalized.indexOf("6 month") >= 0) return "6-month";
  if (normalized.indexOf("year") >= 0) return "yearly";
  return "monthly";
}

function normalizePaymentStatus(value) {
  const normalized = clean(value).toLowerCase();
  return ["paid", "unpaid", "partially paid", "past due"].indexOf(normalized) >= 0 ? normalized : "unpaid";
}

function normalizePaymentMethod(value) {
  const normalized = clean(value);
  return ["Zelle", "cash", "card", "check", "other"].indexOf(normalized) >= 0 ? normalized : "other";
}

function phoneFromNotes(value) {
  const match = clean(value).match(/Phone:\s*([^|]+)/i);
  return match ? clean(match[1]) : "";
}

function splitServices(value) {
  return clean(value).split(/[,;]+/).map(item => clean(item)).filter(Boolean);
}

function clean(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function money(value) {
  return Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, "")) || 0;
}

function numberOrUndefined(value) {
  if (!hasValue(value)) return undefined;
  const number = Number(String(value == null ? "" : value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function hasValue(value) {
  return clean(value) !== "";
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
