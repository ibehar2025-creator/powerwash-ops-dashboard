export type JobStatus = "scheduled" | "in progress" | "completed" | "canceled" | "past due";
export type PaymentStatus = "paid" | "unpaid" | "partially paid" | "past due";
export type LeadStatus = "new" | "contacted" | "quoted" | "scheduled" | "won" | "lost";
export type PaymentMethod = "Zelle" | "cash" | "card" | "check" | "other";
export type CustomerInsight = "repeat customer" | "high-value customer" | "overdue payment" | "inactive customer";
export type PlanType = "monthly" | "3-month" | "4-month" | "6-month" | "yearly";
export type SolicitationOutcome = "visited" | "no answer" | "interested" | "follow up" | "not interested";
export type CalendarEventType = "meeting" | "soliciting" | "estimate" | "reminder" | "other";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  subscribedPlanId?: string;
  insights: CustomerInsight[];
  websiteEditedFields?: string[];
}

export interface Job {
  id: string;
  date: string;
  time: string;
  customerId: string;
  address: string;
  serviceType: string;
  status: JobStatus;
  crewIds: string[];
  price: number;
  amountPaid: number;
  tipAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  notes: string;
  beforePhoto?: string;
  afterPhoto?: string;
  source: "mock" | "spreadsheet-import" | "manual";
  latitude?: number;
  longitude?: number;
  websiteEditedFields?: string[];
}

export interface Solicitation {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  solicitedDate: string;
  outcome: SolicitationOutcome;
  followUpDate: string;
  notes: string;
  createdBy?: string;
}

export type SubmissionStatus = "draft" | "pending" | "approved" | "rejected" | "paid";

export interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  pictureUrl: string;
  active: boolean;
  baseCommissionPct: number;
  upsellCommissionPct: number;
  contractBonusPct: number;
  tipSharePct: number;
}

export interface JobAssignment {
  jobId: string;
  employeeId: string;
  employeeName: string;
  originalJobPrice: number;
  baseCommissionPct: number;
  upsellCommissionPct: number;
  contractBonusPct: number;
  tipSharePct: number;
  assignedAt: string;
}

export interface EarningSubmission {
  id: string;
  jobId: string;
  employeeId: string;
  employeeName: string;
  customerName: string;
  jobDate: string;
  originalJobPrice: number;
  tipAmount: number;
  upsellAmount: number;
  contractSold: boolean;
  status: SubmissionStatus;
  ownerNote: string;
  baseEarnings: number;
  upsellEarnings: number;
  contractEarnings: number;
  tipEarnings: number;
  totalEarnings: number;
  submittedAt: string;
  reviewedAt?: string;
  paidAt?: string;
}

export interface ContractSubmission {
  id: string;
  employeeId: string;
  employeeName: string;
  jobId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceAddress: string;
  serviceDescription: string;
  frequency: string;
  relatedJob: string;
  price: number;
  notes: string;
  agreementText: string;
  signerName: string;
  signatureData: string;
  electronicConsent: boolean;
  signedAt: string;
  status: "pending" | "approved" | "rejected";
  ownerNote: string;
  createdAt: string;
  reviewedAt?: string;
}

export interface PayoutSummary {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  paidAt: string;
  earningIds: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  address: string;
  source: string;
  status: LeadStatus;
  estimatedValue: number;
  followUpDate: string;
  notes: string;
  websiteEditedFields?: string[];
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  dailyBasePay: number;
  commissionPct: number;
  payoutStatus: "ready" | "pending" | "paid";
  performanceNotes: string;
  missedWorkNotes: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  jobId: string;
  serviceDescription: string;
  price: number;
  discount: number;
  tip: number;
  paymentMethod?: PaymentMethod;
  status: PaymentStatus;
  amountPaid: number;
  dueDate: string;
  issuedDate: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  date: string;
}

export interface ServicePlan {
  id: string;
  type: PlanType;
  customerId: string;
  discountPct: number;
  renewalDate: string;
  servicesIncluded: string[];
  price: number;
  paymentStatus: PaymentStatus;
  notes: string;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  vendor: string;
  amount: number;
  notes: string;
}

export interface BusinessSettings {
  businessName: string;
  phone: string;
  email: string;
  website: string;
  defaultInvoiceMessage: string;
  defaultTaxRate: number;
  defaultDiscountPct: number;
  defaultCommissionPct: number;
  paymentMethods: PaymentMethod[];
  serviceTypes: string[];
  theme: "light" | "dark";
}

export interface Review {
  id: string;
  submittedAt: string;
  name: string;
  rating: number;
  review: string;
  source: "spreadsheet-import" | "manual";
}
