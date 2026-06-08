import type { Job } from "../types/business";

export interface UpcomingJobSpreadsheetRow {
  jobDate: string;
  jobTime: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  serviceType: string;
  crewAssigned: string;
  price: string;
  amountPaid: string;
  tipAmount: string;
  paymentStatus: string;
  notes: string;
}

// Future backend/database/API integration:
// Parse XLSX/CSV rows here, create or match customers and crew members,
// then return normalized Job records for the app data layer.
export function mapSpreadsheetRowsToJobs(rows: UpcomingJobSpreadsheetRow[]): Partial<Job>[] {
  return rows.map((row, index) => ({
    id: `spreadsheet-job-${index + 1}`,
    date: row.jobDate,
    time: row.jobTime,
    address: row.address,
    serviceType: row.serviceType,
    price: Number(row.price.replace(/[^0-9.]/g, "")) || 0,
    amountPaid: Number(row.amountPaid.replace(/[^0-9.]/g, "")) || 0,
    tipAmount: Number(row.tipAmount.replace(/[^0-9.]/g, "")) || 0,
    notes: row.notes,
    source: "spreadsheet-import",
  }));
}
