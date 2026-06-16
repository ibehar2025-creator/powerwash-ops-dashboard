import type { CrewMember, Customer, Expense, Invoice, Job, Lead, PaymentMethod } from "../types/business";

export const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function amountOwed(invoice: Invoice) {
  return Math.max(invoice.price - invoice.discount + invoice.tip - invoice.amountPaid, 0);
}

export function jobsForCustomer(customerId: string, jobs: Job[]) {
  return jobs.filter((job) => job.customerId === customerId);
}

export function customerSpend(customerId: string, jobs: Job[]) {
  return jobsForCustomer(customerId, jobs).reduce((sum, job) => sum + job.amountPaid + job.tipAmount, 0);
}

export function paymentHistory(customerId: string, invoices: Invoice[]) {
  return invoices.filter((invoice) => invoice.customerId === customerId);
}

function jobRevenue(job: Job) {
  return job.price + job.tipAmount;
}

export function crewPay(member: CrewMember, jobs: Job[], targetDate = today) {
  const assigned = jobs.filter((job) => job.crewIds.includes(member.id));
  const dailyJobs = assigned.filter((job) => job.date === targetDate);
  const completed = assigned.filter((job) => job.status === "completed").length;
  const revenueShare = dailyJobs.reduce((sum, job) => sum + job.price * member.commissionPct + job.tipAmount / Math.max(job.crewIds.length, 1), 0);
  const dailyPay = dailyJobs.length ? member.dailyBasePay + revenueShare : 0;
  const weeklyRevenueShare = assigned.reduce((sum, job) => sum + job.price * member.commissionPct + job.tipAmount / Math.max(job.crewIds.length, 1), 0);

  return {
    assignedCount: assigned.length,
    completed,
    dailyPay,
    weeklyPay: member.dailyBasePay * Math.min(assigned.length, 5) + weeklyRevenueShare,
  };
}

export function businessMetrics(jobs: Job[], invoices: Invoice[], leads: Lead[], expenses: Expense[], crew: CrewMember[]) {
  const currentMonth = today.slice(0, 7);
  const todayJobs = jobs.filter((job) => job.date === today);
  const monthJobs = jobs.filter((job) => job.date.startsWith(currentMonth));
  const monthToDateJobs = monthJobs.filter((job) => job.date <= today);
  const projectedMonthJobs = monthJobs.filter((job) => job.status !== "canceled");
  const dailyRevenue = todayJobs.reduce((sum, job) => sum + jobRevenue(job), 0);
  const monthlyRevenue = monthToDateJobs.reduce((sum, job) => sum + jobRevenue(job), 0);
  const projectedMonthlyRevenue = projectedMonthJobs.reduce((sum, job) => sum + jobRevenue(job), 0);
  const totalTips = jobs.reduce((sum, job) => sum + job.tipAmount, 0);
  const unpaidInvoices = invoices.filter((invoice) => invoice.status !== "paid");
  const crewPayouts = crew.reduce((sum, member) => sum + crewPay(member, jobs).weeklyPay, 0);
  const leadWins = leads.filter((lead) => lead.status === "won" || lead.status === "scheduled").length;
  const conversionRate = leads.length ? Math.round((leadWins / leads.length) * 100) : 0;
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return {
    dailyRevenue,
    dailyPay: crew.reduce((sum, member) => sum + crewPay(member, jobs).dailyPay, 0),
    jobsToday: todayJobs.length,
    pastDueJobs: jobs.filter((job) => job.status === "past due").length,
    monthlyRevenue,
    projectedMonthlyRevenue,
    unpaidInvoiceCount: unpaidInvoices.length,
    unpaidInvoiceTotal: unpaidInvoices.reduce((sum, invoice) => sum + amountOwed(invoice), 0),
    totalTips,
    upcomingJobs: jobs.filter((job) => job.status === "scheduled" || job.status === "in progress").length,
    completedJobs: jobs.filter((job) => job.status === "completed").length,
    crewPayouts,
    conversionRate,
    expenses: expenseTotal,
    netProfit: monthlyRevenue - expenseTotal - crewPayouts,
  };
}

export function revenueByDay(jobs: Job[]) {
  return Object.values(
    jobs.reduce<Record<string, { date: string; revenue: number; tips: number; jobs: number }>>((acc, job) => {
      acc[job.date] ??= { date: job.date.slice(5), revenue: 0, tips: 0, jobs: 0 };
      acc[job.date].revenue += jobRevenue(job);
      acc[job.date].tips += job.tipAmount;
      acc[job.date].jobs += 1;
      return acc;
    }, {}),
  ).sort((a, b) => a.date.localeCompare(b.date));
}

export function serviceBreakdown(jobs: Job[]) {
  return Object.values(
    jobs.reduce<Record<string, { name: string; count: number; revenue: number }>>((acc, job) => {
      acc[job.serviceType] ??= { name: job.serviceType, count: 0, revenue: 0 };
      acc[job.serviceType].count += 1;
      acc[job.serviceType].revenue += jobRevenue(job);
      return acc;
    }, {}),
  );
}

export function paymentMethodTotals(jobs: Job[]) {
  return jobs.reduce<Record<PaymentMethod | "unassigned", number>>(
    (acc, job) => {
      const method = job.paymentMethod ?? "unassigned";
      acc[method] = (acc[method] ?? 0) + job.amountPaid + job.tipAmount;
      return acc;
    },
    { Zelle: 0, cash: 0, card: 0, check: 0, other: 0, unassigned: 0 },
  );
}

function normalizedName(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/^same\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedCustomerName(customer?: Customer) {
  return normalizedName(customer?.name);
}

function matchingCustomerKey(name: string, keys: Iterable<string>) {
  const key = normalizedName(name);
  if (!key) return "";
  const existingKeys = Array.from(keys);
  if (existingKeys.includes(key)) return key;

  const prefixMatches = existingKeys.filter((existingKey) => existingKey.startsWith(`${key} `) || key.startsWith(`${existingKey} `));
  if (prefixMatches.length === 1) return prefixMatches[0];

  const firstWord = key.split(" ")[0];
  const firstWordMatches = existingKeys.filter((existingKey) => existingKey.split(" ")[0] === firstWord);
  return firstWordMatches.length === 1 ? firstWordMatches[0] : key;
}

export function repeatCustomerStats(customers: Customer[], jobs: Job[]) {
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const identities = new Map<string, { jobCount: number; hasRecurringPlan: boolean }>();

  for (const job of jobs) {
    const customer = customersById.get(job.customerId);
    const key = normalizedCustomerName(customer) || job.customerId;
    const identity = identities.get(key) ?? { jobCount: 0, hasRecurringPlan: false };
    identity.jobCount += 1;
    identities.set(key, identity);
  }

  for (const customer of customers) {
    if (!customer.subscribedPlanId) continue;
    const key = matchingCustomerKey(customer.name, identities.keys()) || customer.id;
    const identity = identities.get(key) ?? { jobCount: 0, hasRecurringPlan: false };
    identity.hasRecurringPlan = true;
    identities.set(key, identity);
  }

  const allCustomers = Array.from(identities.values());
  const repeatCustomers = allCustomers.filter((identity) => identity.jobCount >= 2 || identity.hasRecurringPlan).length;
  const multiJobCustomers = allCustomers.filter((identity) => identity.jobCount >= 2).length;
  const recurringCustomers = allCustomers.filter((identity) => identity.hasRecurringPlan).length;
  const totalCustomers = allCustomers.length;

  return {
    repeatCustomers,
    multiJobCustomers,
    recurringCustomers,
    totalCustomers,
    rate: totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0,
  };
}

export function bestCustomers(customers: Customer[], jobs: Job[]) {
  return customers
    .map((customer) => ({ ...customer, spent: customerSpend(customer.id, jobs) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 4);
}
