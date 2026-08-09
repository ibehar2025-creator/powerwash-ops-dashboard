import type { CalendarEvent, ContractSubmission, Customer, EarningSubmission, EmployeeProfile, Expense, Invoice, Job, JobAssignment, Lead, PayoutSummary, Review, ServicePlan, Solicitation } from "../types/business";

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

export interface EmployeeWorkspaceSnapshot {
  employee: EmployeeProfile;
  preview: boolean;
  customers: Customer[];
  jobs: Job[];
  assignments: JobAssignment[];
  earnings: EarningSubmission[];
  solicitations: Solicitation[];
  payouts: PayoutSummary[];
}

export interface OwnerOperationsSnapshot {
  employees: EmployeeProfile[];
  assignments: JobAssignment[];
  earnings: EarningSubmission[];
  contracts: ContractSubmission[];
  payouts: PayoutSummary[];
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

export function createSolicitation(solicitation: Omit<Solicitation, "id">, employeeId?: string) {
  return request<SolicitationSaveResult>("/api/solicitations", {
    method: "POST",
    body: JSON.stringify({ ...solicitation, employeeId }),
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

export function loadEmployeeWorkspace(employeeId?: string) {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  return request<EmployeeWorkspaceSnapshot>(`/api/employee/bootstrap${query}`);
}

export function saveEmployeeJobPatch(jobId: string, patch: Pick<Partial<Job>, "status" | "notes">, employeeId?: string) {
  return request<Job>(`/api/employee/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify({ ...patch, employeeId }) });
}

export function submitEmployeeEarnings(input: { jobId: string; tipAmount: number; upsellAmount?: number; contractSubmissionId?: string; employeeId?: string }) {
  return request<EarningSubmission>("/api/employee/earnings", { method: "POST", body: JSON.stringify(input) });
}

export function submitEmployeeUpsell(input: { jobId: string; description: string; outcome: "accepted" | "declined" | "follow-up"; quotedAmount: number; notes: string; employeeId?: string }) {
  return request<EarningSubmission>("/api/employee/upsells", { method: "POST", body: JSON.stringify(input) });
}

export function submitEmployeeContract(input: {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceAddress: string;
  serviceDescription: string;
  frequency: string;
  price: number;
  notes: string;
  agreementText: string;
  signerName: string;
  signatureData: string;
  electronicConsent: boolean;
  employeeId?: string;
}) {
  return request<ContractSubmission>("/api/employee/contracts", { method: "POST", body: JSON.stringify(input) });
}

export function loadOwnerOperations() {
  return request<OwnerOperationsSnapshot>("/api/owner/operations");
}

export function saveEmployeeProfile(employeeId: string, patch: Partial<Pick<EmployeeProfile, "active" | "baseCommissionPct" | "upsellCommissionPct" | "contractBonusPct" | "tipSharePct">>) {
  return request<EmployeeProfile>(`/api/owner/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function assignEmployeeToJob(jobId: string, employeeId: string) {
  return request<JobAssignment>("/api/owner/assignments", { method: "POST", body: JSON.stringify({ jobId, employeeId }) });
}

export function removeJobAssignment(jobId: string) {
  return request<{ deleted: boolean }>(`/api/owner/assignments/${jobId}`, { method: "DELETE" });
}

export function reviewEarning(earningId: string, decision: "approved" | "rejected", ownerNote = "") {
  return request<EarningSubmission>(`/api/owner/earnings/${earningId}/review`, { method: "POST", body: JSON.stringify({ decision, ownerNote }) });
}

export function reviewContract(contractId: string, decision: "approved" | "rejected", ownerNote = "") {
  return request<ContractSubmission>(`/api/owner/contracts/${contractId}/review`, { method: "POST", body: JSON.stringify({ decision, ownerNote }) });
}

export function createPayout(earningIds: string[]) {
  return request<PayoutSummary>("/api/owner/payouts", { method: "POST", body: JSON.stringify({ earningIds }) });
}
