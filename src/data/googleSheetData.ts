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
};

const sheetRows: SheetJobRow[] = [
  { name: "Southwell", address: "3658 Glen Haven Blvd", originalDate: "5/21/2026", date: "2026-05-21", time: "09:00", price: 160, status: "Completed", notes: "Patio Roof" },
  { name: "Steve", address: "3610 Bluebonnet", originalDate: "Friday 22nd 9:00 AM", date: "2026-05-22", time: "09:00", price: 125, status: "Completed", notes: "Driveway + Brick Sidewalks" },
  { name: "Kelly Grenne", address: "3719 Bluebonnet", originalDate: "Memorial Day 2:00", date: "2026-05-25", time: "14:00", price: 175, status: "Completed", notes: "No patio, driveway, sidewalks" },
  { name: "Matt", address: "3642 Bluebonnet", originalDate: "May 27th 4:00", date: "2026-05-27", time: "16:00", price: 175, status: "Completed", notes: "Driveway + Sidewalk + stairs" },
  { name: "Paula", address: "3730 Underwood", originalDate: "1:00Pm 5/29", date: "2026-05-29", time: "13:00", price: 120, status: "Completed", notes: "Sidewalks" },
  { name: "Jeff", address: "Dumbarton 3726", originalDate: "2:30 PM 5/29", date: "2026-05-29", time: "14:30", price: 300, status: "Completed", notes: "Driveway, Sidewalks Patio" },
  { name: "Carmen", address: "3623 Bluebonnet", originalDate: "9:00 AM Saturday 30th", date: "2026-05-30", time: "09:00", price: 250, status: "Completed", notes: "Both Driveway's + Sidewalks" },
  { name: "Black Docter", address: "3611 Bluebonnet", originalDate: "4:00 PM Saturday 30", date: "2026-05-30", time: "16:00", price: 100, status: "Completed", notes: "Driveway" },
  { name: "Caldwell", address: "3710 Blue Bonnet", originalDate: "4th June4:00", date: "2026-06-04", time: "16:00", price: 325, status: "Complete", notes: "Back patio,Driveway, Sidewalks" },
  { name: "Mario", address: "3718 Dumbarton", originalDate: "June 5th 9:00 AM", date: "2026-06-05", time: "09:00", price: 200, status: "Incomplete", notes: "Make sure to confirm day before" },
  { name: "Gregory", address: "3662 Bluebonnet", originalDate: "5th june 4:00", date: "2026-06-05", time: "16:00", price: 250, status: "Complete" },
  { name: "Peggy", address: "3615 Dumbarton St", originalDate: "Saturday June 6th 8:00 AM", date: "2026-06-06", time: "08:00", price: 300, status: "Incomplete", notes: "Driveway + pool area" },
  { name: "Suzzane and John", address: "3622 Aberdeen", originalDate: "Saturday 1:00 PM June 6th", date: "2026-06-06", time: "13:00", price: 230, status: "Incomplete", notes: "Driveway + Sidewalks" },
  { name: "Ignasio", address: "3519 Bluebonnet", originalDate: "Saturday 4:00 PM June 6th", date: "2026-06-06", time: "16:00", price: 175, status: "Complete" },
  { name: "Tom", address: "3507 Bluebonnet", originalDate: "Sunday 9:00 7th", date: "2026-06-07", time: "09:00", price: 150, status: "Incomplete", notes: "Driveway + Sidewalks" },
  { name: "Mark", address: "3506 Bluebonnet", originalDate: "Sunday June 7th at 1:00", date: "2026-06-07", time: "13:00", price: 175, status: "Incomplete" },
  { name: "Sharon Parker", address: "3618 Dumbarton", originalDate: "Monday June 8th 9:00 AM", date: "2026-06-08", time: "09:00", price: 225, status: "Incomplete", notes: "Driveway + Sidewalks" },
  { name: "Michelle", address: "3314 Aberdeen", originalDate: "June 8th Monday 2:00", date: "2026-06-08", time: "14:00", price: 180, status: "Incomplete", notes: "Driveway + Stairs" },
  { name: "Martha", address: "3534 Dumbarton", originalDate: "Tuesday June 9th 3:00", date: "2026-06-09", time: "15:00", price: 300, status: "Incomplete", notes: "Driveway, Stairs, Wrap Sidewalks" },
  { name: "Scott", address: "3216 Aberdeen", originalDate: "Tuesday June 9th 3:00", date: "2026-06-09", time: "15:00", price: 225, status: "Incomplete", notes: "Driveway, Stairs, Sidewalks" },
  { name: "Dan R", address: "3206 Aberdeen", originalDate: "Wednesday June 10th Afternoon Date", date: "2026-06-10", time: "13:00", price: 300, status: "Incomplete", notes: "Walkway, Sidewalks Driveway" },
  { name: "Sum sum", address: "4003 Riley st", originalDate: "Wednesday anytime morning 11th June", date: "2026-06-11", time: "09:00", price: 100, status: "", notes: "Sidewalk and walkway" },
  { name: "Michelle", address: "4024 Riley", originalDate: "Thursday 9:00 AM 11th June", date: "2026-06-11", time: "09:00", price: 230, status: "", notes: "In front the gate patio sidewalks" },
  { name: "Mary", address: "4010 Riley", originalDate: "11 AM Wednesday 11th June", date: "2026-06-11", time: "11:00", price: 250, status: "", notes: "Full property" },
  { name: "Hannah Holmes", address: "3619 Aberdeen way", originalDate: "Thursday June 11th 4:00 PM", date: "2026-06-11", time: "16:00", price: 175, status: "Incomplete", notes: "Driveway behind gate" },
  { name: "Armando", address: "2508 Beall St", originalDate: "Friday June 12th 9:00 AM", date: "2026-06-12", time: "09:00", price: 150, status: "Incomplete", notes: "Driveway + Walkway + Stones" },
  { name: "Emily", address: "4030 Riley", originalDate: "Friday afternoon 12th June", date: "2026-06-12", time: "13:00", price: 325, status: "", notes: "Full property and pavers" },
  { name: "Unknown", address: "3506 Glen Haven", originalDate: "June 13th 9:00 AM", date: "2026-06-13", time: "09:00", price: 349, status: "Incomplete", notes: "Driveway + Backyard patio + sidewalks (everything pretty much and try to upsell)" },
  { name: "Chad", address: "4034 southwestern", originalDate: "Saturday 1:00 PM June 13th", date: "2026-06-13", time: "13:00", price: 250, status: "", notes: "Full Property and patio" },
  { name: "Jeff Whittle", address: "4126 Southwestern", originalDate: "Saturday 4:00 PM June 13th", date: "2026-06-13", time: "16:00", price: 250, status: "", notes: "Sidewalks drive way walkway" },
  { name: "Hillary Ryan", address: "4132 Southwestern", originalDate: "Sunday 9:00 AM June 14th", date: "2026-06-14", time: "09:00", price: 175, status: "", notes: "Full property" },
  { name: "Same Gregory", address: "3662 Bluebonnet", originalDate: "Follow-up from sheet", date: "2026-06-15", time: "09:00", price: 250, status: "", notes: "Spreadsheet row had name/address only; confirm job details." },
];

export const spreadsheetImportNotice =
  "Live Google Drive spreadsheet data imported from Upcoming Jobs: Sheet1, Check-Ups, and Recurring Jobs. Confirm any rows whose original date text was informal.";

export const crewMembers: CrewMember[] = [
  { id: "cr-001", name: "Andre Lewis", role: "Crew Lead", dailyBasePay: 185, commissionPct: 0.09, payoutStatus: "ready", performanceNotes: "Lead tech assigned to higher-value route clusters.", missedWorkNotes: "No missed work this month." },
  { id: "cr-002", name: "Elena Park", role: "Technician", dailyBasePay: 145, commissionPct: 0.06, payoutStatus: "pending", performanceNotes: "Handles residential driveway and sidewalk jobs.", missedWorkNotes: "No missed work this week." },
  { id: "cr-003", name: "Marcus Bell", role: "Technician", dailyBasePay: 135, commissionPct: 0.05, payoutStatus: "paid", performanceNotes: "Good fit for afternoon route support.", missedWorkNotes: "Available for makeup jobs." },
];

function customerId(row: SheetJobRow, index: number) {
  return `sheet-c-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${index + 1}`;
}

function jobStatus(row: SheetJobRow): Job["status"] {
  if (row.status.toLowerCase().startsWith("complete")) return "completed";
  if (row.date < "2026-06-08") return "past due";
  if (row.date === "2026-06-08") return "scheduled";
  return "scheduled";
}

function paymentStatus(row: SheetJobRow): Job["paymentStatus"] {
  return row.status.toLowerCase().startsWith("complete") ? "paid" : row.date < "2026-06-08" ? "past due" : "unpaid";
}

export const customers: Customer[] = sheetRows.map((row, index) => {
  const completed = row.status.toLowerCase().startsWith("complete");
  return {
    id: customerId(row, index),
    name: row.name,
    phone: "Import phone pending",
    email: "Import email pending",
    address: row.address,
    notes: `Imported from Upcoming Jobs. Original date text: ${row.originalDate}. ${row.notes ?? "No notes in spreadsheet."}`,
    subscribedPlanId: row.name === "Mark" ? "sp-001" : undefined,
    insights: completed ? ["repeat customer"] : row.date < "2026-06-08" ? ["overdue payment"] : ["inactive customer"],
  };
});

export const jobs: Job[] = sheetRows.map((row, index) => {
  const status = jobStatus(row);
  const crewIds = index % 3 === 0 ? ["cr-001", "cr-002"] : index % 3 === 1 ? ["cr-001", "cr-003"] : ["cr-002", "cr-003"];
  const paid = status === "completed" ? row.price : 0;

  return {
    id: `sheet-j-${String(index + 1).padStart(3, "0")}`,
    date: row.date,
    time: row.time,
    customerId: customerId(row, index),
    address: row.address,
    serviceType: row.notes ?? "Pressure washing service",
    status,
    crewIds,
    price: row.price,
    amountPaid: paid,
    tipAmount: status === "completed" && row.price >= 250 ? 25 : 0,
    paymentStatus: paymentStatus(row),
    paymentMethod: status === "completed" ? (index % 2 === 0 ? "Zelle" : "cash") : undefined,
    notes: `Spreadsheet status: ${row.status || "blank"}. Original date text: ${row.originalDate}.`,
    beforePhoto: "Before photo placeholder",
    afterPhoto: "After photo placeholder",
    source: "spreadsheet-import",
  };
});

export const leads: Lead[] = [
  { id: "lead-checkup-001", name: "Unknown", contact: "Contact info pending", address: "3719 turnberry circle", source: "Check-Ups sheet", status: "new", estimatedValue: 175, followUpDate: "2026-11-01", notes: "November check-up probability 20%." },
  { id: "lead-checkup-002", name: "Wendy", contact: "Contact info pending", address: "4150 Southwestern", source: "Check-Ups sheet", status: "contacted", estimatedValue: 250, followUpDate: "2026-06-15", notes: "June check-up probability 80%." },
  { id: "lead-upsell-001", name: "Unknown - Glen Haven", contact: "Contact info pending", address: "3506 Glen Haven", source: "Upcoming Jobs upsell note", status: "scheduled", estimatedValue: 349, followUpDate: "2026-06-13", notes: "Try to upsell during full property job." },
];

export const invoices: Invoice[] = jobs.slice(0, 18).map((job, index) => ({
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
    method: invoice.paymentMethod ?? "Zelle",
    date: invoice.issuedDate,
  }));

export const servicePlans: ServicePlan[] = [
  {
    id: "sp-001",
    type: "6-month",
    customerId: customers.find((customer) => customer.name === "Mark")?.id ?? customers[0].id,
    discountPct: 10,
    renewalDate: "2026-09-01",
    servicesIncluded: ["Recurring driveway cleaning", "Sidewalk refresh", "Quarterly reminder"],
    price: 175,
    paymentStatus: "unpaid",
    notes: "Imported from Recurring Jobs sheet: Mark, $175, every 3 months, next predicted date September, phone 832-405-4440.",
  },
];

export const expenses: Expense[] = [
  { id: "e-001", date: "2026-06-08", category: "Fuel", vendor: "Route fuel", amount: 78, notes: "Estimated for imported route." },
  { id: "e-002", date: "2026-06-08", category: "Chemicals", vendor: "Wash supply", amount: 146, notes: "Degreaser and concrete cleaner." },
  { id: "e-003", date: "2026-06-07", category: "Marketing", vendor: "Door hangers", amount: 55, notes: "Neighborhood campaign." },
];

export const businessSettings: BusinessSettings = {
  businessName: "ClearFlow Power Washing",
  phone: "(312) 555-0100",
  email: "hello@clearflowwash.example",
  website: "https://clearflowwash.example",
  defaultInvoiceMessage: "Thank you for choosing ClearFlow Power Washing. Payment is due on receipt unless otherwise noted.",
  defaultTaxRate: 0.0825,
  defaultDiscountPct: 0,
  defaultCommissionPct: 0.06,
  paymentMethods: ["Zelle", "cash", "card", "check", "other"],
  serviceTypes: ["Driveway wash", "Sidewalk cleaning", "Patio cleaning", "Paver cleaning", "Full property wash", "Recurring check-up"],
  theme: "light",
};
