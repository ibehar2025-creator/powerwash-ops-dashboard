import type { Customer, Expense, Invoice, Job, Lead, Review, ServicePlan } from "../types/business";

export type DatabaseSnapshot = Partial<{
  customers: Customer[];
  leads: Lead[];
  jobs: Job[];
  invoices: Invoice[];
  servicePlans: ServicePlan[];
  reviews: Review[];
  expenses: Expense[];
}>;

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (response.status === 503 || response.status === 404) return null;
  if (!response.ok) throw new Error(`API request failed: ${response.status}`);

  return response.json() as Promise<T>;
}

export function loadDatabaseSnapshot() {
  return request<DatabaseSnapshot>("/api/bootstrap");
}

export function syncSheetsToDatabase() {
  return request<DatabaseSnapshot>("/api/sync-sheets", { method: "POST" });
}

export function saveLeadPatch(leadId: string, patch: Partial<Lead>) {
  return request<Lead>(`/api/leads/${leadId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function saveJobPatch(jobId: string, patch: Partial<Job>) {
  return request<Job>(`/api/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function saveInvoicePatch(invoiceId: string, patch: Partial<Invoice>) {
  return request<Invoice>(`/api/invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function saveServicePlanPatch(planId: string, patch: Partial<ServicePlan>) {
  return request<ServicePlan>(`/api/service-plans/${planId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
