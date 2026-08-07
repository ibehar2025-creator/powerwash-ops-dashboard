import type { CalendarEvent, Customer, Expense, Invoice, Job, Lead, Review, ServicePlan, Solicitation } from "../types/business";

export type DatabaseSnapshot = Partial<{
  customers: Customer[];
  leads: Lead[];
  jobs: Job[];
  invoices: Invoice[];
  servicePlans: ServicePlan[];
  reviews: Review[];
  expenses: Expense[];
  solicitations: Solicitation[];
  calendarEvents: CalendarEvent[];
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
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(detail?.error ?? `API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function loadDatabaseSnapshot() {
  return request<DatabaseSnapshot>("/api/bootstrap");
}

export function syncSheetsToDatabase() {
  return request<DatabaseSnapshot>("/api/sync-sheets", { method: "POST" });
}

export function createCustomer(customer: Omit<Customer, "id" | "insights" | "subscribedPlanId" | "websiteEditedFields">) {
  return request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(customer) });
}

export function saveCustomerPatch(customerId: string, patch: Partial<Customer>) {
  return request<Customer>(`/api/customers/${customerId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function createLead(lead: Omit<Lead, "id" | "source" | "websiteEditedFields">) {
  return request<Lead>("/api/leads", { method: "POST", body: JSON.stringify(lead) });
}

export function deleteLead(leadId: string) {
  return request<{ deleted: boolean }>(`/api/leads/${leadId}`, { method: "DELETE" });
}

export function createJob(job: Pick<Job, "date" | "time" | "customerId" | "address" | "serviceType" | "status" | "price" | "notes">) {
  return request<Job>("/api/jobs", { method: "POST", body: JSON.stringify(job) });
}

export function deleteJob(jobId: string) {
  return request<{ deleted: boolean }>(`/api/jobs/${jobId}`, { method: "DELETE" });
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

export function createCalendarEvent(event: Omit<CalendarEvent, "id">) {
  return request<CalendarEvent>("/api/calendar-events", { method: "POST", body: JSON.stringify(event) });
}

export function saveCalendarEventPatch(eventId: string, patch: Partial<CalendarEvent>) {
  return request<CalendarEvent>(`/api/calendar-events/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteCalendarEvent(eventId: string) {
  return request<{ deleted: boolean }>(`/api/calendar-events/${eventId}`, { method: "DELETE" });
}

export function loadReadNotificationKeys() {
  return request<{ readKeys: string[] }>("/api/notifications/read");
}

export function markNotificationsRead(keys: string[]) {
  return request<{ readKeys: string[] }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({ keys }),
  });
}
