import type { EmployeeWorkspaceSnapshot, submitEmployeeContract, submitEmployeeEarnings } from "./api";
import type { ContractSubmission, EarningSubmission } from "../types/business";

export function createEmployeePreview(today: string): EmployeeWorkspaceSnapshot {
  const employee = { id: "preview-employee", name: "Sample Employee", email: "", pictureUrl: "", active: true, baseCommissionPct: 0.22, upsellCommissionPct: 0.3, contractBonusPct: 0.1, tipSharePct: 1 };
  return {
    employee, preview: true, earnings: [], contracts: [], solicitations: [], payouts: [],
    customers: [{ id: "preview-customer", name: "Sample Customer (practice)", phone: "", email: "", address: "Sample property", notes: "Preview only", insights: [] }],
    jobs: [{ id: "preview-job", customerId: "preview-customer", date: today, time: "09:00", address: "Sample property", serviceType: "Practice job - driveway cleaning", status: "scheduled", price: 250, amountPaid: 0, tipAmount: 0, paymentStatus: "unpaid", crewIds: [], notes: "Sample job for testing completion, gas reimbursement, and contracts.", source: "mock" }],
    assignments: [{ jobId: "preview-job", employeeId: employee.id, employeeName: employee.name, originalJobPrice: 250, baseCommissionPct: 0.22, upsellCommissionPct: 0.3, contractBonusPct: 0.1, tipSharePct: 1, assignedAt: today }],
  };
}

export async function previewEarnings(input: Parameters<typeof submitEmployeeEarnings>[0]): Promise<EarningSubmission> {
  const upsellAmount = input.hasUpsell && input.upsellOutcome === "accepted" ? input.upsellQuotedAmount ?? 0 : 0;
  const gasCost = input.gasCost ?? 0;
  const tipEarnings = input.tipAmount;
  const contractEarnings = input.contractSubmissionId ? 25 : 0;
  const upsellEarnings = upsellAmount * 0.3;
  return {
    id: "preview-earning", jobId: "preview-job", employeeId: "preview-employee", employeeName: "Sample Employee", customerName: "Sample Customer (practice)",
    jobDate: new Date().toLocaleDateString("en-CA"), originalJobPrice: 250, tipAmount: input.tipAmount, gasCost, upsellAmount,
    upsellDescription: input.hasUpsell ? input.upsellDescription ?? "" : "", upsellOutcome: input.hasUpsell ? input.upsellOutcome ?? "" : "",
    upsellQuotedAmount: input.hasUpsell ? input.upsellQuotedAmount ?? 0 : 0, upsellNotes: input.hasUpsell ? input.upsellNotes ?? "" : "",
    contractSold: Boolean(input.contractSubmissionId), contractSubmissionId: input.contractSubmissionId, status: "pending", ownerNote: "",
    baseEarnings: 55, upsellEarnings, contractEarnings, tipEarnings, totalEarnings: 55 + upsellEarnings + contractEarnings + tipEarnings + gasCost,
    submittedAt: new Date().toISOString(),
  };
}

export async function previewContract(input: Parameters<typeof submitEmployeeContract>[0]): Promise<ContractSubmission> {
  return { ...input, id: "preview-contract", employeeId: "preview-employee", employeeName: "Sample Employee", status: "pending", ownerNote: "", signedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
}
