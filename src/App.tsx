import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BadgeDollarSign,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  MapPinned,
  Menu,
  Moon,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Star,
  Sun,
  Users,
  X,
} from "lucide-react";
import { BusinessMap } from "./components/BusinessMap";
import {
  customers as importedCustomers,
  expenses,
  invoices as importedInvoices,
  jobs as importedJobs,
  leads as importedLeads,
  servicePlans as importedServicePlans,
  spreadsheetImportNotice,
} from "./data/googleSheetData";
import { reviews as importedReviews } from "./data/reviews";
import {
  annualRecurringRevenue,
  businessMetrics,
  cumulativeRevenueOverTime,
  currency,
  customerSpend,
  isoToday,
  isUpcomingJob,
  jobDisplayStatus,
  jobsForCustomer,
  paymentHistory,
  recurringPlanType,
} from "./lib/calculations";
import { createSolicitation, deleteSolicitation, loadDatabaseSnapshot, saveJobPatch, saveLeadPatch, saveServicePlanPatch, saveSolicitationPatch, syncSheetsToDatabase } from "./lib/api";
import type { Customer, Invoice, Job, Lead, LeadStatus, PaymentStatus, ServicePlan, Solicitation } from "./types/business";

type ReviewRow = { id: string; submittedAt: string; name: string; rating: number; review: string; source: string };
type TabId = "dashboard" | "customers" | "leads" | "calendar" | "map" | "plans" | "reviews";
type SyncPayload = Partial<{ customers: Customer[]; jobs: Job[]; leads: Lead[]; invoices: Invoice[]; servicePlans: ServicePlan[]; reviews: ReviewRow[]; solicitations: Solicitation[] }>;
type SyncOptions = { background?: boolean };
type CalendarDay = { label: string; date: string };

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "leads", label: "Leads", icon: Sparkles },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "map", label: "Map", icon: MapPinned },
  { id: "plans", label: "Service Plans", icon: ClipboardList },
  { id: "reviews", label: "Reviews", icon: Star },
];

const planTypes = ["monthly", "3-month", "4-month", "6-month", "yearly"];
const leadStatuses: LeadStatus[] = ["new", "contacted", "quoted", "scheduled", "won", "lost"];
const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const calendarSkeletonDurationMs = 1_500;

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ThemeSwitch({ darkMode, onToggle }: { darkMode: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={cx("theme-switch", darkMode && "is-dark")}
      onClick={onToggle}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={darkMode}
      title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="theme-stars" aria-hidden="true"><i /><i /><i /></span>
      <span className="theme-cloud" aria-hidden="true"><i /><i /></span>
      <span className="theme-orb" aria-hidden="true">
        <Sun className="theme-sun" size={18} strokeWidth={2.4} />
        <Moon className="theme-moon" size={17} strokeWidth={2.4} />
      </span>
    </button>
  );
}

function findCustomer(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId) ?? customers[0];
}

function moneyInput(value: number, onChange: (value: number) => void) {
  return <input type="number" value={value} onChange={(event) => onChange(Number.parseFloat(event.target.value) || 0)} />;
}

function dateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
}

function startOfWeek(date: Date) {
  const dayIndex = date.getDay();
  return addDays(date, dayIndex === 0 ? -6 : 1 - dayIndex);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function calendarLabel(date: Date, mode: "day" | "week" | "month") {
  if (mode === "day") return fullDateFormatter.format(date);
  if (mode === "month") return monthFormatter.format(date);
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  return `${fullDateFormatter.format(weekStart)} - ${fullDateFormatter.format(weekEnd)}`;
}

function calendarDays(anchorDate: Date, mode: "day" | "week" | "month"): CalendarDay[] {
  if (mode === "day") return [{ label: dayFormatter.format(anchorDate), date: isoFromDate(anchorDate) }];
  if (mode === "week") {
    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return { label: `${dayFormatter.format(date)} ${date.getDate()}`, date: isoFromDate(date) };
    });
  }
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  return Array.from({ length: daysInMonth(monthStart) }, (_, index) => {
    const date = addDays(monthStart, index);
    return { label: `${dayFormatter.format(date)} ${date.getDate()}`, date: isoFromDate(date) };
  });
}

function recurringCustomerName(plan: ServicePlan) {
  return plan.notes.match(/Recurring Jobs sheet:\s*([^,]+)/i)?.[1]?.trim() || "Recurring customer";
}

function mergeRecurringCustomers(customers: Customer[], plans: ServicePlan[]) {
  const customerIds = new Set(customers.map((customer) => customer.id));
  const recurringCustomers = plans
    .filter((plan) => !customerIds.has(plan.customerId))
    .map<Customer>((plan) => ({
      id: plan.customerId,
      name: recurringCustomerName(plan),
      phone: "",
      email: "",
      address: "",
      notes: "Imported from the Recurring Jobs sheet.",
      subscribedPlanId: plan.id,
      insights: ["repeat customer"],
    }));

  return customers
    .map((customer) => {
      const linkedPlan = plans.find((plan) => plan.customerId === customer.id);
      return linkedPlan ? { ...customer, subscribedPlanId: linkedPlan.id } : customer;
    })
    .concat(recurringCustomers);
}

function normalizePlans(plans: ServicePlan[]): ServicePlan[] {
  return plans.map((plan) => ({ ...plan, type: recurringPlanType(plan) }));
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

function DashboardMetric({ label, value, detail, icon: Icon, featured, className }: { label: string; value: string; detail: string; icon: ElementType; featured?: boolean; className?: string }) {
  return (
    <Card className={cx("relative min-h-[164px] overflow-hidden", featured && "border-lagoon/40 bg-mist/60 dark:border-cyan-400/30 dark:bg-cyan-500/10", className)}>
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <div className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg", featured ? "bg-lagoon text-white dark:bg-cyan-300 dark:text-slate-950" : "bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200")}>
            <Icon size={20} />
          </div>
        </div>
        <div>
          <p className={cx("font-bold text-ink dark:text-white", featured ? "text-4xl" : "text-3xl")}>{value}</p>
          <p className="mt-2 text-sm leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
        </div>
      </div>
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
  const [leads, setLeads] = useState<Lead[]>(importedLeads);
  const [invoices, setInvoices] = useState<Invoice[]>(importedInvoices);
  const [plans, setPlans] = useState<ServicePlan[]>(normalizePlans(importedServicePlans));
  const [reviews, setReviews] = useState<ReviewRow[]>(importedReviews);
  const [solicitations, setSolicitations] = useState<Solicitation[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Using bundled Google Sheets snapshot.");
  const [syncing, setSyncing] = useState(false);
  const [showCalendarSkeleton, setShowCalendarSkeleton] = useState(false);
  const calendarSkeletonShown = useRef(false);
  const calendarSkeletonTimer = useRef<number | null>(null);
  const [currentDate, setCurrentDate] = useState(() => isoToday());
  const metrics = businessMetrics(jobs, invoices, leads, expenses, [], currentDate);
  const activeLabel = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label ?? "Dashboard", [activeTab]);
  const syncEndpoint = import.meta.env.VITE_SHEETS_SYNC_URL as string | undefined;

  const syncSheets = useCallback(async ({ background = false }: SyncOptions = {}) => {
    const minimumManualSkeleton = background
      ? null
      : new Promise<void>((resolve) => window.setTimeout(resolve, calendarSkeletonDurationMs));
    if (!background) {
      setSyncing(true);
      setSyncStatus(syncEndpoint ? "Syncing Google Sheets..." : "Syncing through the database...");
      if (calendarSkeletonTimer.current !== null) {
        window.clearTimeout(calendarSkeletonTimer.current);
        calendarSkeletonTimer.current = null;
      }
      setShowCalendarSkeleton(true);
    }
    try {
      let payload = await syncSheetsToDatabase() as SyncPayload | null;
      if (!payload && syncEndpoint) {
        const response = await fetch(syncEndpoint);
        if (!response.ok) throw new Error(`Sync failed with ${response.status}`);
        payload = (await response.json()) as SyncPayload;
      }
      if (!payload) throw new Error("Live sync is not configured on this deployment.");
      if (payload.customers) setCustomers(mergeRecurringCustomers(payload.customers, payload.servicePlans ?? []));
      if (payload.jobs) setJobs(payload.jobs.map((job) => ({ ...job, crewIds: [] })));
      if (payload.leads) setLeads(payload.leads);
      if (payload.invoices) setInvoices(payload.invoices);
      if (payload.servicePlans) setPlans(normalizePlans(payload.servicePlans));
      if (payload.reviews) setReviews(payload.reviews);
      if (payload.solicitations) setSolicitations(payload.solicitations);
      setSyncStatus(`Synced from Google Sheets at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Google Sheets sync failed.");
    } finally {
      if (!background) {
        await minimumManualSkeleton;
        setSyncing(false);
        setShowCalendarSkeleton(false);
      }
    }
  }, [syncEndpoint]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentDate(isoToday()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let ignore = false;
    void loadDatabaseSnapshot()
      .then((payload) => {
        if (ignore || !payload) return;
        if (payload.customers) setCustomers(mergeRecurringCustomers(payload.customers, payload.servicePlans ?? []));
        if (payload.jobs) setJobs(payload.jobs.map((job) => ({ ...job, crewIds: [] })));
        if (payload.leads) setLeads(payload.leads);
        if (payload.invoices) setInvoices(payload.invoices);
        if (payload.servicePlans) setPlans(normalizePlans(payload.servicePlans));
        if (payload.reviews) setReviews(payload.reviews);
        if (payload.solicitations) setSolicitations(payload.solicitations);
        setSyncStatus("Loaded saved database records.");
      })
      .catch((error) => {
        setSyncStatus(error instanceof Error ? error.message : "Database load failed.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!syncEndpoint) return;
    void syncSheets({ background: true });
    const interval = window.setInterval(() => void syncSheets({ background: true }), 60_000);
    return () => window.clearInterval(interval);
  }, [syncEndpoint, syncSheets]);

  useEffect(() => () => {
    if (calendarSkeletonTimer.current !== null) window.clearTimeout(calendarSkeletonTimer.current);
  }, []);

  function updateLead(leadId: string, patch: Partial<Lead>) {
    setLeads((current) => current.map((lead) => lead.id === leadId ? { ...lead, ...patch } : lead));
    void saveLeadPatch(leadId, patch).catch((error) => {
      setSyncStatus(error instanceof Error ? error.message : "Lead save failed.");
    });
  }

  function updatePlan(planId: string, patch: Partial<ServicePlan>) {
    setPlans((current) => current.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan));
    void saveServicePlanPatch(planId, patch).catch((error) => {
      setSyncStatus(error instanceof Error ? error.message : "Service plan save failed.");
    });
  }

  const saveMapJobCoordinates = useCallback(async (jobIds: string[], coordinates: { latitude: number; longitude: number }) => {
    async function persistCoordinates(jobId: string) {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const saved = await saveJobPatch(jobId, coordinates);
          if (saved) return;
          lastError = new Error("Coordinate save service is unavailable.");
        } catch (error) {
          lastError = error;
        }
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
      }
      throw lastError instanceof Error ? lastError : new Error("Unable to save job coordinates.");
    }

    await Promise.all(jobIds.map(persistCoordinates));
    const idSet = new Set(jobIds);
    setJobs((current) => current.map((job) => idSet.has(job.id) ? { ...job, ...coordinates } : job));
  }, []);

  const addSolicitation = useCallback(async (draft: Omit<Solicitation, "id">) => {
    const saved = await createSolicitation(draft);
    setSolicitations((current) => [saved ?? { ...draft, id: crypto.randomUUID() }, ...current]);
  }, []);

  const updateSolicitation = useCallback(async (id: string, patch: Partial<Solicitation>) => {
    await saveSolicitationPatch(id, patch);
    setSolicitations((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const removeSolicitation = useCallback(async (id: string) => {
    await deleteSolicitation(id);
    setSolicitations((current) => current.filter((item) => item.id !== id));
  }, []);

  function chooseTab(tabId: TabId) {
    if (tabId === "calendar" && !calendarSkeletonShown.current) {
      calendarSkeletonShown.current = true;
      setShowCalendarSkeleton(true);
      calendarSkeletonTimer.current = window.setTimeout(() => setShowCalendarSkeleton(false), calendarSkeletonDurationMs);
    }
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  }

  return (
    <div className={cx("min-h-screen w-full max-w-full overflow-x-hidden", darkMode && "dark")}>
      <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
          <div className="mb-6 rounded-lg bg-ink p-4 text-white"><p className="text-sm text-cyan-100">The</p><h1 className="text-xl font-bold">Powerwashing Pros</h1><p className="mt-2 text-xs text-slate-300">Daily control center for jobs, reviews, and growth.</p></div>
          <nav className="space-y-1">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`desktop-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
        </aside>
        <main className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
          <header className="min-w-0 max-w-full border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <button className="icon-button mt-1 lg:hidden" onClick={() => setMobileMenuOpen(true)} title="Open navigation" aria-label="Open navigation"><Menu size={18} /></button>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">{fullDateFormatter.format(dateFromIso(currentDate))}</p><h1 className="text-2xl font-bold text-ink dark:text-white">{activeLabel}</h1><p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">{syncStatus}</p></div>
              </div>
              <div className="flex items-center gap-2"><span className="hidden rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200 sm:inline-flex">{currency.format(metrics.dailyRevenue)} job value today</span><button className="text-button" disabled={syncing} onClick={() => void syncSheets()}>{syncing ? "Syncing" : "Sync sheets"}</button><ThemeSwitch darkMode={darkMode} onToggle={() => setDarkMode(!darkMode)} /></div>
            </div>
          </header>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <button className="absolute inset-0 bg-ink/45" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />
              <aside className="relative flex h-full w-[min(86vw,340px)] flex-col border-r border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-ink p-4 text-white">
                  <div><p className="text-sm text-cyan-100">The</p><h2 className="text-lg font-bold">Powerwashing Pros</h2><p className="mt-1 text-xs text-slate-300">Choose a dashboard tab.</p></div>
                  <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/20 text-white transition hover:bg-white/10" onClick={() => setMobileMenuOpen(false)} title="Close navigation" aria-label="Close navigation"><X size={18} /></button>
                </div>
                <nav className="space-y-1 overflow-y-auto">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`mobile-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
              </aside>
            </div>
          )}
          <div className="min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6">
            {activeTab === "dashboard" && <Dashboard jobs={jobs} leads={leads} invoices={invoices} plans={plans} reviews={reviews} currentDate={currentDate} />}
            {activeTab === "customers" && <Customers customers={customers} jobs={jobs} invoices={invoices} currentDate={currentDate} />}
            {activeTab === "leads" && <Leads leads={leads} onLeadUpdate={updateLead} />}
            {activeTab === "calendar" && <Calendar customers={customers} jobs={jobs} currentDate={currentDate} loading={showCalendarSkeleton} onJobClick={setSelectedJob} />}
            {activeTab === "map" && <BusinessMap customers={customers} jobs={jobs} solicitations={solicitations} onSaveJobCoordinates={saveMapJobCoordinates} onCreateSolicitation={addSolicitation} onUpdateSolicitation={updateSolicitation} onDeleteSolicitation={removeSolicitation} />}
            {activeTab === "plans" && <Plans customers={customers} plans={plans} onPlanUpdate={updatePlan} />}
            {activeTab === "reviews" && <Reviews reviews={reviews} />}
          </div>
        </main>
      </div>
      {selectedJob && <JobModal customers={customers} job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </div>
  );
}

function Dashboard({ jobs, leads, invoices, plans, reviews, currentDate }: { jobs: Job[]; leads: Lead[]; invoices: Invoice[]; plans: ServicePlan[]; reviews: ReviewRow[]; currentDate: string }) {
  const [revenueRange, setRevenueRange] = useState<"90d" | "12m" | "all">("all");
  const metrics = businessMetrics(jobs, invoices, leads, expenses, [], currentDate);
  const recurringRevenue = annualRecurringRevenue(plans);
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  const pricedPlans = plans.filter((plan) => plan.price > 0).length;
  const revenueGrowth = useMemo(() => cumulativeRevenueOverTime(jobs), [jobs]);
  const visibleRevenue = useMemo(() => {
    if (revenueRange === "all") return revenueGrowth;
    const cutoff = dateFromIso(currentDate);
    cutoff.setDate(cutoff.getDate() - (revenueRange === "90d" ? 90 : 365));
    const cutoffIso = isoFromDate(cutoff);
    return revenueGrowth.filter((point) => point.date >= cutoffIso);
  }, [currentDate, revenueGrowth, revenueRange]);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Business overview</p>
          <h2 className="mt-1 text-2xl font-bold text-ink dark:text-white">Performance snapshot</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The numbers that matter most, in one place.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-200">
          <CheckCircle2 size={16} />
          Live spreadsheet data
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
        <DashboardMetric className="xl:col-span-6" label="Total revenue" value={currency.format(metrics.totalRevenue)} detail="All completed and future one-time jobs" icon={BadgeDollarSign} featured />
        <DashboardMetric className="xl:col-span-3" label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="Scheduled and completed this month" icon={BarChart3} />
        <DashboardMetric className="xl:col-span-3" label="Annual recurring revenue" value={currency.format(recurringRevenue)} detail={`${pricedPlans} priced plans annualized`} icon={RefreshCw} />
        <DashboardMetric className="xl:col-span-4" label="Today's job value" value={currency.format(metrics.dailyRevenue)} detail="Total price of today's jobs" icon={BadgeDollarSign} />
        <DashboardMetric className="xl:col-span-4" label="Jobs today" value={`${metrics.jobsToday}`} detail={`${metrics.upcomingJobs} upcoming or active`} icon={BriefcaseBusiness} />
        <DashboardMetric className="xl:col-span-4" label="Customer reviews" value={`${average.toFixed(1)} / 5`} detail={`${reviews.length} imported reviews`} icon={Star} />
      </div>

      <Section title="Total revenue growth" kicker="Cumulative booked revenue" action={<div className="segmented" aria-label="Revenue chart range">{(["90d", "12m", "all"] as const).map((range) => <button key={range} type="button" onClick={() => setRevenueRange(range)} className={cx(revenueRange === range && "active")}>{range === "all" ? "All time" : range === "12m" ? "12 months" : "90 days"}</button>)}</div>}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3"><p className="text-2xl font-bold text-ink dark:text-white">{currency.format(visibleRevenue.at(-1)?.total ?? 0)}</p><p className="text-xs text-slate-500 dark:text-slate-400">Hover or tap a point for details · Canceled jobs excluded</p></div>
        <div className="h-72 min-h-72 w-full" aria-label="Interactive total revenue growth chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={visibleRevenue} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="revenueGrowthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#087f8c" stopOpacity={0.3} /><stop offset="100%" stopColor="#087f8c" stopOpacity={0.03} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.5} /><XAxis dataKey="label" minTickGap={28} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis width={48} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [currency.format(Number(value)), "Total revenue"]} labelFormatter={(_, payload) => payload[0]?.payload?.date ?? ""} contentStyle={{ borderRadius: 6, borderColor: "#cbd5e1", fontSize: 12 }} /><Area type="monotone" dataKey="total" stroke="#087f8c" strokeWidth={3} fill="url(#revenueGrowthFill)" dot={{ r: 3, fill: "#087f8c", stroke: "#ffffff", strokeWidth: 1 }} activeDot={{ r: 6, strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div>
      </Section>

      <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{spreadsheetImportNotice}</p>
    </div>
  );
}

function Customers({ customers, jobs, invoices, currentDate }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; currentDate: string }) {
  return <Section title="Customer management" kicker="Profiles, spend, payments, and jobs"><DataTable><table className="data-table"><thead><tr><th>Customer</th><th>Contact</th><th>Past / Upcoming</th><th>Total spent</th><th>Plan</th><th>Insights</th><th>Payment history</th></tr></thead><tbody>{customers.map((customer) => { const customerJobs = jobsForCustomer(customer.id, jobs); const past = customerJobs.filter((job) => job.status === "completed" || jobDisplayStatus(job, currentDate) === "past due").length; const upcoming = customerJobs.filter((job) => isUpcomingJob(job, currentDate)).length; return <tr key={customer.id}><td><p className="font-semibold text-ink dark:text-white">{customer.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{customer.address}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{customer.notes}</p></td><td>{customer.phone}<br />{customer.email}</td><td>{past} past / {upcoming} upcoming</td><td>{currency.format(customerSpend(customer.id, jobs))}</td><td>{customer.subscribedPlanId ? <Badge status="paid" /> : <Badge status="unpaid" />}</td><td className="space-y-1">{customer.insights.map((insight) => <Badge key={insight} status={insight.includes("overdue") ? "past due" : "completed"} />)}</td><td>{paymentHistory(customer.id, invoices).map((invoice) => `${invoice.id}: ${currency.format(invoice.amountPaid)}`).join(", ") || "No invoices yet"}</td></tr>; })}</tbody></table></DataTable></Section>;
}

function Leads({ leads, onLeadUpdate }: { leads: Lead[]; onLeadUpdate: (leadId: string, patch: Partial<Lead>) => void }) {
  const wins = leads.filter((lead) => lead.status === "won" || lead.status === "scheduled").length;
  return <Section title="Leads & prospects" kicker={`${Math.round((wins / leads.length) * 100)}% conversion tracked`}><DataTable><table className="data-table"><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Est. value</th><th>Follow-up</th><th>Notes</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><p className="font-semibold text-ink dark:text-white">{lead.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.contact}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.address}</p></td><td>{lead.source}</td><td><div className="space-y-2"><Badge status={lead.status} /><select value={lead.status} onChange={(event) => onLeadUpdate(lead.id, { status: event.target.value as LeadStatus })}>{leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></td><td>{currency.format(lead.estimatedValue)}</td><td>{lead.followUpDate}</td><td>{lead.notes}</td></tr>)}</tbody></table></DataTable></Section>;
}

function jobsGroupedByTime(jobs: Job[]) {
  const groups = new Map<string, Job[]>();

  [...jobs].sort((a, b) => a.time.localeCompare(b.time)).forEach((job) => {
    const timeJobs = groups.get(job.time) ?? [];
    timeJobs.push(job);
    groups.set(job.time, timeJobs);
  });

  return [...groups.entries()];
}

function widestTimeGroup(jobs: Job[]) {
  return Math.max(1, ...jobsGroupedByTime(jobs).map(([, timeJobs]) => timeJobs.length));
}

function Calendar({ customers, jobs, currentDate, loading, onJobClick }: { customers: Customer[]; jobs: Job[]; currentDate: string; loading: boolean; onJobClick: (job: Job) => void }) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const [anchorIso, setAnchorIso] = useState(currentDate);
  const anchorDate = dateFromIso(anchorIso);
  const days = calendarDays(anchorDate, mode);
  const dayJobs = days.map((day) => jobs.filter((job) => job.date === day.date));
  const daySpans = dayJobs.map(widestTimeGroup);
  const calendarSlotCount = mode === "week" ? daySpans.reduce((total, span) => total + span, 0) : days.length;
  const calendarStyle = {
    "--calendar-slot-count": calendarSlotCount,
    "--calendar-min-width": `${calendarSlotCount * 180 + Math.max(0, calendarSlotCount - 1) * 12}px`,
  } as CSSProperties;
  const moveCalendar = (direction: -1 | 1) => {
    const next = mode === "month" ? addMonths(anchorDate, direction) : addDays(anchorDate, direction * (mode === "week" ? 7 : 1));
    setAnchorIso(isoFromDate(next));
  };
  if (loading) {
    return (
      <Section
        title="Scheduling calendar"
        kicker="Date-matched spreadsheet schedule"
        action={<div className="flex flex-wrap items-center justify-end gap-2"><button className="icon-button" onClick={() => moveCalendar(-1)} title={`Previous ${mode}`} aria-label={`Previous ${mode}`}><ChevronLeft size={18} /></button><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-lagoon hover:text-lagoon dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => setAnchorIso(currentDate)}>Today</button><button className="icon-button" onClick={() => moveCalendar(1)} title={`Next ${mode}`} aria-label={`Next ${mode}`}><ChevronRight size={18} /></button><div className="segmented">{(["day", "week", "month"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={cx(mode === item && "active")}>{item}</button>)}</div></div>}
      >
        <div className="space-y-4" role="status" aria-live="polite" aria-label="Syncing calendar">
          <div className="flex items-center justify-between gap-4">
            <div className="skeleton-shimmer h-6 w-48 rounded" />
            <div className="skeleton-shimmer h-4 w-24 rounded" />
          </div>
          <div className={cx("calendar-grid", `${mode}-mode`)}>
            {days.map((day, index) => (
              <div key={day.date} className="calendar-day" aria-hidden="true">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="skeleton-shimmer h-5 w-20 rounded" />
                  <div className="skeleton-shimmer h-3 w-10 rounded" />
                </div>
                <div className="space-y-3">
                  <div className="skeleton-shimmer h-28 rounded-lg" />
                  {mode !== "month" && index % 3 === 0 && <div className="skeleton-shimmer h-20 rounded-lg" />}
                </div>
              </div>
            ))}
          </div>
          <span className="sr-only">Syncing jobs from Google Sheets.</span>
        </div>
      </Section>
    );
  }
  return <Section title="Scheduling calendar" kicker="Date-matched spreadsheet schedule" action={<div className="flex flex-wrap items-center justify-end gap-2"><button className="icon-button" onClick={() => moveCalendar(-1)} title={`Previous ${mode}`} aria-label={`Previous ${mode}`}><ChevronLeft size={18} /></button><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-lagoon hover:text-lagoon dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => setAnchorIso(currentDate)}>Today</button><button className="icon-button" onClick={() => moveCalendar(1)} title={`Next ${mode}`} aria-label={`Next ${mode}`}><ChevronRight size={18} /></button><div className="segmented">{(["day", "week", "month"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={cx(mode === item && "active")}>{item}</button>)}</div></div>}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-lg font-semibold text-ink dark:text-white">{calendarLabel(anchorDate, mode)}</p><p className="text-sm text-slate-500 dark:text-slate-400">{dayJobs.reduce((total, jobsForDay) => total + jobsForDay.length, 0)} jobs in view</p></div><div className="calendar-scroll"><div className={cx("calendar-grid", `${mode}-mode`)} style={calendarStyle}>{days.map((day, dayIndex) => { const jobsForDay = dayJobs[dayIndex]; return <div key={day.date} className="calendar-day" style={{ "--calendar-day-span": daySpans[dayIndex] } as CSSProperties}><div className="mb-3 flex items-center justify-between"><p className="font-semibold text-ink dark:text-white">{day.label}</p><span className="text-xs text-slate-500 dark:text-slate-400">{day.date.slice(5)}</span></div>{jobsForDay.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">No jobs scheduled</p>}{jobsGroupedByTime(jobsForDay).map(([time, timeJobs]) => <div key={time} className="calendar-time-group" style={{ gridTemplateColumns: `repeat(${timeJobs.length}, minmax(180px, 1fr))` }}>{timeJobs.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="calendar-job"><span className="text-xs font-semibold">{job.time}</span><span className="font-semibold">{findCustomer(customers, job.customerId).name}</span><span className="text-xs">{job.address}</span><span className="text-xs">Unassigned</span><Badge status={jobDisplayStatus(job, currentDate)} /></button>)}</div>)}</div>; })}</div></div></Section>;
}

function Plans({ customers, plans, onPlanUpdate }: { customers: Customer[]; plans: ServicePlan[]; onPlanUpdate: (planId: string, patch: Partial<ServicePlan>) => void }) {
  const [selectedId, setSelectedId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((item) => item.id === selectedId) ?? plans[0];
  if (!plans.length) {
    return <Section title="Service plans" kicker="Monthly, 3-month, and yearly plans"><div className="py-10 text-center"><h3 className="text-lg font-semibold text-ink dark:text-white">No active service plans</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Customers appear here only after they are explicitly subscribed.</p></div></Section>;
  }
  return <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><Section title="Service plans" kicker="Monthly, 3-month, and yearly plans"><div className="space-y-2">{plans.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", plan?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}><div className="flex items-center justify-between gap-3"><strong className="capitalize text-ink dark:text-white">{item.type} plan</strong><Badge status={item.paymentStatus} /></div><p className="mt-1 text-sm text-slate-500">{findCustomer(customers, item.customerId).name} - renews {item.renewalDate}</p></button>)}</div></Section>{plan && <Section title="Plan editor" kicker="Subscription status, renewal, services, pricing"><div className="settings-grid"><Field label="Customer"><select value={plan.customerId} onChange={(event) => onPlanUpdate(plan.id, { customerId: event.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Plan type"><select value={String(plan.type)} onChange={(event) => onPlanUpdate(plan.id, { type: event.target.value as unknown as ServicePlan["type"] })}>{planTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label="Plan price">{moneyInput(plan.price, (value) => onPlanUpdate(plan.id, { price: value }))}</Field><Field label="Discount %">{moneyInput(plan.discountPct, (value) => onPlanUpdate(plan.id, { discountPct: value }))}</Field><Field label="Renewal date"><input value={plan.renewalDate} onChange={(event) => onPlanUpdate(plan.id, { renewalDate: event.target.value })} /></Field><Field label="Payment status"><select value={plan.paymentStatus} onChange={(event) => onPlanUpdate(plan.id, { paymentStatus: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={plan.notes} onChange={(event) => onPlanUpdate(plan.id, { notes: event.target.value })} /></label></div><div className="mt-4 flex flex-wrap gap-2">{plan.servicesIncluded.map((service) => <span key={service} className="tag">{service}</span>)}</div></Section>}</div>;
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Stat label="Average rating" value={`${average.toFixed(1)} / 5`} detail="Powerwashing reviews sheet" icon={Star} /><Stat label="Reviews imported" value={`${reviews.length}`} detail="Synced review rows" icon={ReceiptText} /><Stat label="Five-star reviews" value={`${reviews.filter((review) => review.rating === 5).length}`} detail="Ready for follow-up" icon={CheckCircle2} /></div><Section title="Power Washing Reviews" kicker="Imported from Google Drive spreadsheet"><div className="grid gap-3 lg:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink dark:text-white">{review.name}</h3><p className="text-xs text-slate-500">{new Date(review.submittedAt).toLocaleDateString()}</p></div><span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{review.rating} stars</span></div><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.review}</p></article>)}</div></Section></div>;
}

function JobModal({ customers, job, onClose }: { customers: Customer[]; job: Job; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Job details</p><h3 className="text-xl font-bold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</h3><p className="text-sm text-slate-500">{job.date} at {job.time}</p></div><button className="icon-button" onClick={onClose} title="Close">x</button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="detail-row"><span>Address</span><strong>{job.address}</strong></div><div className="detail-row"><span>Service</span><strong>{job.serviceType}</strong></div><div className="detail-row"><span>Assignment</span><strong>Unassigned</strong></div><div className="detail-row"><span>Status</span><Badge status={job.status} /></div><div className="detail-row"><span>Price</span><strong>{currency.format(job.price)}</strong></div><div className="detail-row md:col-span-2"><span>Notes</span><strong>{job.notes}</strong></div></div><div className="mt-5 grid gap-3 md:grid-cols-2"><div className="photo-box">Before photo placeholder</div><div className="photo-box">After photo placeholder</div></div></div></div>;
}
