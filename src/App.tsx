import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
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
  expenses,
  invoices as importedInvoices,
  jobs as importedJobs,
  leads,
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
  paymentHistory,
  paymentMethodTotals,
  revenueByDay,
  serviceBreakdown,
  today,
} from "./lib/calculations";
import type { Customer, Invoice, Job, PaymentMethod, PaymentStatus, ServicePlan } from "./types/business";

type ReviewRow = { id: string; submittedAt: string; name: string; rating: number; review: string; source: string };
type TabId = "dashboard" | "customers" | "leads" | "jobs" | "calendar" | "finance" | "invoices" | "plans" | "reports" | "reviews";
type SyncPayload = Partial<{ customers: Customer[]; jobs: Job[]; invoices: Invoice[]; servicePlans: ServicePlan[]; reviews: ReviewRow[] }>;

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "leads", label: "Leads", icon: Sparkles },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "finance", label: "Finance", icon: WalletCards },
  { id: "invoices", label: "Invoices", icon: ReceiptText },
  { id: "plans", label: "Service Plans", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "reviews", label: "Reviews", icon: Star },
];

const weekDays = [
  { label: "Mon 8", date: "2026-06-08" },
  { label: "Tue 9", date: "2026-06-09" },
  { label: "Wed 10", date: "2026-06-10" },
  { label: "Thu 11", date: "2026-06-11" },
  { label: "Fri 12", date: "2026-06-12" },
  { label: "Sat 13", date: "2026-06-13" },
  { label: "Sun 14", date: "2026-06-14" },
];

const monthDays = [...weekDays, { label: "Mon 15", date: "2026-06-15" }, { label: "Tue 16", date: "2026-06-16" }, { label: "Wed 17", date: "2026-06-17" }, { label: "Thu 18", date: "2026-06-18" }, { label: "Fri 19", date: "2026-06-19" }, { label: "Sat 20", date: "2026-06-20" }, { label: "Sun 21", date: "2026-06-21" }];
const planTypes = ["monthly", "3-month", "yearly"];

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findCustomer(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId) ?? customers[0];
}

function moneyInput(value: number, onChange: (value: number) => void) {
  return <input type="number" value={value} onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)} />;
}

function normalizePlans(plans: ServicePlan[]) {
  return plans.map((plan) => ({ ...plan, type: "3-month" as unknown as ServicePlan["type"] }));
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
        <div>{kicker && <p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">{kicker}</p>}<h2 className="text-xl font-semibold text-ink dark:text-white">{title}</h2></div>
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
        <div><p className="text-sm text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-ink dark:text-white">{value}</p></div>
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
  const [jobs, setJobs] = useState<Job[]>(importedJobs.map((job) => ({ ...job, crewIds: [] })));
  const [invoices, setInvoices] = useState<Invoice[]>(importedInvoices);
  const [plans, setPlans] = useState<ServicePlan[]>(normalizePlans(importedServicePlans));
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
      if (payload.customers) setCustomers(payload.customers);
      if (payload.jobs) setJobs(payload.jobs.map((job) => ({ ...job, crewIds: [] })));
      if (payload.invoices) setInvoices(payload.invoices);
      if (payload.servicePlans) setPlans(normalizePlans(payload.servicePlans));
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

  function updateJob(jobId: string, patch: Partial<Job>) {
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, ...patch } : job));
  }

  function updateInvoice(invoiceId: string, patch: Partial<Invoice>) {
    setInvoices((current) => current.map((invoice) => invoice.id === invoiceId ? { ...invoice, ...patch } : invoice));
  }

  function updatePlan(planId: string, patch: Partial<ServicePlan>) {
    setPlans((current) => current.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan));
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
          <div className="mb-6 rounded-lg bg-ink p-4 text-white"><p className="text-sm text-cyan-100">ClearFlow</p><h1 className="text-xl font-bold">Power Washing Ops</h1><p className="mt-2 text-xs text-slate-300">Daily control center for jobs, invoices, reviews, and growth.</p></div>
          <nav className="space-y-1">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`desktop-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <button className="icon-button mt-1 lg:hidden" onClick={() => setMobileMenuOpen(true)} title="Open navigation" aria-label="Open navigation"><Menu size={18} /></button>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">June 8, 2026</p><h1 className="text-2xl font-bold text-ink dark:text-white">{activeLabel}</h1><p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">{syncStatus}</p></div>
              </div>
              <div className="flex items-center gap-2"><span className="hidden rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200 sm:inline-flex">{currency.format(metrics.dailyRevenue)} collected today</span><button className="text-button" disabled={syncing} onClick={() => void syncSheets()}>{syncing ? "Syncing" : "Sync sheets"}</button><button className="icon-button" onClick={() => setDarkMode(!darkMode)} title="Toggle theme">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button></div>
            </div>
          </header>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <button className="absolute inset-0 bg-ink/45" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />
              <aside className="relative flex h-full w-[min(86vw,340px)] flex-col border-r border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-ink p-4 text-white">
                  <div><p className="text-sm text-cyan-100">ClearFlow</p><h2 className="text-lg font-bold">Power Washing Ops</h2><p className="mt-1 text-xs text-slate-300">Choose a dashboard tab.</p></div>
                  <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/20 text-white transition hover:bg-white/10" onClick={() => setMobileMenuOpen(false)} title="Close navigation" aria-label="Close navigation"><X size={18} /></button>
                </div>
                <nav className="space-y-1 overflow-y-auto">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`mobile-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
              </aside>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">{activeTab === "dashboard" && <Dashboard customers={customers} jobs={jobs} invoices={invoices} reviews={reviews} onJobClick={setSelectedJob} />}{activeTab === "customers" && <Customers customers={customers} jobs={jobs} invoices={invoices} />}{activeTab === "leads" && <Leads />}{activeTab === "jobs" && <Jobs customers={customers} jobs={jobs} onJobClick={setSelectedJob} onJobUpdate={updateJob} />}{activeTab === "calendar" && <Calendar customers={customers} jobs={jobs} onJobClick={setSelectedJob} />}{activeTab === "finance" && <Finance customers={customers} jobs={jobs} invoices={invoices} onJobUpdate={updateJob} />}{activeTab === "invoices" && <Invoices customers={customers} invoices={invoices} onInvoiceUpdate={updateInvoice} onInvoiceCreate={createInvoice} />}{activeTab === "plans" && <Plans customers={customers} plans={plans} onPlanUpdate={updatePlan} />}{activeTab === "reports" && <Reports customers={customers} jobs={jobs} invoices={invoices} />}{activeTab === "reviews" && <Reviews reviews={reviews} />}</div>
        </main>
      </div>
      {selectedJob && <JobModal customers={customers} job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  );
}

function Dashboard({ customers, jobs, invoices, reviews, onJobClick }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; reviews: ReviewRow[]; onJobClick: (job: Job) => void }) {
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const upcoming = jobs.filter((job) => job.status === "scheduled" || job.status === "in progress").slice(0, 6);
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="space-y-4"><Section title="Today at a glance" kicker="Business dashboard" action={<span className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-100">{spreadsheetImportNotice}</span>}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Daily job revenue" value={currency.format(metrics.dailyRevenue)} detail="Payments collected today" icon={BadgeDollarSign} /><Stat label="Daily pay" value={currency.format(0)} detail="No crew payroll set up yet" icon={WalletCards} /><Stat label="Jobs today" value={`${metrics.jobsToday}`} detail={`${metrics.upcomingJobs} upcoming or active`} icon={BriefcaseBusiness} /><Stat label="Past due jobs" value={`${metrics.pastDueJobs}`} detail={`${currency.format(metrics.unpaidInvoiceTotal)} owed`} icon={FileText} /><Stat label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="June collected revenue and tips" icon={BarChart3} /><Stat label="Unpaid invoices" value={`${metrics.unpaidInvoiceCount}`} detail="Unpaid, partial, and past due" icon={ReceiptText} /><Stat label="Total tips" value={currency.format(metrics.totalTips)} detail="Tracked across all completed jobs" icon={Sparkles} /><Stat label="Reviews" value={`${average.toFixed(1)} / 5`} detail={`${reviews.length} imported reviews`} icon={Star} /></div></Section><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><Section title="Upcoming jobs" kicker="Imported schedule"><div className="grid gap-3 md:grid-cols-2">{upcoming.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-lagoon hover:bg-mist dark:border-slate-800 dark:hover:bg-slate-800"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{job.date} at {job.time}</p></div><Badge status={job.status} /></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{job.serviceType}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{job.address}</p></button>)}</div></Section><Section title="Customer insights" kicker="Retention signals"><div className="space-y-3">{bestCustomers(customers, jobs).map((customer) => <div key={customer.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><div><p className="font-semibold text-ink dark:text-white">{customer.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{customer.insights.join(" / ")}</p></div><p className="font-semibold text-lagoon dark:text-cyan-300">{currency.format(customer.spent)}</p></div>)}</div></Section></div></div>;
}

function Customers({ customers, jobs, invoices }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[] }) {
  return <Section title="Customer management" kicker="Profiles, spend, payments, and jobs"><DataTable><table className="data-table"><thead><tr><th>Customer</th><th>Contact</th><th>Past / Upcoming</th><th>Total spent</th><th>Plan</th><th>Insights</th><th>Payment history</th></tr></thead><tbody>{customers.map((customer) => { const customerJobs = jobsForCustomer(customer.id, jobs); const past = customerJobs.filter((job) => job.status === "completed" || job.status === "past due").length; const upcoming = customerJobs.filter((job) => job.status === "scheduled" || job.status === "in progress").length; return <tr key={customer.id}><td><p className="font-semibold text-ink dark:text-white">{customer.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{customer.address}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{customer.notes}</p></td><td>{customer.phone}<br />{customer.email}</td><td>{past} past / {upcoming} upcoming</td><td>{currency.format(customerSpend(customer.id, jobs))}</td><td>{customer.subscribedPlanId ? <Badge status="paid" /> : <Badge status="unpaid" />}</td><td className="space-y-1">{customer.insights.map((insight) => <Badge key={insight} status={insight.includes("overdue") ? "past due" : "completed"} />)}</td><td>{paymentHistory(customer.id, invoices).map((invoice) => `${invoice.id}: ${currency.format(invoice.amountPaid)}`).join(", ") || "No invoices yet"}</td></tr>; })}</tbody></table></DataTable></Section>;
}

function Leads() {
  const wins = leads.filter((lead) => lead.status === "won" || lead.status === "scheduled").length;
  return <Section title="Leads & prospects" kicker={`${Math.round((wins / leads.length) * 100)}% conversion tracked`}><DataTable><table className="data-table"><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Est. value</th><th>Follow-up</th><th>Notes</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><p className="font-semibold text-ink dark:text-white">{lead.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.contact}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.address}</p></td><td>{lead.source}</td><td><Badge status={lead.status} /></td><td>{currency.format(lead.estimatedValue)}</td><td>{lead.followUpDate}</td><td>{lead.notes}</td></tr>)}</tbody></table></DataTable></Section>;
}

function Jobs({ customers, jobs, onJobClick, onJobUpdate }: { customers: Customer[]; jobs: Job[]; onJobClick: (job: Job) => void; onJobUpdate: (jobId: string, patch: Partial<Job>) => void }) {
  return <Section title="Jobs management" kicker="Schedule, completion, photos, and payments"><DataTable><table className="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Service</th><th>Status</th><th>Assignment</th><th>Price / Paid / Tip</th><th>Payment</th><th>Photos</th><th>Actions</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.date}<br />{job.time}</td><td><p className="font-semibold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{job.address}</p></td><td>{job.serviceType}<p className="text-xs text-slate-500 dark:text-slate-400">{job.notes}</p></td><td><Badge status={job.status} /></td><td>Unassigned</td><td>{currency.format(job.price)} / {currency.format(job.amountPaid)} / {currency.format(job.tipAmount)}</td><td><Badge status={job.paymentStatus} /></td><td><span className="photo-chip">Before</span><span className="photo-chip">After</span></td><td><div className="flex flex-wrap gap-2"><button className="icon-button" title="Mark complete" onClick={() => onJobUpdate(job.id, { status: "completed", paymentStatus: "paid", amountPaid: job.price })}><CheckCircle2 size={16} /></button><button className="icon-button" title="Mark past due" onClick={() => onJobUpdate(job.id, { status: "past due", paymentStatus: "past due" })}><FileText size={16} /></button><button className="text-button" onClick={() => onJobClick(job)}>Details</button></div></td></tr>)}</tbody></table></DataTable></Section>;
}

function Calendar({ customers, jobs, onJobClick }: { customers: Customer[]; jobs: Job[]; onJobClick: (job: Job) => void }) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const days = mode === "day" ? [{ label: "Today", date: today }] : mode === "week" ? weekDays : monthDays;
  return <Section title="Scheduling calendar" kicker="Date-matched spreadsheet schedule" action={<div className="segmented">{(["day", "week", "month"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={cx(mode === item && "active")}>{item}</button>)}</div>}><div className={cx("calendar-grid", mode === "month" && "month-mode")}>{days.map((day) => { const dayJobs = jobs.filter((job) => job.date === day.date); return <div key={day.date} className="calendar-day"><div className="mb-3 flex items-center justify-between"><p className="font-semibold text-ink dark:text-white">{day.label}</p><span className="text-xs text-slate-500 dark:text-slate-400">{day.date.slice(5)}</span></div>{dayJobs.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">No jobs scheduled</p>}{dayJobs.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="calendar-job"><span className="text-xs font-semibold">{job.time}</span><span className="font-semibold">{findCustomer(customers, job.customerId).name}</span><span className="text-xs">{job.address}</span><span className="text-xs">Unassigned</span><Badge status={job.status} /></button>)}</div>; })}</div></Section>;
}

function Finance({ customers, jobs, invoices, onJobUpdate }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; onJobUpdate: (jobId: string, patch: Partial<Job>) => void }) {
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const customer = findCustomer(customers, selectedId);
  const selectedJobs = jobsForCustomer(customer.id, jobs);
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Stat label="Daily revenue" value={currency.format(metrics.dailyRevenue)} detail="Collected today" icon={BadgeDollarSign} /><Stat label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="Collected this month" icon={BarChart3} /><Stat label="Expenses" value={currency.format(metrics.expenses)} detail="Fuel, chemicals, marketing" icon={CreditCard} /><Stat label="Net profit" value={currency.format(metrics.netProfit)} detail="Revenue minus expenses" icon={WalletCards} /></div><div className="grid gap-4 xl:grid-cols-[300px_1fr]"><Section title="Customer money" kicker="Click a customer"><div className="space-y-2">{customers.map((item) => <button key={item.id} className={cx("w-full rounded-lg border p-3 text-left text-sm transition hover:border-lagoon dark:border-slate-800", customer.id === item.id ? "border-lagoon bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200" : "border-slate-200 text-slate-600 dark:text-slate-300")} onClick={() => setSelectedId(item.id)}><span className="block font-semibold">{item.name}</span><span className="text-xs">{currency.format(customerSpend(item.id, jobs))} collected</span></button>)}</div></Section><Section title={customer.name} kicker="Edit paid amounts, tips, and payment method"><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="metric-mini"><span>Paid</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + job.amountPaid, 0))}</strong></div><div className="metric-mini"><span>Tips</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + job.tipAmount, 0))}</strong></div><div className="metric-mini"><span>Still owed</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + Math.max(job.price - job.amountPaid, 0), 0))}</strong></div></div><div className="space-y-3">{selectedJobs.map((job) => <div key={job.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink dark:text-white">{job.date} - {job.serviceType}</p><Badge status={job.paymentStatus} /></div><div className="settings-grid"><Field label="Job price">{moneyInput(job.price, (value) => onJobUpdate(job.id, { price: value }))}</Field><Field label="Amount paid">{moneyInput(job.amountPaid, (value) => onJobUpdate(job.id, { amountPaid: value }))}</Field><Field label="Tip">{moneyInput(job.tipAmount, (value) => onJobUpdate(job.id, { tipAmount: value }))}</Field><Field label="Payment method"><select value={job.paymentMethod ?? "other"} onChange={(event) => onJobUpdate(job.id, { paymentMethod: event.target.value as PaymentMethod })}>{businessSettings.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></Field></div></div>)}</div></Section></div><Section title="Payment method tracking" kicker="Totals from current job payments"><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{Object.entries(paymentMethodTotals(jobs)).map(([method, total]) => <div key={method} className="metric-mini"><span>{method}</span><strong>{currency.format(total)}</strong></div>)}</div></Section></div>;
}

function Invoices({ customers, invoices, onInvoiceUpdate, onInvoiceCreate }: { customers: Customer[]; invoices: Invoice[]; onInvoiceUpdate: (invoiceId: string, patch: Partial<Invoice>) => void; onInvoiceCreate: () => void }) {
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? "");
  const invoice = invoices.find((item) => item.id === selectedId) ?? invoices[0];
  const customer = invoice ? findCustomer(customers, invoice.customerId) : customers[0];
  const update = (patch: Partial<Invoice>) => invoice && onInvoiceUpdate(invoice.id, patch);
  return <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><Section title="Invoices" kicker="Click any invoice to edit it" action={<button className="primary-button" onClick={() => { onInvoiceCreate(); setSelectedId(`inv-manual-${String(invoices.length + 1).padStart(3, "0")}`); }}>Create invoice</button>}><div className="space-y-2">{invoices.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", invoice?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}><div className="flex items-center justify-between gap-3"><strong className="text-ink dark:text-white">{item.id}</strong><Badge status={item.status} /></div><p className="mt-1 text-sm text-slate-500">{findCustomer(customers, item.customerId).name} - owed {currency.format(amountOwed(item))}</p></button>)}</div></Section>{invoice && <Section title="Invoice editor" kicker="Paid, unpaid, partial, tip, amount paid, amount owed"><div className="settings-grid"><Field label="Customer"><select value={invoice.customerId} onChange={(event) => update({ customerId: event.target.value })}>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Status"><select value={invoice.status} onChange={(event) => update({ status: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><Field label="Service description"><input value={invoice.serviceDescription} onChange={(event) => update({ serviceDescription: event.target.value })} /></Field><Field label="Payment method"><select value={invoice.paymentMethod ?? "other"} onChange={(event) => update({ paymentMethod: event.target.value as PaymentMethod })}>{businessSettings.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></Field><Field label="Price">{moneyInput(invoice.price, (value) => update({ price: value }))}</Field><Field label="Discount">{moneyInput(invoice.discount, (value) => update({ discount: value }))}</Field><Field label="Tip">{moneyInput(invoice.tip, (value) => update({ tip: value }))}</Field><Field label="Amount paid">{moneyInput(invoice.amountPaid, (value) => update({ amountPaid: value }))}</Field></div><div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-ink dark:text-white">{businessSettings.businessName}</h3><p className="text-sm text-slate-500">{businessSettings.phone} / {businessSettings.email}</p></div><p className="font-semibold text-lagoon dark:text-cyan-300">{invoice.id}</p></div><div className="mt-5 grid gap-2 text-sm"><p><strong>Bill to:</strong> {customer.name}</p><p><strong>Service:</strong> {invoice.serviceDescription}</p><p><strong>Message:</strong> {businessSettings.defaultInvoiceMessage}</p></div><div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span>Price</span><strong>{currency.format(invoice.price)}</strong></div><div className="flex justify-between"><span>Discount</span><strong>-{currency.format(invoice.discount)}</strong></div><div className="flex justify-between"><span>Tip</span><strong>{currency.format(invoice.tip)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-2 text-base dark:border-slate-800"><span>Total</span><strong>{currency.format(invoice.price - invoice.discount + invoice.tip)}</strong></div><div className="flex justify-between"><span>Paid</span><strong>{currency.format(invoice.amountPaid)}</strong></div><div className="flex justify-between text-coral"><span>Still owed</span><strong>{currency.format(amountOwed(invoice))}</strong></div></div></div></Section>}</div>;
}

function Plans({ customers, plans, onPlanUpdate }: { customers: Customer[]; plans: ServicePlan[]; onPlanUpdate: (planId: string, patch: Partial<ServicePlan>) => void }) {
  const [selectedId, setSelectedId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((item) => item.id === selectedId) ?? plans[0];
  return <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><Section title="Service plans" kicker="Monthly, 3-month, and yearly plans"><div className="space-y-2">{plans.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", plan?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}><div className="flex items-center justify-between gap-3"><strong className="capitalize text-ink dark:text-white">{item.type} plan</strong><Badge status={item.paymentStatus} /></div><p className="mt-1 text-sm text-slate-500">{findCustomer(customers, item.customerId).name} - renews {item.renewalDate}</p></button>)}</div></Section>{plan && <Section title="Plan editor" kicker="Subscription status, renewal, services, pricing"><div className="settings-grid"><Field label="Customer"><select value={plan.customerId} onChange={(event) => onPlanUpdate(plan.id, { customerId: event.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Plan type"><select value={String(plan.type)} onChange={(event) => onPlanUpdate(plan.id, { type: event.target.value as unknown as ServicePlan["type"] })}>{planTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label="Plan price">{moneyInput(plan.price, (value) => onPlanUpdate(plan.id, { price: value }))}</Field><Field label="Discount %">{moneyInput(plan.discountPct, (value) => onPlanUpdate(plan.id, { discountPct: value }))}</Field><Field label="Renewal date"><input value={plan.renewalDate} onChange={(event) => onPlanUpdate(plan.id, { renewalDate: event.target.value })} /></Field><Field label="Payment status"><select value={plan.paymentStatus} onChange={(event) => onPlanUpdate(plan.id, { paymentStatus: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={plan.notes} onChange={(event) => onPlanUpdate(plan.id, { notes: event.target.value })} /></label></div><div className="mt-4 flex flex-wrap gap-2">{plan.servicesIncluded.map((service) => <span key={service} className="tag">{service}</span>)}</div></Section>}</div>;
}

function Reports({ customers, jobs, invoices }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[] }) {
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const revenue = revenueByDay(jobs);
  const maxRevenue = Math.max(...revenue.map((item) => item.revenue), 1);
  const averageJob = jobs.reduce((sum, job) => sum + job.price, 0) / jobs.length;
  const repeatRate = Math.round((customers.filter((customer) => customer.insights.includes("repeat customer")).length / customers.length) * 100);
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Stat label="Jobs completed" value={`${metrics.completedJobs}`} detail={`${metrics.upcomingJobs} scheduled or active`} icon={CheckCircle2} /><Stat label="Jobs past due" value={`${metrics.pastDueJobs}`} detail="Needs action" icon={FileText} /><Stat label="Average job value" value={currency.format(averageJob)} detail="Across imported jobs" icon={BadgeDollarSign} /><Stat label="Repeat customer rate" value={`${repeatRate}%`} detail="Customers tagged repeat" icon={Users} /></div><div className="grid gap-4 xl:grid-cols-2"><Section title="Revenue over time" kicker="Daily and monthly revenue"><div className="space-y-3">{revenue.map((item) => <div key={item.date}><div className="mb-1 flex justify-between text-sm"><span>{item.date}</span><strong>{currency.format(item.revenue)}</strong></div><div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-3 rounded-full bg-lagoon" style={{ width: `${Math.max(5, (item.revenue / maxRevenue) * 100)}%` }} /></div></div>)}</div></Section><Section title="Most common services" kicker="Service types and revenue"><DataTable><table className="data-table"><thead><tr><th>Service</th><th>Jobs</th><th>Revenue</th></tr></thead><tbody>{serviceBreakdown(jobs).map((service) => <tr key={service.name}><td>{service.name}</td><td>{service.count}</td><td>{currency.format(service.revenue)}</td></tr>)}</tbody></table></DataTable></Section><Section title="Best customers" kicker="Spend and retention"><div className="space-y-3">{bestCustomers(customers, jobs).map((customer) => <div key={customer.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="font-semibold text-ink dark:text-white">{customer.name}</span><span>{currency.format(customer.spent)}</span></div>)}</div></Section><Section title="Paid vs unpaid" kicker="Invoice mix, tips, lead conversion"><div className="grid gap-3 sm:grid-cols-2"><div className="metric-mini"><span>Paid invoices</span><strong>{invoices.filter((invoice) => invoice.status === "paid").length}</strong></div><div className="metric-mini"><span>Unpaid invoices</span><strong>{invoices.filter((invoice) => invoice.status !== "paid").length}</strong></div><div className="metric-mini"><span>Tips earned</span><strong>{currency.format(metrics.totalTips)}</strong></div><div className="metric-mini"><span>Worker payouts</span><strong>$0</strong></div><div className="metric-mini"><span>Lead conversion</span><strong>{metrics.conversionRate}%</strong></div><div className="metric-mini"><span>Jobs scheduled</span><strong>{metrics.upcomingJobs}</strong></div></div></Section></div></div>;
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Stat label="Average rating" value={`${average.toFixed(1)} / 5`} detail="Powerwashing reviews sheet" icon={Star} /><Stat label="Reviews imported" value={`${reviews.length}`} detail="Synced review rows" icon={ReceiptText} /><Stat label="Five-star reviews" value={`${reviews.filter((review) => review.rating === 5).length}`} detail="Ready for follow-up" icon={CheckCircle2} /></div><Section title="Power Washing Reviews" kicker="Imported from Google Drive spreadsheet"><div className="grid gap-3 lg:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink dark:text-white">{review.name}</h3><p className="text-xs text-slate-500">{new Date(review.submittedAt).toLocaleDateString()}</p></div><span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{review.rating} stars</span></div><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.review}</p></article>)}</div></Section></div>;
}

function JobModal({ customers, job, onClose }: { customers: Customer[]; job: Job; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Job details</p><h3 className="text-xl font-bold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</h3><p className="text-sm text-slate-500">{job.date} at {job.time}</p></div><button className="icon-button" onClick={onClose} title="Close">x</button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="detail-row"><span>Address</span><strong>{job.address}</strong></div><div className="detail-row"><span>Service</span><strong>{job.serviceType}</strong></div><div className="detail-row"><span>Assignment</span><strong>Unassigned</strong></div><div className="detail-row"><span>Status</span><Badge status={job.status} /></div><div className="detail-row"><span>Price</span><strong>{currency.format(job.price)}</strong></div><div className="detail-row"><span>Paid / tip</span><strong>{currency.format(job.amountPaid)} / {currency.format(job.tipAmount)}</strong></div><div className="detail-row md:col-span-2"><span>Notes</span><strong>{job.notes}</strong></div></div><div className="mt-5 grid gap-3 md:grid-cols-2"><div className="photo-box">Before photo placeholder</div><div className="photo-box">After photo placeholder</div></div></div></div>;
}
