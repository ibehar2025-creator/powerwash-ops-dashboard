import type { BusinessSettings, CrewMember, Customer, Expense, Invoice, Job, Lead, Payment, ServicePlan } from "../types/business";

type SheetJobRow = {
  name: string;
  address: string;
  originalDate: string;
  date: string;
  time: string;
  price: number;
  status: string;
  notes?: string;
  beforePhoto?: string;
  afterPhoto?: string;
};

type RecurringPlanRow = {
  name: string;
  price: number;
  frequency: string;
  renewalDate: string;
  phone?: string;
};

const actualToday = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const sheetRows: SheetJobRow[] = [
  { name: "2500 Employees", address: "3658 Glen Haven Blvd", originalDate: "5/21/2026", date: "2026-05-21", time: "09:00", price: 160, status: "Completed", notes: "Patio Roof" },
  { name: "Steve", address: "3610 Bluebonnet", originalDate: "Friday 22nd 9:00 AM", date: "2026-05-22", time: "09:00", price: 125, status: "Completed", notes: "Driveway + Brick Sidewalks" },
  { name: "Kelly Grenne", address: "3719 Bluebonnet", originalDate: "Memorial Day 2:00", date: "2026-05-25", time: "14:00", price: 175, status: "Completed", notes: "No patio, driveway, sidewalks" },
  { name: "Matt", address: "3642 Bluebonnet", originalDate: "May 27th 4:00", date: "2026-05-27", time: "16:00", price: 175, status: "Completed", notes: "Driveway + Sidewalk + stairs" },
  { name: "Paula", address: "3730 Underwood", originalDate: "1:00Pm 5/29", date: "2026-05-29", time: "13:00", price: 120, status: "Completed", notes: "Sidewalks" },
  { name: "Jeff", address: "Dumbarton 3726", originalDate: "2:30 PM 5/29", date: "2026-05-29", time: "14:30", price: 300, status: "Completed", notes: "Driveway, Sidewalks Patio" },
  { name: "Carmen", address: "3623 Bluebonnet", originalDate: "9:00 AM Saturday 30th", date: "2026-05-30", time: "09:00", price: 250, status: "Completed", notes: "Both Driveway's + Sidewalks" },
  { name: "Black Docter", address: "3611 Bluebonnet", originalDate: "4:00 PM Saturday 30", date: "2026-05-30", time: "16:00", price: 100, status: "Completed", notes: "Driveway" },
  { name: "Caldwell", address: "3710 Blue Bonnet", originalDate: "4th June4:00", date: "2026-06-04", time: "16:00", price: 325, status: "Complete", notes: "Back patio,Driveway, Sidewalks" },
  { name: "Mario", address: "3718 Dumbarton", originalDate: "June 5th 9:00 AM", date: "2026-06-05", time: "09:00", price: 200, status: "Complete", notes: "Make sure to confirm day before" },
  { name: "Gregory", address: "3662 Bluebonnet", originalDate: "5th june 4:00", date: "2026-06-05", time: "16:00", price: 250, status: "Complete" },
  { name: "Peggy", address: "3615 Dumbarton St", originalDate: "Saturday June 6th 8:00 AM", date: "2026-06-06", time: "08:00", price: 300, status: "Complete", notes: "Driveway + pool area" },
  { name: "Suzzane and John", address: "3622 Aberdeen", originalDate: "Saturday 1:00 PM June 6th", date: "2026-06-06", time: "13:00", price: 230, status: "Complete", notes: "Driveway + Sidewalks" },
  { name: "Ignasio", address: "3519 Bluebonnet", originalDate: "Saturday 4:00 PM June 6th", date: "2026-06-06", time: "16:00", price: 175, status: "Complete" },
  { name: "Tom", address: "3507 Bluebonnet", originalDate: "Sunday 9:00 7th", date: "2026-06-07", time: "09:00", price: 150, status: "Complete", notes: "Driveway + Sidewalks" },
  { name: "Mark", address: "3506 Bluebonnet", originalDate: "Sunday June 7th at 1:00", date: "2026-06-07", time: "13:00", price: 175, status: "Complete" },
  { name: "Same Gregory", address: "3662 Bluebonnet", originalDate: "Tuesday June 8th 12:00 PM", date: "2026-06-08", time: "12:00", price: 50, status: "Complete" },
  { name: "Michelle", address: "3314 Aberdeen", originalDate: "June 8th Monday 2:00", date: "2026-06-08", time: "14:00", price: 180, status: "Complete", notes: "Driveway + Stairs" },
  { name: "Martha", address: "3534 Dumbarton", originalDate: "Tuesday June 9th 9:00 AM", date: "2026-06-09", time: "09:00", price: 300, status: "Complete", notes: "Driveway, Stairs, Wrap Sidewalks" },
  { name: "Scott", address: "3216 Aberdeen", originalDate: "Tuesday June 9th 3:00", date: "2026-06-09", time: "15:00", price: 225, status: "Complete", notes: "Driveway, Stairs, Sidewalks" },
  { name: "Sum sum", address: "4003 Riley st", originalDate: "Wednesday 9:00 AM", date: "2026-06-10", time: "09:00", price: 100, status: "Complete", notes: "Sidewalk and walkway" },
  { name: "Seth", address: "4146 Marquette", originalDate: "Wednesday around 11:00 AM", date: "2026-06-10", time: "11:00", price: 225, status: "Complete", notes: "Back patio and front patio maybe sidewalk" },
  { name: "Dan R", address: "3206 Aberdeen", originalDate: "Wednesday June 10th 2:30", date: "2026-06-10", time: "14:30", price: 300, status: "Complete", notes: "Walkway, Sidewalks Driveway" },
  { name: "Michelle", address: "4024 Riley", originalDate: "Thursday 9:00 AM 11th June", date: "2026-06-11", time: "09:00", price: 230, status: "Complete", notes: "In front the gate patio sidewalks" },
  { name: "Hannah Holmes", address: "3619 Aberdeen way", originalDate: "Thursday June 11th 4:00 PM", date: "2026-06-11", time: "16:00", price: 300, status: "Complete", notes: "Driveway behind gate" },
  { name: "Mimi", address: "4121 Marquette", originalDate: "Friday 9:00 AM", date: "2026-06-12", time: "09:00", price: 349, status: "Complete", notes: "Front patio, Back patio, walkway and driveway no sidewalks and porch roof" },
  { name: "Gary", address: "4133 Marquette", originalDate: "Friday after or before Mimi", date: "2026-06-12", time: "10:30", price: 150, status: "Complete", notes: "Driveway + Sidewalks" },
  { name: "Emily", address: "4030 Riley", originalDate: "Friday afternoon 12th June", date: "2026-06-12", time: "13:00", price: 325, status: "Complete", notes: "Full property and pavers" },
  { name: "Whatever", address: "3506 Glen Haven", originalDate: "June 13th 9:00 AM", date: "2026-06-13", time: "09:00", price: 349, status: "Complete", notes: "Driveway + Backyard patio + sidewalks (everything pretty much and try to upsell)" },
  { name: "Chad", address: "4034 southwestern", originalDate: "Saturday 1:00 PM June 13th", date: "2026-06-13", time: "13:00", price: 250, status: "Complete", notes: "Full Property and patio" },
  { name: "Jeff Whittle", address: "4126 Southwestern", originalDate: "Saturday 4:00 PM June 13th", date: "2026-06-13", time: "16:00", price: 300, status: "Complete", notes: "Sidewalks drive way walkway" },
  { name: "Hillary Ryan", address: "4132 Southwestern", originalDate: "Sunday 9:00 AM June 14th", date: "2026-06-14", time: "09:00", price: 175, status: "Incomplete", notes: "Full property" },
  { name: "Vallone", address: "2534 Marquette", originalDate: "Sunday at 1:00 ish", date: "2026-06-14", time: "13:00", price: 275, status: "Incomplete", notes: "Back patio walkway sidewalks no driveway go to her neighbor" },
  { name: "Bill", address: "4025 Villanova", originalDate: "Sunday Afternoon June 14th", date: "2026-06-14", time: "15:00", price: 100, status: "Complete", notes: "Stones + Acorn stains" },
  { name: "Danielle", address: "4036 Villanova", originalDate: "Tuesday 9:00 Am June 16th", date: "2026-06-16", time: "09:00", price: 299, status: "Incomplete", notes: "Full property + patio" },
  { name: "Nina", address: "4125 Oberlin", originalDate: "Tuesday 1:00 PM June 16th", date: "2026-06-16", time: "13:00", price: 100, status: "Incomplete", notes: "Patio" },
  { name: "Mary", address: "4010 Riley", originalDate: "9 AM Wednesday June 17th", date: "2026-06-17", time: "09:00", price: 250, status: "Incomplete", notes: "Full property" },
  { name: "David", address: "3505 Glen Haven", originalDate: "Wednesday afternoon June 17th", date: "2026-06-17", time: "13:00", price: 250, status: "Incomplete", notes: "Walkway + Driveway" },
  { name: "AJ", address: "4127 Gramercy", originalDate: "Thursday 9:00 AM 18th June", date: "2026-06-18", time: "09:00", price: 225, status: "Incomplete", notes: "Everything including patio" },
  { name: "Nicole", address: "4102 Oberlin", originalDate: "Friday 9:00 AM June 19th", date: "2026-06-19", time: "09:00", price: 200, status: "Incomplete", notes: "Driveway, Walkway, Patio" },
  { name: "Eve", address: "4106 Lanark", originalDate: "Friday 1:00 Pm June 19th", date: "2026-06-19", time: "13:00", price: 325, status: "Incomplete", notes: "Driveway sidewalks front patio and back patio and around the pool" },
  { name: "Maria", address: "4110 Lanark", originalDate: "Saturday 9:00 AM June 20th", date: "2026-06-20", time: "09:00", price: 250, status: "incomplete", notes: "Full property" },
  { name: "Ms.Baker", address: "4130 Lanark", originalDate: "Saturday 1:00 PM June 20th", date: "2026-06-20", time: "13:00", price: 175, status: "Incomplete", notes: "Driveway Sidewalks everything" },
  { name: "Simon", address: "", originalDate: "Sunday 9:00 AM", date: "2026-06-21", time: "09:00", price: 225, status: "Incomplete", notes: "Full property" },
  { name: "Will", address: "4114 Lanark", originalDate: "Tuesday 9:00 AM 23rd", date: "2026-06-23", time: "09:00", price: 90, status: "Incomplete", notes: "Windows front" },
  { name: "Armando", address: "2508 Beall St", originalDate: "Friday Morning June 26th", date: "2026-06-26", time: "09:00", price: 150, status: "Incomplete", notes: "Driveway + Walkway + Stones" },
  { name: "Ryan Fleck", address: "Unknown", originalDate: "Unknown", date: "2026-06-30", time: "09:00", price: 525, status: "incomplete", notes: "Full outside property + inside gate" },
  { name: "Rachel", address: "4106 Villanova", originalDate: "Any day", date: "2026-07-01", time: "09:00", price: 300, status: "Incomplete", notes: "Full property + patio roof go back to 4105 Villanova" },
];

const recurringPlanRows: RecurringPlanRow[] = [
  { name: "Mark", price: 175, frequency: "3 months", renewalDate: "September", phone: "832-405-4440" },
  { name: "Michelle", price: 230, frequency: "6 weeks", renewalDate: "July 20th" },
  { name: "Hannah", price: 250, frequency: "Yearly", renewalDate: "6/11/27" },
  { name: "Vallone", price: 275, frequency: "Yearly", renewalDate: "" },
];

export const spreadsheetImportNotice =
  "Google Sheets data imported from Upcoming Jobs, Check-Ups, Recurring Jobs, and Expenses. Add expense rows or before/after photo URLs in the spreadsheet, then sync sheets.";

export const crewMembers: CrewMember[] = [];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "unknown";
}

function customerId(row: SheetJobRow, index: number) {
  return `sheet-c-${slug(row.name)}-${index + 1}`;
}

function normalizedStatus(value: string) {
  return value.trim().toLowerCase();
}

function jobStatus(row: SheetJobRow): Job["status"] {
  if (normalizedStatus(row.status).startsWith("complete")) return "completed";
  if (row.date < actualToday) return "past due";
  return "scheduled";
}

function paymentStatus(row: SheetJobRow): Job["paymentStatus"] {
  if (normalizedStatus(row.status).startsWith("complete")) return "paid";
  if (row.date < actualToday) return "past due";
  return "unpaid";
}

function planType(frequency: string): ServicePlan["type"] {
  const normalized = frequency.toLowerCase();
  if (normalized.includes("6 week")) return "6-week";
  if (normalized.includes("3 month")) return "3-month";
  if (normalized.includes("6 month")) return "6-month";
  if (normalized.includes("year")) return "yearly";
  return "monthly";
}

function matchesPlanName(rowName: string, planName: string) {
  const normalizedRow = rowName.toLowerCase();
  const normalizedPlan = planName.toLowerCase();
  return normalizedRow === normalizedPlan || normalizedRow.startsWith(normalizedPlan);
}

function rowsMatchingPlanName(planName: string) {
  return sheetRows.filter((row) => matchesPlanName(row.name, planName));
}

function matchingCustomerId(plan: RecurringPlanRow) {
  const matchingRows = rowsMatchingPlanName(plan.name);
  const priceMatchIndex = sheetRows.findIndex((row) => matchesPlanName(row.name, plan.name) && row.price === plan.price);
  const nameMatchIndex = matchingRows.length === 1 ? sheetRows.findIndex((row) => matchesPlanName(row.name, plan.name)) : -1;
  const matchIndex = priceMatchIndex >= 0 ? priceMatchIndex : nameMatchIndex;
  return matchIndex >= 0 ? customerId(sheetRows[matchIndex], matchIndex) : customerId(sheetRows[0], 0);
}

function matchingPlanForRow(row: SheetJobRow) {
  const candidates = recurringPlanRows.filter((plan) => matchesPlanName(row.name, plan.name));
  const priceMatch = candidates.find((plan) => plan.price === row.price);
  if (priceMatch) return priceMatch;
  return candidates.length === 1 && rowsMatchingPlanName(candidates[0].name).length === 1 ? candidates[0] : undefined;
}

function planIdForRow(row: SheetJobRow) {
  const matchingPlan = matchingPlanForRow(row);
  const index = matchingPlan ? recurringPlanRows.indexOf(matchingPlan) : -1;
  return index >= 0 ? `sp-${String(index + 1).padStart(3, "0")}` : undefined;
}

export const customers: Customer[] = sheetRows.map((row, index) => {
  const completed = normalizedStatus(row.status).startsWith("complete");
  const matchingPlan = matchingPlanForRow(row);

  return {
    id: customerId(row, index),
    name: row.name,
    phone: matchingPlan?.phone ?? "",
    email: "",
    address: row.address,
    notes: `Imported from Upcoming Jobs. Original date text: ${row.originalDate}. ${row.notes ?? "No notes in spreadsheet."}`,
    subscribedPlanId: planIdForRow(row),
    insights: completed ? ["repeat customer"] : row.date < actualToday ? ["overdue payment"] : ["inactive customer"],
  };
});

export const jobs: Job[] = sheetRows.map((row, index) => {
  const status = jobStatus(row);
  const paid = status === "completed" ? row.price : 0;

  return {
    id: `sheet-j-${String(index + 1).padStart(3, "0")}`,
    date: row.date,
    time: row.time,
    customerId: customerId(row, index),
    address: row.address,
    serviceType: row.notes ?? "Pressure washing service",
    status,
    crewIds: [],
    price: row.price,
    amountPaid: paid,
    tipAmount: 0,
    paymentStatus: paymentStatus(row),
    notes: `Spreadsheet status: ${row.status || "blank"}. Original date text: ${row.originalDate}.`,
    beforePhoto: row.beforePhoto,
    afterPhoto: row.afterPhoto,
    source: "spreadsheet-import",
  };
});

export const leads: Lead[] = [
  { id: "lead-checkup-001", name: "Unknown", contact: "", address: "3719 turnberry circle", source: "Check-Ups sheet", status: "new", estimatedValue: 175, followUpDate: "2026-11-01", notes: "November check-up probability 20%." },
  { id: "lead-checkup-002", name: "Wendy", contact: "", address: "4150 Southwestern", source: "Check-Ups sheet", status: "contacted", estimatedValue: 250, followUpDate: "2026-06-01", notes: "June check-up probability 80%." },
  { id: "lead-checkup-003", name: "Lauren", contact: "", address: "3615 BlueBonnet", source: "Check-Ups sheet", status: "new", estimatedValue: 175, followUpDate: "2026-11-01", notes: "November check-up, probability blank in sheet." },
];

export const invoices: Invoice[] = jobs.map((job, index) => ({
  id: `inv-sheet-${String(index + 1).padStart(3, "0")}`,
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

export const payments: Payment[] = invoices
  .filter((invoice) => invoice.amountPaid > 0)
  .map((invoice, index) => ({
    id: `pay-sheet-${String(index + 1).padStart(3, "0")}`,
    invoiceId: invoice.id,
    amount: invoice.amountPaid,
    method: invoice.paymentMethod ?? "other",
    date: invoice.issuedDate,
  }));

export const servicePlans: ServicePlan[] = recurringPlanRows.map((plan, index) => ({
  id: `sp-${String(index + 1).padStart(3, "0")}`,
  type: planType(plan.frequency),
  customerId: matchingCustomerId(plan),
  discountPct: 0,
  renewalDate: plan.renewalDate || "Not listed",
  servicesIncluded: ["Recurring power washing", plan.frequency],
  price: plan.price,
  paymentStatus: "unpaid",
  notes: `Imported from Recurring Jobs sheet: ${plan.name}, $${plan.price}, ${plan.frequency}, next predicted date ${plan.renewalDate || "not listed"}${plan.phone ? `, phone ${plan.phone}` : ""}.`,
}));

export const expenses: Expense[] = [];

export const businessSettings: BusinessSettings = {
  businessName: "The Powerwashing Pros",
  phone: "713-206-3514",
  email: "Ibehar2025@gmail.com",
  website: "https://the-powerwashing-pros.onrender.com",
  defaultInvoiceMessage: "Thank you for choosing The Powerwashing Pros. Payment is due on receipt unless otherwise noted.",
  defaultTaxRate: 0,
  defaultDiscountPct: 0,
  defaultCommissionPct: 0,
  paymentMethods: ["Zelle", "cash", "card", "check", "other"],
  serviceTypes: ["Driveway", "Sidewalks", "Patio", "Fence", "Brick", "Siding", "Full property", "Recurring check-up"],
  theme: "light",
};
