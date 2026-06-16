export type JobStatus = "scheduled" | "in progress" | "completed" | "canceled" | "past due";
export type PaymentStatus = "paid" | "unpaid" | "partially paid" | "past due";
export type LeadStatus = "new" | "contacted" | "quoted" | "scheduled" | "won" | "lost";
export type PaymentMethod = "Zelle" | "cash" | "card" | "check" | "other";
export type CustomerInsight = "repeat customer" | "high-value customer" | "overdue payment" | "inactive customer";
export type PlanType = "monthly" | "6-week" | "3-month" | "6-month" | "yearly";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  subscribedPlanId?: string;
  insights: CustomerInsight[];
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
  source: "mock" | "spreadsheet-import";
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
