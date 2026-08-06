import type { Customer, Expense, Invoice, Job, Lead, Review, ServicePlan, Solicitation } from "../types/business";

export type DatabaseSnapshot = Partial<{
  customers: Customer[];
  leads: Lead[];
  jobs: Job[];
  invoices: Invoice[];
  servicePlans: ServicePlan[];
  reviews: Review[];
  expenses: Expense[];
  solicitations: Solicitation[];
}>;

export interface SolicitationSaveResult {
  solicitation: Solicitation;
  lead: Lead | null;
  removedLeadId?: string;
}

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

export function createSolicitation(solicitation: Omit<Solicitation, "id">) {
  return request<SolicitationSaveResult>("/api/solicitations", {
    method: "POST",
    body: JSON.stringify(solicitation),
  });
}

export function saveSolicitationPatch(solicitationId: string, patch: Partial<Solicitation>) {
  return request<SolicitationSaveResult>(`/api/solicitations/${solicitationId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteSolicitation(solicitationId: string) {
  return request<{ deleted: boolean; removedLeadId: string }>(`/api/solicitations/${solicitationId}`, { method: "DELETE" });
}
