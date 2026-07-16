import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, FormEvent, ReactNode } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Copy,
  FileText,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  ReceiptText,
  Sparkles,
  Star,
  Sun,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  businessSettings,
  customers as importedCustomers,
  expenses as importedExpenses,
  invoices as importedInvoices,
  jobs as importedJobs,
  leads as importedLeads,
  servicePlans as importedServicePlans,
  spreadsheetImportNotice,
} from "./data/googleSheetData";
import { reviews as importedReviews } from "./data/reviews";
import {
  amountOwed,
  bestCustomers,
  businessMetrics,
  currency,
  customerSpend,
  jobsForCustomer,
  paymentMethodTotals,
  revenueByDay,
  repeatCustomerStats,
  serviceBreakdown,
  today,
} from "./lib/calculations";
import type { Customer, Expense, Invoice, Job, Lead, PaymentMethod, PaymentStatus, ServicePlan } from "./types/business";

type ReviewRow = { id: string; submittedAt: string; name: string; rating: number; review: string; source: string };
type TabId = "dashboard" | "leads" | "jobs" | "calendar" | "finance" | "invoices" | "plans" | "contracts" | "reports" | "reviews";
type SyncPayload = Partial<{
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  expenses: Expense[];
  leads: Lead[];
  servicePlans: Array<ServicePlan & { customer?: Customer }>;
  reviews: ReviewRow[];
}>;
type JobSaveResult = { ok: boolean; message?: string };
type PersistedJobPatch = Pick<Job, "status" | "paymentStatus" | "amountPaid" | "tipAmount" | "paymentMethod" | "price">;
type AddClientJobInput = {
  name: string;
  phone: string;
  address: string;
  date: string;
  time: string;
  price: number;
  serviceType: string;
  notes: string;
};
type AddServicePlanInput = {
  name: string;
  phone: string;
  price: number;
  frequency: string;
  renewalDate: string;
  servicesIncluded: string;
  paymentStatus: PaymentStatus;
  notes: string;
};

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: Sparkles },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "finance", label: "Finance", icon: WalletCards },
  { id: "invoices", label: "Invoices", icon: ReceiptText },
  { id: "plans", label: "Service Plans", icon: ClipboardList },
  { id: "contracts", label: "Contracts", icon: FileText },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "reviews", label: "Reviews", icon: Star },
];

const monthDays = [
  { label: "Mon 8", date: "2026-06-08" },
  { label: "Tue 9", date: "2026-06-09" },
  { label: "Wed 10", date: "2026-06-10" },
  { label: "Thu 11", date: "2026-06-11" },
  { label: "Fri 12", date: "2026-06-12" },
  { label: "Sat 13", date: "2026-06-13" },
  { label: "Sun 14", date: "2026-06-14" },
  { label: "Mon 15", date: "2026-06-15" },
  { label: "Tue 16", date: "2026-06-16" },
  { label: "Wed 17", date: "2026-06-17" },
  { label: "Thu 18", date: "2026-06-18" },
  { label: "Fri 19", date: "2026-06-19" },
  { label: "Sat 20", date: "2026-06-20" },
  { label: "Sun 21", date: "2026-06-21" },
  { label: "Tue 23", date: "2026-06-23" },
  { label: "Fri 26", date: "2026-06-26" },
  { label: "Tue 30", date: "2026-06-30" },
  { label: "Wed 1", date: "2026-07-01" },
];
const weekDays = monthDays.slice(7, 14);
const planTypes: ServicePlan["type"][] = ["monthly", "6-week", "3-month", "6-month", "yearly"];

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", ...options }).format(new Date(`${date}T12:00:00`));
}

function monthlyRunRateProjection(jobs: Job[]) {
  const eligibleJobs = jobs.filter((job) => job.status !== "canceled" && job.price > 0);
  const currentMonth = today.slice(0, 7);
  const months = Array.from(new Set(eligibleJobs.map((job) => job.date.slice(0, 7)))).sort();
  const targetMonth = months.includes(currentMonth) ? currentMonth : months.find((month) => month > currentMonth) ?? months[months.length - 1] ?? currentMonth;
  const monthJobs = eligibleJobs.filter((job) => job.date.startsWith(targetMonth));
  const bookedRevenue = monthJobs.reduce((sum, job) => sum + job.price + job.tipAmount, 0);
  const bookedDays = new Set(monthJobs.map((job) => job.date)).size;
  const [, month] = targetMonth.split("-").map(Number);
  const daysInMonth = new Date(Number(targetMonth.slice(0, 4)), month, 0).getDate();
  const averageDailyRevenue = bookedDays ? bookedRevenue / bookedDays : 0;

  return {
    month: dateLabel(`${targetMonth}-01`, { month: "long", year: "numeric" }),
    bookedDays,
    value: averageDailyRevenue * daysInMonth,
  };
}

function calendarDaysForMode(mode: "day" | "week" | "month", anchorDate: string) {
  if (mode === "day") return [{ label: dateLabel(anchorDate, { weekday: "long" }), date: anchorDate }];
  const length = mode === "week" ? 7 : 30;
  const startOffset = mode === "week" ? 0 : -14;
  return Array.from({ length }, (_, index) => {
    const date = addDays(anchorDate, startOffset + index);
    return { label: dateLabel(date), date };
  });
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findCustomer(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId) ?? customers[0];
}

function localId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "new-client";
}

function timeFromOriginalDateText(notes?: string) {
  const match = notes?.match(/Original date:\s*.*?\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:GMT|\)|\.|$)/i);
  if (!match) return undefined;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeSyncedJobs(rows: Job[]) {
  return rows.map((job) => ({
    ...job,
    crewIds: [],
    time: timeFromOriginalDateText(job.notes) ?? job.time,
  }));
}

function sheetRowNumberFromJobId(jobId: string) {
  const match = jobId.match(/^sheet-(?:job|j)-0*(\d+)$/);
  return match ? Number(match[1]) + 1 : undefined;
}

function persistedJobPatch(patch: Partial<Job>) {
  const next: Partial<PersistedJobPatch> = {};
  if ("status" in patch) next.status = patch.status;
  if ("paymentStatus" in patch) next.paymentStatus = patch.paymentStatus;
  if ("amountPaid" in patch) next.amountPaid = patch.amountPaid;
  if ("tipAmount" in patch) next.tipAmount = patch.tipAmount;
  if ("paymentMethod" in patch) next.paymentMethod = patch.paymentMethod;
  if ("price" in patch) next.price = patch.price;
  return next;
}

function mergeCustomersWithPlanCustomers(base: Customer[], plans?: Array<ServicePlan & { customer?: Customer }>) {
  if (!plans?.length) return base;
  const next = [...base];
  for (const plan of plans) {
    if (plan.customer && !next.some((customer) => customer.id === plan.customer?.id)) next.push(plan.customer);
  }
  return next;
}

function mergeFallbackRecurringCustomers(base: Customer[]) {
  const next = [...base];
  const planCustomerIds = new Set(importedServicePlans.map((plan) => plan.customerId));
  for (const customer of importedCustomers) {
    if (customer.subscribedPlanId && planCustomerIds.has(customer.id) && !next.some((existing) => existing.id === customer.id)) {
      next.push(customer);
    }
  }
  return next;
}

function customersFromSyncPayload(payload: SyncPayload) {
  const syncedCustomers = mergeCustomersWithPlanCustomers(payload.customers ?? [], payload.servicePlans);
  return payload.servicePlans ? syncedCustomers : mergeFallbackRecurringCustomers(syncedCustomers);
}

function cleanServicePlans(plans: Array<ServicePlan & { customer?: Customer }>) {
  return plans.map(({ customer: _customer, ...plan }) => plan);
}

function moneyInput(value: number, onChange: (value: number) => void) {
  return <input type="number" value={value} onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)} />;
}

function Badge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
    scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    contacted: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200",
    new: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200",
    "partially paid": "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    unpaid: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    "past due": "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
    lost: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  };
  return <span className={cx("status-badge", tone[status] ?? tone.unpaid)}>{status}</span>;
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900", className)}>{children}</section>;
}

function Section({ title, kicker, action, children }: { title: string; kicker?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          {kicker && <p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">{kicker}</p>}
          <h2 className="text-xl font-semibold text-ink dark:text-white">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: ElementType }) {
  return (
    <Card className="min-h-[122px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-ink dark:text-white">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"><Icon size={20} /></div>
      </div>
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{detail}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}{children}</label>;
}

function DataTable({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">{children}</div>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(importedCustomers);
  const [jobs, setJobs] = useState<Job[]>(() => normalizeSyncedJobs(importedJobs));
  const [invoices, setInvoices] = useState<Invoice[]>(importedInvoices);
  const [expenses, setExpenses] = useState<Expense[]>(importedExpenses);
  const [leads, setLeads] = useState<Lead[]>(importedLeads);
  const [plans, setPlans] = useState<ServicePlan[]>(importedServicePlans);
  const [reviews, setReviews] = useState<ReviewRow[]>(importedReviews);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Using bundled Google Sheets snapshot.");
  const [syncing, setSyncing] = useState(false);
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const activeLabel = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label ?? "Dashboard", [activeTab]);
  const syncEndpoint = import.meta.env.VITE_SHEETS_SYNC_URL as string | undefined;

  const syncSheets = useCallback(async (showNoEndpointMessage = true) => {
    if (!syncEndpoint) {
      if (showNoEndpointMessage) setSyncStatus("Live sync needs VITE_SHEETS_SYNC_URL on Render. Current data is the latest bundled import.");
      return;
    }
    try {
      setSyncing(true);
      setSyncStatus("Syncing Google Sheets...");
      const response = await fetch(syncEndpoint);
      if (!response.ok) throw new Error(`Sync failed with ${response.status}`);
      const payload = (await response.json()) as SyncPayload;
      if (payload.customers) setCustomers(customersFromSyncPayload(payload));
      if (payload.jobs) setJobs(normalizeSyncedJobs(payload.jobs));
      if (payload.invoices) setInvoices(payload.invoices);
      if (payload.expenses) setExpenses(payload.expenses);
      if (payload.leads) setLeads(payload.leads);
      if (payload.servicePlans) setPlans(cleanServicePlans(payload.servicePlans));
      if (payload.reviews) setReviews(payload.reviews);
      setSyncStatus(`Synced from Google Sheets at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Google Sheets sync failed.");
    } finally {
      setSyncing(false);
    }
  }, [syncEndpoint]);

  useEffect(() => {
    if (!syncEndpoint) return;
    void syncSheets(false);
    const interval = window.setInterval(() => void syncSheets(false), 60_000);
    return () => window.clearInterval(interval);
  }, [syncEndpoint, syncSheets]);

  async function saveJobPatch(jobId: string, patch: Partial<PersistedJobPatch>): Promise<JobSaveResult> {
    if (!syncEndpoint) {
      return {
        ok: true,
        message: "Saved on this device. Add the sheet sync URL to save it to Google Sheets.",
      };
    }
    const rowNumber = sheetRowNumberFromJobId(jobId);
    if (!rowNumber) {
      return {
        ok: true,
        message: "Saved on this device. Sync this new job from Google Sheets, then save it again.",
      };
    }
    const response = await fetch(syncEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "updateJob", jobId, rowNumber, patch }),
    });
    if (!response.ok) throw new Error(`Sheet save failed with ${response.status}`);
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (payload.ok === false) throw new Error(payload.error ?? "Sheet save failed.");
    setSyncStatus(`Saved job update to Upcoming Jobs at ${new Date().toLocaleTimeString()}.`);
    window.setTimeout(() => void syncSheets(false), 1500);
    return { ok: true };
  }

  function updateJob(jobId: string, patch: Partial<Job>): JobSaveResult | Promise<JobSaveResult> {
    const sheetPatch = persistedJobPatch(patch);
    let saveResult: Promise<JobSaveResult> | undefined;
    if (Object.keys(sheetPatch).length) {
      saveResult = saveJobPatch(jobId, sheetPatch).catch((error) => ({
        ok: false,
        message: error instanceof Error ? error.message : "Sheet save failed.",
      }));
    }
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, ...patch } : job));
    setSelectedJob((current) => current?.id === jobId ? { ...current, ...patch } : current);
    return saveResult ?? { ok: true };
  }

  function updateInvoice(invoiceId: string, patch: Partial<Invoice>) {
    setInvoices((current) => current.map((invoice) => invoice.id === invoiceId ? { ...invoice, ...patch } : invoice));
  }

  function updatePlan(planId: string, patch: Partial<ServicePlan>) {
    setPlans((current) => current.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan));
  }

  async function createClientJob(input: AddClientJobInput) {
    if (!syncEndpoint) throw new Error("Live sheet saving needs VITE_SHEETS_SYNC_URL on Render.");
    const response = await fetch(syncEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "addUpcomingJob", row: input }),
    });
    if (!response.ok) throw new Error(`Sheet save failed with ${response.status}`);
    const payload = (await response.json().catch(() => ({}))) as SyncPayload & { ok?: boolean };
    if (payload.customers) setCustomers(customersFromSyncPayload(payload));
    if (payload.jobs) setJobs(normalizeSyncedJobs(payload.jobs));
    if (payload.invoices) setInvoices(payload.invoices);
    if (payload.expenses) setExpenses(payload.expenses);
    if (payload.leads) setLeads(payload.leads);
    if (payload.servicePlans) setPlans(cleanServicePlans(payload.servicePlans));
    if (payload.reviews) setReviews(payload.reviews);
    if (!payload.jobs) {
      const createdAt = Date.now();
      const customerId = `manual-c-${localId(input.name)}-${createdAt}`;
      const newCustomer: Customer = {
        id: customerId,
        name: input.name,
        phone: input.phone,
        email: "",
        address: input.address,
        notes: "Added from the dashboard and saved to Upcoming Jobs.",
        insights: ["inactive customer"],
      };
      const newJob: Job = {
        id: `manual-j-${createdAt}`,
        date: input.date,
        time: input.time,
        customerId,
        address: input.address,
        serviceType: input.serviceType,
        status: "scheduled",
        crewIds: [],
        price: input.price,
        amountPaid: 0,
        tipAmount: 0,
        paymentStatus: "unpaid",
        notes: input.notes || "Added from dashboard.",
        source: "spreadsheet-import",
      };
      setCustomers((current) => [newCustomer, ...current]);
      setJobs((current) => [newJob, ...current]);
    }
    setSyncStatus(`Saved ${input.name} to Upcoming Jobs at ${new Date().toLocaleTimeString()}.`);
    window.setTimeout(() => void syncSheets(false), 1500);
  }

  async function createServicePlan(input: AddServicePlanInput) {
    if (!syncEndpoint) throw new Error("Live sheet saving needs VITE_SHEETS_SYNC_URL on Render.");
    const response = await fetch(syncEndpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "addServicePlan", row: input }),
    });
    if (!response.ok) throw new Error(`Sheet save failed with ${response.status}`);
    const payload = (await response.json().catch(() => ({}))) as SyncPayload & { ok?: boolean; error?: string };
    if (payload.ok === false) throw new Error(payload.error ?? "Sheet save failed.");
    if (payload.customers) setCustomers(customersFromSyncPayload(payload));
    if (payload.jobs) setJobs(normalizeSyncedJobs(payload.jobs));
    if (payload.invoices) setInvoices(payload.invoices);
    if (payload.expenses) setExpenses(payload.expenses);
    if (payload.leads) setLeads(payload.leads);
    if (payload.servicePlans) setPlans(cleanServicePlans(payload.servicePlans));
    if (payload.reviews) setReviews(payload.reviews);
    setSyncStatus(`Saved ${input.name} to Recurring Jobs at ${new Date().toLocaleTimeString()}.`);
    window.setTimeout(() => void syncSheets(false), 1500);
  }

  function chooseTab(tabId: TabId) {
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  }

  function createInvoice() {
    const nextId = `inv-manual-${String(invoices.length + 1).padStart(3, "0")}`;
    const firstJob = jobs[0];
    setInvoices((current) => [{
      id: nextId,
      customerId: customers[0].id,
      jobId: firstJob.id,
      serviceDescription: "New pressure washing service",
      price: 0,
      discount: 0,
      tip: 0,
      paymentMethod: "Zelle",
      status: "unpaid",
      amountPaid: 0,
      dueDate: today,
      issuedDate: today,
    }, ...current]);
  }

  return (
    <div className={cx("min-h-screen", darkMode && "dark")}>
      <div className="flex min-h-screen bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
          <div className="mb-6 rounded-lg bg-ink p-4 text-white"><p className="text-sm text-cyan-100">The Powerwashing Pros</p><h1 className="text-xl font-bold">Ops Dashboard</h1><p className="mt-2 text-xs text-slate-300">Daily control center for jobs, invoices, reviews, and growth.</p></div>
          <nav className="space-y-1">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`desktop-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <button className="icon-button mt-1 lg:hidden" onClick={() => setMobileMenuOpen(true)} title="Open navigation" aria-label="Open navigation"><Menu size={18} /></button>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">{today}</p><h1 className="text-2xl font-bold text-ink dark:text-white">{activeLabel}</h1><p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">{syncStatus}</p></div>
              </div>
              <div className="flex items-center gap-2"><span className="hidden rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200 sm:inline-flex">{currency.format(metrics.dailyRevenue)} booked today</span><button className="text-button" disabled={syncing} onClick={() => void syncSheets()}>{syncing ? "Syncing" : "Sync sheets"}</button><button className="icon-button" onClick={() => setDarkMode(!darkMode)} title="Toggle theme">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button></div>
            </div>
          </header>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <button className="absolute inset-0 bg-ink/45" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />
              <aside className="relative flex h-full w-[min(86vw,340px)] flex-col border-r border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-ink p-4 text-white">
                  <div><p className="text-sm text-cyan-100">The Powerwashing Pros</p><h2 className="text-lg font-bold">Ops Dashboard</h2><p className="mt-1 text-xs text-slate-300">Choose a dashboard tab.</p></div>
                  <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/20 text-white transition hover:bg-white/10" onClick={() => setMobileMenuOpen(false)} title="Close navigation" aria-label="Close navigation"><X size={18} /></button>
                </div>
                <nav className="space-y-1 overflow-y-auto">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`mobile-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
              </aside>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            {activeTab === "dashboard" && <Dashboard customers={customers} jobs={jobs} invoices={invoices} expenses={expenses} leads={leads} onJobClick={setSelectedJob} onClientJobCreate={createClientJob} />}
            {activeTab === "leads" && <Leads leads={leads} />}
            {activeTab === "jobs" && <Jobs customers={customers} jobs={jobs} onJobClick={setSelectedJob} onJobUpdate={updateJob} onClientJobCreate={createClientJob} />}
            {activeTab === "calendar" && <Calendar customers={customers} jobs={jobs} onJobClick={setSelectedJob} />}
            {activeTab === "finance" && <Finance customers={customers} jobs={jobs} invoices={invoices} expenses={expenses} leads={leads} onJobUpdate={updateJob} />}
            {activeTab === "invoices" && <Invoices customers={customers} invoices={invoices} onInvoiceUpdate={updateInvoice} onInvoiceCreate={createInvoice} />}
            {activeTab === "plans" && <Plans customers={customers} plans={plans} onPlanUpdate={updatePlan} onPlanCreate={createServicePlan} />}
            {activeTab === "contracts" && <Contracts customers={customers} invoices={invoices} />}
            {activeTab === "reports" && <Reports customers={customers} jobs={jobs} invoices={invoices} expenses={expenses} leads={leads} />}
            {activeTab === "reviews" && <Reviews reviews={reviews} />}
          </div>
        </main>
      </div>
      {selectedJob && <JobModal customers={customers} job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  );
}

function Dashboard({ customers, jobs, invoices, expenses, leads, onJobClick, onClientJobCreate }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; expenses: Expense[]; leads: Lead[]; onJobClick: (job: Job) => void; onClientJobCreate: (input: AddClientJobInput) => Promise<void> }) {
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const upcoming = jobs.filter((job) => job.status === "scheduled" || job.status === "in progress").slice(0, 6);
  const runRate = monthlyRunRateProjection(jobs);
  const completedRevenue = jobs.filter((job) => job.status === "completed").reduce((sum, job) => sum + job.price + job.tipAmount, 0);
  return <div className="space-y-4"><Section title="Today at a glance" kicker="Business dashboard" action={<span className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-100">{spreadsheetImportNotice}</span>}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Daily job revenue" value={currency.format(metrics.dailyRevenue)} detail="Total price of jobs scheduled today" icon={BadgeDollarSign} /><Stat label="Completed revenue" value={currency.format(completedRevenue)} detail="Total value of completed work" icon={CheckCircle2} /><Stat label="Jobs today" value={`${metrics.jobsToday}`} detail={`${metrics.upcomingJobs} upcoming or active`} icon={BriefcaseBusiness} /><Stat label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="Month-to-date job value" icon={BarChart3} /><Stat label="Projected monthly" value={currency.format(metrics.projectedMonthlyRevenue)} detail="Includes upcoming jobs this month" icon={Sparkles} /><Stat label="Total booked income" value={currency.format(metrics.totalBookedIncome)} detail="All non-canceled jobs, including future jobs" icon={BadgeDollarSign} /><Stat label="Expenses" value={currency.format(metrics.expenses)} detail="From the Expenses sheet" icon={CreditCard} /><Stat label="Projected run rate" value={currency.format(runRate.value)} detail={`${runRate.month}: average from ${runRate.bookedDays} booked job days`} icon={BarChart3} /></div></Section><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><Section title="Upcoming jobs" kicker="Imported schedule"><div className="grid gap-3 md:grid-cols-2">{upcoming.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-lagoon hover:bg-mist dark:border-slate-800 dark:hover:bg-slate-800"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{job.date} at {job.time}</p></div><Badge status={job.status} /></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{job.serviceType}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{job.address || "No address listed"}</p></button>)}</div></Section><AddClientJobForm onCreate={onClientJobCreate} /></div></div>;
}

function AddClientJobForm({ onCreate }: { onCreate: (input: AddClientJobInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [price, setPrice] = useState("");
  const [serviceType, setServiceType] = useState("Full property");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    const cleanName = name.trim();
    if (!cleanName) {
      setStatus("Add the customer name first.");
      return;
    }
    try {
      setSaving(true);
      await onCreate({
        name: cleanName,
        phone: phone.trim(),
        address: address.trim(),
        date,
        time,
        price: Number(price.replace(/[^0-9.]/g, "")) || 0,
        serviceType: serviceType.trim() || "Pressure washing service",
        notes: notes.trim(),
      });
      setName("");
      setPhone("");
      setAddress("");
      setPrice("");
      setServiceType("Full property");
      setNotes("");
      setStatus("Saved to Upcoming Jobs.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save to Upcoming Jobs.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Add client to sheet" kicker="Saves a new row to Upcoming Jobs">
      <form className="settings-grid" onSubmit={submit}>
        <Field label="Customer name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer name" required /></Field>
        <Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="713-000-0000" /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></Field>
        <Field label="Price"><input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="$250" inputMode="decimal" /></Field>
        <Field label="Service"><input value={serviceType} onChange={(event) => setServiceType(event.target.value)} placeholder="Driveway, sidewalks, patio" /></Field>
        <label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Address<input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Customer address" /></label>
        <label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything included, gate notes, reminders, etc." /></label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving" : "Save to Upcoming Jobs"}</button>
          {status && <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{status}</p>}
        </div>
      </form>
    </Section>
  );
}

function Leads({ leads }: { leads: Lead[] }) {
  const wins = leads.filter((lead) => lead.status === "won" || lead.status === "scheduled").length;
  const conversion = leads.length ? Math.round((wins / leads.length) * 100) : 0;
  return <Section title="Leads & prospects" kicker={`${conversion}% conversion tracked from Check-Ups`}><DataTable><table className="data-table"><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Est. value</th><th>Follow-up</th><th>Notes</th></tr></thead><tbody>{leads.length ? leads.map((lead) => <tr key={lead.id}><td><p className="font-semibold text-ink dark:text-white">{lead.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.contact}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.address}</p></td><td>{lead.source}</td><td><Badge status={lead.status} /></td><td>{currency.format(lead.estimatedValue)}</td><td>{lead.followUpDate}</td><td>{lead.notes}</td></tr>) : <tr><td colSpan={6}>No leads found in the Check-Ups sheet.</td></tr>}</tbody></table></DataTable></Section>;
}

function Jobs({ customers, jobs, onJobClick, onJobUpdate, onClientJobCreate }: { customers: Customer[]; jobs: Job[]; onJobClick: (job: Job) => void; onJobUpdate: (jobId: string, patch: Partial<Job>) => JobSaveResult | Promise<JobSaveResult>; onClientJobCreate: (input: AddClientJobInput) => Promise<void> }) {
  const incompleteJobs = jobs.filter((job) => job.status !== "completed");
  const completedJobs = jobs.filter((job) => job.status === "completed");
  const renderJobsTable = (rows: Job[], emptyMessage: string) => (
    <DataTable>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Service</th>
            <th>Status</th>
            <th>Assignment</th>
            <th>Price / Paid / Tip</th>
            <th>Payment</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8}>{emptyMessage}</td></tr>}
          {rows.map((job) => (
            <tr
              key={job.id}
              className="clickable-row"
              role="button"
              tabIndex={0}
              onClick={() => onJobClick(job)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onJobClick(job);
                }
              }}
              aria-label={`Open job for ${findCustomer(customers, job.customerId).name} on ${job.date}`}
            >
              <td>{job.date}<br />{job.time}</td>
              <td>
                <button
                  className="job-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    onJobClick(job);
                  }}
                >
                  {findCustomer(customers, job.customerId).name}
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400">{job.address || "No address listed"}</p>
              </td>
              <td>{job.serviceType}<p className="text-xs text-slate-500 dark:text-slate-400">{job.notes}</p></td>
              <td><Badge status={job.status} /></td>
              <td>Unassigned</td>
              <td>{currency.format(job.price)} / {currency.format(job.amountPaid)} / {currency.format(job.tipAmount)}</td>
              <td><Badge status={job.paymentStatus} /></td>
              <td>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="icon-button"
                    title="Mark complete"
                    onClick={(event) => {
                      event.stopPropagation();
                      onJobUpdate(job.id, { status: "completed", paymentStatus: "paid", amountPaid: job.price });
                    }}
                  >
                    <CheckCircle2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Mark past due"
                    onClick={(event) => {
                      event.stopPropagation();
                      onJobUpdate(job.id, { status: "past due", paymentStatus: "past due" });
                    }}
                  >
                    <FileText size={16} />
                  </button>
                  <button
                    className="primary-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onJobClick(job);
                    }}
                  >
                    Open
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );

  return (
    <div className="space-y-4">
      <AddClientJobForm onCreate={onClientJobCreate} />
      <Section title="Incomplete jobs" kicker={`${incompleteJobs.length} jobs still need attention`}>
        {renderJobsTable(incompleteJobs, "No incomplete jobs right now.")}
      </Section>
      <Section title="Completed jobs" kicker={`${completedJobs.length} finished jobs`}>
        {renderJobsTable(completedJobs, "No completed jobs yet.")}
      </Section>
    </div>
  );
}

function Calendar({ customers, jobs, onJobClick }: { customers: Customer[]; jobs: Job[]; onJobClick: (job: Job) => void }) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(today);
  const days = calendarDaysForMode(mode, anchorDate);
  const step = mode === "day" ? 1 : mode === "week" ? 7 : 30;
  const rangeLabel = mode === "day" ? dateLabel(anchorDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : `${days[0].date.slice(5)} to ${days[days.length - 1].date.slice(5)}`;
  const action = (
    <div className="calendar-toolbar">
      <div className="calendar-nav">
        <button className="icon-button" onClick={() => setAnchorDate(addDays(anchorDate, -step))} title={`Previous ${mode}`}>
          <ChevronLeft size={18} />
        </button>
        <button className="text-button" onClick={() => setAnchorDate(today)}>Today</button>
        <button className="icon-button" onClick={() => setAnchorDate(addDays(anchorDate, step))} title={`Next ${mode}`}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="segmented">{(["day", "week", "month"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={cx(mode === item && "active")}>{item}</button>)}</div>
    </div>
  );
  return <Section title="Scheduling calendar" kicker={`Date-matched spreadsheet schedule: ${rangeLabel}`} action={action}><div className={cx("calendar-grid", mode === "month" && "month-mode")}>{days.map((day) => { const dayJobs = jobs.filter((job) => job.date === day.date); return <div key={day.date} className="calendar-day"><div className="mb-3 flex items-center justify-between"><p className="font-semibold text-ink dark:text-white">{day.label}</p><span className="text-xs text-slate-500 dark:text-slate-400">{day.date.slice(5)}</span></div>{dayJobs.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">No jobs scheduled</p>}{dayJobs.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="calendar-job"><span className="text-xs font-semibold">{job.time}</span><span className="font-semibold">{findCustomer(customers, job.customerId).name}</span><span className="text-xs">{job.address || "No address listed"}</span><span className="text-xs">Unassigned</span><Badge status={job.status} /></button>)}</div>; })}</div></Section>;
}

function Finance({ customers, jobs, invoices, expenses, leads, onJobUpdate }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; expenses: Expense[]; leads: Lead[]; onJobUpdate: (jobId: string, patch: Partial<Job>) => JobSaveResult | Promise<JobSaveResult> }) {
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const customer = findCustomer(customers, selectedId);
  const selectedJobs = jobsForCustomer(customer.id, jobs);
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"><Stat label="Daily revenue" value={currency.format(metrics.dailyRevenue)} detail="Total job value today" icon={BadgeDollarSign} /><Stat label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="Month-to-date job value" icon={BarChart3} /><Stat label="Projected monthly" value={currency.format(metrics.projectedMonthlyRevenue)} detail="Includes upcoming jobs this month" icon={Sparkles} /><Stat label="Total booked income" value={currency.format(metrics.totalBookedIncome)} detail="All non-canceled jobs, including future jobs" icon={BadgeDollarSign} /><Stat label="Expenses" value={currency.format(metrics.expenses)} detail="From the Expenses sheet" icon={CreditCard} /><Stat label="Net profit" value={currency.format(metrics.netProfit)} detail="Monthly revenue minus expenses" icon={WalletCards} /></div><div className="grid gap-4 xl:grid-cols-[300px_1fr]"><Section title="Customer money" kicker="Click a customer"><div className="space-y-2">{customers.map((item) => <button key={item.id} className={cx("w-full rounded-lg border p-3 text-left text-sm transition hover:border-lagoon dark:border-slate-800", customer.id === item.id ? "border-lagoon bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200" : "border-slate-200 text-slate-600 dark:text-slate-300")} onClick={() => setSelectedId(item.id)}><span className="block font-semibold">{item.name}</span><span className="text-xs">{currency.format(customerSpend(item.id, jobs))} collected</span></button>)}</div></Section><Section title={customer.name} kicker="Edit paid amounts, tips, and payment method"><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="metric-mini"><span>Paid</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + job.amountPaid, 0))}</strong></div><div className="metric-mini"><span>Tips</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + job.tipAmount, 0))}</strong></div><div className="metric-mini"><span>Still owed</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + Math.max(job.price - job.amountPaid, 0), 0))}</strong></div></div><div className="space-y-3">{selectedJobs.map((job) => <div key={job.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink dark:text-white">{job.date} - {job.serviceType}</p><Badge status={job.paymentStatus} /></div><div className="settings-grid"><Field label="Job price">{moneyInput(job.price, (value) => onJobUpdate(job.id, { price: value }))}</Field><Field label="Amount paid">{moneyInput(job.amountPaid, (value) => onJobUpdate(job.id, { amountPaid: value }))}</Field><Field label="Tip">{moneyInput(job.tipAmount, (value) => onJobUpdate(job.id, { tipAmount: value }))}</Field><Field label="Payment method"><select value={job.paymentMethod ?? "other"} onChange={(event) => onJobUpdate(job.id, { paymentMethod: event.target.value as PaymentMethod })}>{businessSettings.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></Field></div></div>)}</div></Section></div><Section title="Expenses sheet" kicker="Rows from the new Expenses tab"><DataTable><table className="data-table"><thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Notes</th></tr></thead><tbody>{expenses.length ? expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{expense.category}</td><td>{expense.vendor}</td><td>{currency.format(expense.amount)}</td><td>{expense.notes}</td></tr>) : <tr><td colSpan={5}>No expenses recorded yet. Add rows to the Expenses sheet and sync.</td></tr>}</tbody></table></DataTable></Section><Section title="Payment method tracking" kicker="Totals from current job payments"><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{Object.entries(paymentMethodTotals(jobs)).map(([method, total]) => <div key={method} className="metric-mini"><span>{method}</span><strong>{currency.format(total)}</strong></div>)}</div></Section></div>;
}

function invoiceDisplayName(invoice: Invoice, customers: Customer[]) {
  const customer = findCustomer(customers, invoice.customerId);
  return `${customer.name} - ${invoice.serviceDescription || "Power washing"}`;
}

function cleanPhoneForSms(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  return digits ? `+${digits}` : "";
}

function invoiceTotal(invoice: Invoice) {
  return invoice.price - invoice.discount + invoice.tip;
}

function invoiceMessage(invoice: Invoice, customer: Customer) {
  const owed = amountOwed(invoice);
  return `Hi ${customer.name},

Here is your invoice from ${businessSettings.businessName}.

Service: ${invoice.serviceDescription}
Total: ${currency.format(invoiceTotal(invoice))}
Paid: ${currency.format(invoice.amountPaid)}
Amount due: ${currency.format(owed)}
Due date: ${invoice.dueDate}

You can pay by ${invoice.paymentMethod ?? "your preferred payment method"}. Please reply here if you have any questions.

Thank you,
${businessSettings.businessName}
${businessSettings.phone}`;
}

function invoiceMailtoHref(invoice: Invoice, customer: Customer) {
  const subject = `Invoice from ${businessSettings.businessName}: ${invoiceDisplayName(invoice, [customer])}`;
  return `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(invoiceMessage(invoice, customer))}`;
}

function invoiceSmsHref(invoice: Invoice, customer: Customer) {
  const phone = cleanPhoneForSms(customer.phone);
  return `sms:${encodeURIComponent(phone)}?&body=${encodeURIComponent(invoiceMessage(invoice, customer))}`;
}

function Invoices({ customers, invoices, onInvoiceUpdate, onInvoiceCreate }: { customers: Customer[]; invoices: Invoice[]; onInvoiceUpdate: (invoiceId: string, patch: Partial<Invoice>) => void; onInvoiceCreate: () => void }) {
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const invoice = invoices.find((item) => item.id === selectedId) ?? invoices[0];
  const customer = invoice ? findCustomer(customers, invoice.customerId) : customers[0];
  const update = (patch: Partial<Invoice>) => invoice && onInvoiceUpdate(invoice.id, patch);

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Section
        title="Invoices"
        kicker="Click any invoice to edit it"
        action={<button className="primary-button" onClick={() => { onInvoiceCreate(); setSelectedId(`inv-manual-${String(invoices.length + 1).padStart(3, "0")}`); }}>Create invoice</button>}
      >
        <div className="space-y-2">
          {invoices.map((item) => (
            <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", invoice?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-ink dark:text-white">{invoiceDisplayName(item, customers)}</strong>
                <Badge status={item.status} />
              </div>
              <p className="mt-1 text-sm text-slate-500">Due {item.dueDate} - owed {currency.format(amountOwed(item))}</p>
            </button>
          ))}
        </div>
      </Section>
      {invoice && (
        <Section title={invoiceDisplayName(invoice, customers)} kicker="Paid, unpaid, partial, tip, amount paid, amount owed">
          <div className="settings-grid">
            <Field label="Customer"><select value={invoice.customerId} onChange={(event) => update({ customerId: event.target.value })}>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Status"><select value={invoice.status} onChange={(event) => update({ status: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field label="Service description"><input value={invoice.serviceDescription} onChange={(event) => update({ serviceDescription: event.target.value })} /></Field>
            <Field label="Payment method"><select value={invoice.paymentMethod ?? "other"} onChange={(event) => update({ paymentMethod: event.target.value as PaymentMethod })}>{businessSettings.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></Field>
            <Field label="Price">{moneyInput(invoice.price, (value) => update({ price: value }))}</Field>
            <Field label="Discount">{moneyInput(invoice.discount, (value) => update({ discount: value }))}</Field>
            <Field label="Tip">{moneyInput(invoice.tip, (value) => update({ tip: value }))}</Field>
            <Field label="Amount paid">{moneyInput(invoice.amountPaid, (value) => update({ amountPaid: value }))}</Field>
          </div>
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-ink dark:text-white">{businessSettings.businessName}</h3>
                <p className="text-sm text-slate-500">{businessSettings.phone} / {businessSettings.email}</p>
              </div>
              <p className="font-semibold text-lagoon dark:text-cyan-300">{invoiceDisplayName(invoice, customers)}</p>
            </div>
            <div className="mt-5 grid gap-2 text-sm">
              <p><strong>Bill to:</strong> {customer.name}</p>
              <p><strong>Service:</strong> {invoice.serviceDescription}</p>
              <p><strong>Message:</strong> {businessSettings.defaultInvoiceMessage}</p>
            </div>
            <div className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><span>Price</span><strong>{currency.format(invoice.price)}</strong></div>
              <div className="flex justify-between"><span>Discount</span><strong>-{currency.format(invoice.discount)}</strong></div>
              <div className="flex justify-between"><span>Tip</span><strong>{currency.format(invoice.tip)}</strong></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-base dark:border-slate-800"><span>Total</span><strong>{currency.format(invoice.price - invoice.discount + invoice.tip)}</strong></div>
              <div className="flex justify-between"><span>Paid</span><strong>{currency.format(invoice.amountPaid)}</strong></div>
              <div className="flex justify-between text-coral"><span>Still owed</span><strong>{currency.format(amountOwed(invoice))}</strong></div>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Plans({ customers, plans, onPlanUpdate, onPlanCreate }: { customers: Customer[]; plans: ServicePlan[]; onPlanUpdate: (planId: string, patch: Partial<ServicePlan>) => void; onPlanCreate: (input: AddServicePlanInput) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((item) => item.id === selectedId) ?? plans[0];
  return (
    <div className="space-y-4">
      <AddServicePlanForm onCreate={onPlanCreate} />
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Section title="Service plans" kicker="Imported from Recurring Jobs">
          <div className="space-y-2">
            {plans.map((item) => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", plan?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="capitalize text-ink dark:text-white">{item.type} plan</strong>
                  <Badge status={item.paymentStatus} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{findCustomer(customers, item.customerId).name} - renews {item.renewalDate}</p>
              </button>
            ))}
          </div>
        </Section>
        {plan && (
          <Section title="Plan editor" kicker="Subscription status, renewal, services, pricing">
            <div className="settings-grid">
              <Field label="Customer"><select value={plan.customerId} onChange={(event) => onPlanUpdate(plan.id, { customerId: event.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field>
              <Field label="Plan type"><select value={String(plan.type)} onChange={(event) => onPlanUpdate(plan.id, { type: event.target.value as ServicePlan["type"] })}>{planTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
              <Field label="Plan price">{moneyInput(plan.price, (value) => onPlanUpdate(plan.id, { price: value }))}</Field>
              <Field label="Discount %">{moneyInput(plan.discountPct, (value) => onPlanUpdate(plan.id, { discountPct: value }))}</Field>
              <Field label="Renewal date"><input value={plan.renewalDate} onChange={(event) => onPlanUpdate(plan.id, { renewalDate: event.target.value })} /></Field>
              <Field label="Payment status"><select value={plan.paymentStatus} onChange={(event) => onPlanUpdate(plan.id, { paymentStatus: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
              <label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={plan.notes} onChange={(event) => onPlanUpdate(plan.id, { notes: event.target.value })} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">{plan.servicesIncluded.map((service) => <span key={service} className="tag">{service}</span>)}</div>
          </Section>
        )}
      </div>
    </div>
  );
}

function AddServicePlanForm({ onCreate }: { onCreate: (input: AddServicePlanInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [price, setPrice] = useState("");
  const [frequency, setFrequency] = useState("Monthly");
  const [renewalDate, setRenewalDate] = useState("");
  const [servicesIncluded, setServicesIncluded] = useState("Recurring power washing");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    const cleanName = name.trim();
    if (!cleanName) {
      setStatus("Add the customer name first.");
      return;
    }
    try {
      setSaving(true);
      await onCreate({
        name: cleanName,
        phone: phone.trim(),
        price: Number(price.replace(/[^0-9.]/g, "")) || 0,
        frequency: frequency.trim() || "Monthly",
        renewalDate: renewalDate.trim(),
        servicesIncluded: servicesIncluded.trim() || "Recurring power washing",
        paymentStatus,
        notes: notes.trim(),
      });
      setName("");
      setPhone("");
      setPrice("");
      setFrequency("Monthly");
      setRenewalDate("");
      setServicesIncluded("Recurring power washing");
      setPaymentStatus("unpaid");
      setNotes("");
      setStatus("Saved to Recurring Jobs.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save to Recurring Jobs.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title="Add recurring plan" kicker="Saves a complete row to Recurring Jobs">
      <form className="settings-grid" onSubmit={submit}>
        <Field label="Customer name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Customer name" required /></Field>
        <Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="713-000-0000" /></Field>
        <Field label="Price"><input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="$250" inputMode="decimal" /></Field>
        <Field label="Frequency"><input value={frequency} onChange={(event) => setFrequency(event.target.value)} placeholder="Monthly, 6 weeks, yearly" /></Field>
        <Field label="Renewal date"><input value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} placeholder="2026-07-20 or July 20" /></Field>
        <Field label="Payment status"><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
        <label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Services included<input value={servicesIncluded} onChange={(event) => setServicesIncluded(event.target.value)} placeholder="Driveway, sidewalks, patio" /></label>
        <label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contract notes, gate access, reminders, etc." /></label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving" : "Save to Recurring Jobs"}</button>
          {status && <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{status}</p>}
        </div>
      </form>
    </Section>
  );
}

function Contracts({ customers, invoices }: { customers: Customer[]; invoices: Invoice[] }) {
  const [customerName, setCustomerName] = useState("");
  const [dealType, setDealType] = useState<"recurring" | "standard">("recurring");
  const [planFrequency, setPlanFrequency] = useState("");
  const [includedServices, setIncludedServices] = useState("");
  const [price, setPrice] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoices[0]?.id ?? "");
  const [invoiceCopyStatus, setInvoiceCopyStatus] = useState("");
  const cleanName = customerName.trim() || "[Customer Name]";
  const cleanFrequency = planFrequency.trim() || "[Plan frequency]";
  const cleanServices = includedServices.trim() || "[Services included]";
  const cleanPrice = price.trim() || "[Price]";
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0];
  const selectedCustomer = selectedInvoice ? findCustomer(customers, selectedInvoice.customerId) : customers[0];
  const contractTitle = dealType === "recurring" ? "Recurring Power Washing Service Agreement" : "Power Washing Service Agreement";
  const contractDraft = `${contractTitle}

Date: ${today}

This agreement is between ${businessSettings.businessName} and ${cleanName}.

1. Services Included
${businessSettings.businessName} will provide the following power washing services:
${cleanServices}

2. Price and Payment
The customer agrees to pay ${cleanPrice} for the services listed above. Payment is due when the work is completed unless both parties agree otherwise in writing.

3. Deal Type
${dealType === "recurring" ? `This is a recurring service plan scheduled ${cleanFrequency}. The customer and The Powerwashing Pros will agree on the exact appointment time before each visit. Any extra services not listed above may require an updated price.` : "This is a standard one-time power washing deal. Any extra services not listed above may require an updated price."}

4. Customer Responsibilities
The customer agrees to provide access to the work area, move fragile personal items when needed, and notify The Powerwashing Pros of any surface concerns before work begins.

5. Surface Condition
The Powerwashing Pros will use reasonable care while cleaning. Results may vary depending on the age, condition, staining, and material of the surface.

6. Acceptance
By agreeing to this draft, both parties confirm that the services, price, and deal type above are correct.

Customer: ${cleanName}

The Powerwashing Pros: ______________________________`;

  useEffect(() => {
    if (!selectedInvoiceId && invoices[0]) setSelectedInvoiceId(invoices[0].id);
  }, [invoices, selectedInvoiceId]);

  async function copyContract() {
    try {
      await navigator.clipboard.writeText(contractDraft);
      setCopyStatus("Contract draft copied.");
    } catch {
      setCopyStatus("Copy failed. Select the draft text and copy it manually.");
    }
  }

  async function copyInvoiceMessage() {
    if (!selectedInvoice || !selectedCustomer) return;
    try {
      await navigator.clipboard.writeText(invoiceMessage(selectedInvoice, selectedCustomer));
      setInvoiceCopyStatus("Invoice message copied.");
    } catch {
      setInvoiceCopyStatus("Copy failed. Select the invoice message and copy it manually.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Section title="Contract draft" kicker="Name, deal type, frequency, included work, and price">
          <div className="settings-grid">
            <Field label="Customer name">
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name" />
            </Field>
            <Field label="Deal type">
              <select value={dealType} onChange={(event) => setDealType(event.target.value as "recurring" | "standard")}>
                <option value="recurring">Recurring plan</option>
                <option value="standard">Normal power washing deal</option>
              </select>
            </Field>
            <Field label="Amount they will pay">
              <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="$250" />
            </Field>
            {dealType === "recurring" && (
              <Field label="Plan frequency">
                <input value={planFrequency} onChange={(event) => setPlanFrequency(event.target.value)} placeholder="Every 6 weeks" />
              </Field>
            )}
            <label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              Included in the deal
              <textarea value={includedServices} onChange={(event) => setIncludedServices(event.target.value)} placeholder="Example: driveway, front walkway, sidewalks, and back patio" />
            </label>
          </div>
        </Section>
        <Section title={contractTitle} kicker="Generated draft" action={<button className="text-button" onClick={copyContract}><Copy size={16} /> Copy draft</button>}>
          <pre className="contract-preview">{contractDraft}</pre>
          {copyStatus && <p className="mt-3 text-sm font-semibold text-lagoon dark:text-cyan-300">{copyStatus}</p>}
        </Section>
      </div>
      <Section title="Send invoice" kicker="Draft an email or text from an existing invoice">
        {selectedInvoice && selectedCustomer ? (
          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-4">
              <Field label="Invoice">
                <select value={selectedInvoice.id} onChange={(event) => { setSelectedInvoiceId(event.target.value); setInvoiceCopyStatus(""); }}>
                  {invoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>{invoiceDisplayName(invoice, customers)} - {currency.format(amountOwed(invoice))} due</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="metric-mini"><span>Customer</span><strong>{selectedCustomer.name}</strong></div>
                <div className="metric-mini"><span>Amount due</span><strong>{currency.format(amountOwed(selectedInvoice))}</strong></div>
                <div className="metric-mini"><span>Email</span><strong>{selectedCustomer.email || "No email"}</strong></div>
                <div className="metric-mini"><span>Phone</span><strong>{selectedCustomer.phone || "No phone"}</strong></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className={cx("text-button", !selectedCustomer.email && "pointer-events-none opacity-50")} href={selectedCustomer.email ? invoiceMailtoHref(selectedInvoice, selectedCustomer) : undefined}><Mail size={16} /> Email invoice</a>
                <a className={cx("text-button", !cleanPhoneForSms(selectedCustomer.phone) && "pointer-events-none opacity-50")} href={cleanPhoneForSms(selectedCustomer.phone) ? invoiceSmsHref(selectedInvoice, selectedCustomer) : undefined}><MessageSquare size={16} /> Text invoice</a>
                <button className="text-button" onClick={copyInvoiceMessage}><Copy size={16} /> Copy message</button>
              </div>
              {invoiceCopyStatus && <p className="text-sm font-semibold text-lagoon dark:text-cyan-300">{invoiceCopyStatus}</p>}
            </div>
            <pre className="contract-preview">{invoiceMessage(selectedInvoice, selectedCustomer)}</pre>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No invoices are available yet. Create one in the Invoices tab first.</p>
        )}
      </Section>
    </div>
  );
}

function Reports({ customers, jobs, invoices, expenses, leads }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; expenses: Expense[]; leads: Lead[] }) {
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const revenue = revenueByDay(jobs);
  const maxRevenue = Math.max(...revenue.map((item) => item.revenue), 1);
  const averageJob = jobs.length ? jobs.reduce((sum, job) => sum + job.price, 0) / jobs.length : 0;
  const repeatStats = repeatCustomerStats(customers, jobs);
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Stat label="Jobs completed" value={`${metrics.completedJobs}`} detail={`${metrics.upcomingJobs} scheduled or active`} icon={CheckCircle2} /><Stat label="Average job value" value={currency.format(averageJob)} detail="Across imported jobs" icon={BadgeDollarSign} /><Stat label="Repeat customer rate" value={`${repeatStats.rate}%`} detail={`${repeatStats.repeatCustomers} of ${repeatStats.totalCustomers} customers are active Recurring Jobs plans`} icon={Users} /></div><div className="grid gap-4 xl:grid-cols-2"><Section title="Revenue over time" kicker="Daily and monthly revenue"><div className="space-y-3">{revenue.map((item) => <div key={item.date}><div className="mb-1 flex justify-between text-sm"><span>{item.date}</span><strong>{currency.format(item.revenue)}</strong></div><div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-3 rounded-full bg-lagoon" style={{ width: `${Math.max(5, (item.revenue / maxRevenue) * 100)}%` }} /></div></div>)}</div></Section><Section title="Most common services" kicker="Service types and revenue"><DataTable><table className="data-table"><thead><tr><th>Service</th><th>Jobs</th><th>Revenue</th></tr></thead><tbody>{serviceBreakdown(jobs).map((service) => <tr key={service.name}><td>{service.name}</td><td>{service.count}</td><td>{currency.format(service.revenue)}</td></tr>)}</tbody></table></DataTable></Section><Section title="Best customers" kicker="Spend and retention"><div className="space-y-3">{bestCustomers(customers, jobs).map((customer) => <div key={customer.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="font-semibold text-ink dark:text-white">{customer.name}</span><span>{currency.format(customer.spent)}</span></div>)}</div></Section><Section title="Finance mix" kicker="Invoices, expenses, lead conversion"><div className="grid gap-3 sm:grid-cols-2"><div className="metric-mini"><span>Paid invoices</span><strong>{invoices.filter((invoice) => invoice.status === "paid").length}</strong></div><div className="metric-mini"><span>Tips earned</span><strong>{currency.format(metrics.totalTips)}</strong></div><div className="metric-mini"><span>Expenses</span><strong>{currency.format(metrics.expenses)}</strong></div><div className="metric-mini"><span>Lead conversion</span><strong>{metrics.conversionRate}%</strong></div><div className="metric-mini"><span>Jobs scheduled</span><strong>{metrics.upcomingJobs}</strong></div></div></Section></div></div>;
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Stat label="Average rating" value={`${average.toFixed(1)} / 5`} detail="Powerwashing reviews sheet" icon={Star} /><Stat label="Reviews imported" value={`${reviews.length}`} detail="Synced review rows" icon={ReceiptText} /><Stat label="Five-star reviews" value={`${reviews.filter((review) => review.rating === 5).length}`} detail="Ready for follow-up" icon={CheckCircle2} /></div><Section title="Power Washing Reviews" kicker="Imported from Google Drive spreadsheet"><div className="grid gap-3 lg:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink dark:text-white">{review.name}</h3><p className="text-xs text-slate-500">{new Date(review.submittedAt).toLocaleDateString()}</p></div><span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{review.rating} stars</span></div><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.review}</p></article>)}</div></Section></div>;
}

function JobModal({ customers, job, onClose }: { customers: Customer[]; job: Job; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Job details</p>
            <h3 className="text-xl font-bold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</h3>
            <p className="text-sm text-slate-500">{job.date} at {job.time}</p>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">x</button>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="detail-row"><span>Address</span><strong>{job.address || "No address listed"}</strong></div>
          <div className="detail-row"><span>Service</span><strong>{job.serviceType}</strong></div>
          <div className="detail-row"><span>Assignment</span><strong>Unassigned</strong></div>
          <div className="detail-row"><span>Status</span><Badge status={job.status} /></div>
          <div className="detail-row"><span>Price</span><strong>{currency.format(job.price)}</strong></div>
          <div className="detail-row"><span>Paid / tip</span><strong>{currency.format(job.amountPaid)} / {currency.format(job.tipAmount)}</strong></div>
          <div className="detail-row md:col-span-2"><span>Notes</span><strong>{job.notes}</strong></div>
        </div>
      </div>
    </div>
  );
}
