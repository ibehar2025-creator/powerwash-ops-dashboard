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
  ImagePlus,
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
  expenses as importedExpenses,
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
import type { Customer, Expense, Invoice, Job, PaymentMethod, PaymentStatus, ServicePlan } from "./types/business";

type ReviewRow = { id: string; submittedAt: string; name: string; rating: number; review: string; source: string };
type TabId = "dashboard" | "customers" | "leads" | "jobs" | "calendar" | "finance" | "invoices" | "plans" | "contracts" | "reports" | "reviews";
type SyncPayload = Partial<{
  customers: Customer[];
  jobs: Job[];
  invoices: Invoice[];
  expenses: Expense[];
  servicePlans: ServicePlan[];
  reviews: ReviewRow[];
}>;
type JobPhotoPatch = Pick<Job, "beforePhoto" | "afterPhoto">;
type JobPhotoOverrides = Record<string, JobPhotoPatch>;
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

const tabs: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
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
const PHOTO_STORAGE_KEY = "powerwash-job-photo-overrides";

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", ...options }).format(new Date(`${date}T12:00:00`));
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

function readPhotoOverrides(): JobPhotoOverrides {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PHOTO_STORAGE_KEY) ?? "{}") as JobPhotoOverrides;
  } catch {
    return {};
  }
}

function writePhotoOverride(jobId: string, patch: JobPhotoPatch) {
  if (typeof window === "undefined") return true;
  try {
    const current = readPhotoOverrides();
    const nextForJob = { ...current[jobId], ...patch };
    const next = { ...current, [jobId]: nextForJob };
    if (!nextForJob.beforePhoto && !nextForJob.afterPhoto) delete next[jobId];
    window.localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

function mergePhotoOverrides(rows: Job[]) {
  const overrides = readPhotoOverrides();
  return rows.map((job) => ({ ...job, ...overrides[job.id] }));
}

function resolvePhotoUrl(value?: string) {
  const rawUrl = value?.trim();
  if (!rawUrl) return "";
  const url = rawUrl.startsWith("data:image/") ? rawUrl.replace(/\s+/g, "") : rawUrl;
  if (!url) return "";
  if (url.startsWith("data:image/") || url.startsWith("blob:")) return url;
  const driveId = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)?.[1] ?? url.match(/[?&]id=([^&]+)/)?.[1];
  if (driveId) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w1200`;
  return url;
}

function fileToPhotoDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read photo."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Could not load photo."));
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare photo."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
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

function PhotoChip({ label, value }: { label: string; value?: string }) {
  return <span className={cx("photo-chip", value && "border-lagoon text-lagoon")}>{label}: {value ? "set" : "empty"}</span>;
}

function PhotoPreview({ label, value }: { label: string; value?: string }) {
  const [failed, setFailed] = useState(false);
  const displayUrl = resolvePhotoUrl(value);

  useEffect(() => {
    setFailed(false);
  }, [displayUrl]);

  return (
    <div className="photo-box">
      {displayUrl && !failed ? (
        <img className="h-full w-full rounded-lg object-cover" src={displayUrl} alt={`${label} job`} onError={() => setFailed(true)} />
      ) : value ? (
        <div className="space-y-2 p-3 text-center">
          <p>Photo link is private or blocked.</p>
          <a className="text-button" href={value} target="_blank" rel="noreferrer">Open photo</a>
        </div>
      ) : (
        <span>No {label.toLowerCase()} photo yet</span>
      )}
    </div>
  );
}

function PhotoField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => boolean | void }) {
  const [status, setStatus] = useState("");

  function savePhotoValue(nextValue: string) {
    const saved = onChange(nextValue);
    setStatus(saved === false ? "Photo shows now, but it was too large for this browser to save permanently. Upload a smaller photo or use a Drive link." : nextValue ? "Photo saved." : "Photo cleared.");
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file.");
      return;
    }
    try {
      setStatus("Saving photo...");
      savePhotoValue(await fileToPhotoDataUrl(file));
    } catch {
      setStatus("Could not save that photo. Try a smaller image or paste a link.");
    }
  }

  return (
    <div className="photo-field">
      <Field label={`${label} photo link`}>
        <textarea value={value ?? ""} placeholder="Paste image URL, Google Drive share link, or data:image text" onChange={(event) => savePhotoValue(event.target.value)} />
      </Field>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="text-button cursor-pointer">
          <ImagePlus size={16} /> Upload photo
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => void uploadPhoto(event.target.files?.[0])} />
        </label>
        {value && <button className="text-button" onClick={() => savePhotoValue("")}>Clear</button>}
      </div>
      {status && <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{status}</p>}
      <PhotoPreview label={label} value={value} />
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(importedCustomers);
  const [jobs, setJobs] = useState<Job[]>(() => mergePhotoOverrides(importedJobs.map((job) => ({ ...job, crewIds: [] }))));
  const [invoices, setInvoices] = useState<Invoice[]>(importedInvoices);
  const [expenses, setExpenses] = useState<Expense[]>(importedExpenses);
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
      if (payload.customers) setCustomers(payload.customers);
      if (payload.jobs) setJobs(mergePhotoOverrides(payload.jobs.map((job) => ({ ...job, crewIds: [] }))));
      if (payload.invoices) setInvoices(payload.invoices);
      if (payload.expenses) setExpenses(payload.expenses);
      if (payload.servicePlans) setPlans(payload.servicePlans);
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
    let photoSaved = true;
    if ("beforePhoto" in patch || "afterPhoto" in patch) {
      const photoPatch: JobPhotoPatch = {};
      if ("beforePhoto" in patch) photoPatch.beforePhoto = patch.beforePhoto;
      if ("afterPhoto" in patch) photoPatch.afterPhoto = patch.afterPhoto;
      photoSaved = writePhotoOverride(jobId, photoPatch);
    }
    setJobs((current) => current.map((job) => job.id === jobId ? { ...job, ...patch } : job));
    setSelectedJob((current) => current?.id === jobId ? { ...current, ...patch } : current);
    return photoSaved;
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
    if (payload.customers) setCustomers(payload.customers);
    if (payload.jobs) setJobs(mergePhotoOverrides(payload.jobs.map((job) => ({ ...job, crewIds: [] }))));
    if (payload.invoices) setInvoices(payload.invoices);
    if (payload.expenses) setExpenses(payload.expenses);
    if (payload.servicePlans) setPlans(payload.servicePlans);
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
            {activeTab === "dashboard" && <Dashboard customers={customers} jobs={jobs} invoices={invoices} expenses={expenses} reviews={reviews} onJobClick={setSelectedJob} onClientJobCreate={createClientJob} />}
            {activeTab === "customers" && <Customers customers={customers} jobs={jobs} invoices={invoices} />}
            {activeTab === "leads" && <Leads />}
            {activeTab === "jobs" && <Jobs customers={customers} jobs={jobs} onJobClick={setSelectedJob} onJobUpdate={updateJob} onClientJobCreate={createClientJob} />}
            {activeTab === "calendar" && <Calendar customers={customers} jobs={jobs} onJobClick={setSelectedJob} />}
            {activeTab === "finance" && <Finance customers={customers} jobs={jobs} invoices={invoices} expenses={expenses} onJobUpdate={updateJob} />}
            {activeTab === "invoices" && <Invoices customers={customers} invoices={invoices} onInvoiceUpdate={updateInvoice} onInvoiceCreate={createInvoice} />}
            {activeTab === "plans" && <Plans customers={customers} plans={plans} onPlanUpdate={updatePlan} />}
            {activeTab === "contracts" && <Contracts />}
            {activeTab === "reports" && <Reports customers={customers} jobs={jobs} invoices={invoices} expenses={expenses} />}
            {activeTab === "reviews" && <Reviews reviews={reviews} />}
          </div>
        </main>
      </div>
      {selectedJob && <JobModal customers={customers} job={selectedJob} onClose={() => setSelectedJob(null)} onJobUpdate={updateJob} />}
    </div>
  );
}

function Dashboard({ customers, jobs, invoices, expenses, reviews, onJobClick, onClientJobCreate }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; expenses: Expense[]; reviews: ReviewRow[]; onJobClick: (job: Job) => void; onClientJobCreate: (input: AddClientJobInput) => Promise<void> }) {
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const upcoming = jobs.filter((job) => job.status === "scheduled" || job.status === "in progress").slice(0, 6);
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="space-y-4"><Section title="Today at a glance" kicker="Business dashboard" action={<span className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/15 dark:text-amber-100">{spreadsheetImportNotice}</span>}><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Daily job revenue" value={currency.format(metrics.dailyRevenue)} detail="Total price of jobs scheduled today" icon={BadgeDollarSign} /><Stat label="Daily pay" value={currency.format(metrics.dailyPay)} detail="Crew payroll is not configured" icon={WalletCards} /><Stat label="Jobs today" value={`${metrics.jobsToday}`} detail={`${metrics.upcomingJobs} upcoming or active`} icon={BriefcaseBusiness} /><Stat label="Past due jobs" value={`${metrics.pastDueJobs}`} detail={`${currency.format(metrics.unpaidInvoiceTotal)} owed`} icon={FileText} /><Stat label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="Month-to-date job value" icon={BarChart3} /><Stat label="Projected monthly" value={currency.format(metrics.projectedMonthlyRevenue)} detail="Includes upcoming jobs this month" icon={Sparkles} /><Stat label="Unpaid invoices" value={`${metrics.unpaidInvoiceCount}`} detail="Unpaid, partial, and past due" icon={ReceiptText} /><Stat label="Expenses" value={currency.format(metrics.expenses)} detail="From the Expenses sheet" icon={CreditCard} /><Stat label="Reviews" value={`${average.toFixed(1)} / 5`} detail={`${reviews.length} imported reviews`} icon={Star} /></div></Section><div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"><Section title="Upcoming jobs" kicker="Imported schedule"><div className="grid gap-3 md:grid-cols-2">{upcoming.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="rounded-lg border border-slate-200 p-3 text-left transition hover:border-lagoon hover:bg-mist dark:border-slate-800 dark:hover:bg-slate-800"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{job.date} at {job.time}</p></div><Badge status={job.status} /></div><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{job.serviceType}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{job.address || "No address listed"}</p></button>)}</div></Section><AddClientJobForm onCreate={onClientJobCreate} /><Section title="Customer insights" kicker="Retention signals"><div className="space-y-3">{bestCustomers(customers, jobs).map((customer) => <div key={customer.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><div><p className="font-semibold text-ink dark:text-white">{customer.name}</p><p className="text-sm text-slate-500 dark:text-slate-400">{customer.insights.join(" / ")}</p></div><p className="font-semibold text-lagoon dark:text-cyan-300">{currency.format(customer.spent)}</p></div>)}</div></Section></div></div>;
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

function Customers({ customers, jobs, invoices }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[] }) {
  return <Section title="Customer management" kicker="Profiles, spend, payments, and jobs"><DataTable><table className="data-table"><thead><tr><th>Customer</th><th>Contact</th><th>Past / Upcoming</th><th>Total spent</th><th>Plan</th><th>Insights</th><th>Payment history</th></tr></thead><tbody>{customers.map((customer) => { const customerJobs = jobsForCustomer(customer.id, jobs); const past = customerJobs.filter((job) => job.status === "completed" || job.status === "past due").length; const upcoming = customerJobs.filter((job) => job.status === "scheduled" || job.status === "in progress").length; return <tr key={customer.id}><td><p className="font-semibold text-ink dark:text-white">{customer.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{customer.address || "No address listed"}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{customer.notes}</p></td><td>{customer.phone || ""}<br />{customer.email || ""}</td><td>{past} past / {upcoming} upcoming</td><td>{currency.format(customerSpend(customer.id, jobs))}</td><td>{customer.subscribedPlanId ? <Badge status="paid" /> : <Badge status="unpaid" />}</td><td className="space-y-1">{customer.insights.map((insight) => <Badge key={insight} status={insight.includes("overdue") ? "past due" : "completed"} />)}</td><td>{paymentHistory(customer.id, invoices).map((invoice) => `${invoice.id}: ${currency.format(invoice.amountPaid)}`).join(", ") || "No invoices yet"}</td></tr>; })}</tbody></table></DataTable></Section>;
}

function Leads() {
  const wins = leads.filter((lead) => lead.status === "won" || lead.status === "scheduled").length;
  return <Section title="Leads & prospects" kicker={`${Math.round((wins / leads.length) * 100)}% conversion tracked`}><DataTable><table className="data-table"><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Est. value</th><th>Follow-up</th><th>Notes</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id}><td><p className="font-semibold text-ink dark:text-white">{lead.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.contact}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.address}</p></td><td>{lead.source}</td><td><Badge status={lead.status} /></td><td>{currency.format(lead.estimatedValue)}</td><td>{lead.followUpDate}</td><td>{lead.notes}</td></tr>)}</tbody></table></DataTable></Section>;
}

function Jobs({ customers, jobs, onJobClick, onJobUpdate, onClientJobCreate }: { customers: Customer[]; jobs: Job[]; onJobClick: (job: Job) => void; onJobUpdate: (jobId: string, patch: Partial<Job>) => boolean | void; onClientJobCreate: (input: AddClientJobInput) => Promise<void> }) {
  return <div className="space-y-4"><AddClientJobForm onCreate={onClientJobCreate} /><Section title="Jobs management" kicker="Schedule, completion, photos, and payments"><DataTable><table className="data-table"><thead><tr><th>Date</th><th>Customer</th><th>Service</th><th>Status</th><th>Assignment</th><th>Price / Paid / Tip</th><th>Payment</th><th>Photos</th><th>Actions</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td>{job.date}<br />{job.time}</td><td><p className="font-semibold text-ink dark:text-white">{findCustomer(customers, job.customerId).name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{job.address || "No address listed"}</p></td><td>{job.serviceType}<p className="text-xs text-slate-500 dark:text-slate-400">{job.notes}</p></td><td><Badge status={job.status} /></td><td>Unassigned</td><td>{currency.format(job.price)} / {currency.format(job.amountPaid)} / {currency.format(job.tipAmount)}</td><td><Badge status={job.paymentStatus} /></td><td><PhotoChip label="Before" value={job.beforePhoto} /><PhotoChip label="After" value={job.afterPhoto} /></td><td><div className="flex flex-wrap gap-2"><button className="icon-button" title="Mark complete" onClick={() => onJobUpdate(job.id, { status: "completed", paymentStatus: "paid", amountPaid: job.price })}><CheckCircle2 size={16} /></button><button className="icon-button" title="Mark past due" onClick={() => onJobUpdate(job.id, { status: "past due", paymentStatus: "past due" })}><FileText size={16} /></button><button className="text-button" onClick={() => onJobClick(job)}>Details</button></div></td></tr>)}</tbody></table></DataTable></Section></div>;
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

function Finance({ customers, jobs, invoices, expenses, onJobUpdate }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; expenses: Expense[]; onJobUpdate: (jobId: string, patch: Partial<Job>) => boolean | void }) {
  const [selectedId, setSelectedId] = useState(customers[0]?.id ?? "");
  const customer = findCustomer(customers, selectedId);
  const selectedJobs = jobsForCustomer(customer.id, jobs);
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Stat label="Daily revenue" value={currency.format(metrics.dailyRevenue)} detail="Total job value today" icon={BadgeDollarSign} /><Stat label="Monthly revenue" value={currency.format(metrics.monthlyRevenue)} detail="Month-to-date job value" icon={BarChart3} /><Stat label="Projected monthly" value={currency.format(metrics.projectedMonthlyRevenue)} detail="Includes upcoming jobs this month" icon={Sparkles} /><Stat label="Expenses" value={currency.format(metrics.expenses)} detail="From the Expenses sheet" icon={CreditCard} /><Stat label="Net profit" value={currency.format(metrics.netProfit)} detail="Monthly revenue minus expenses" icon={WalletCards} /></div><div className="grid gap-4 xl:grid-cols-[300px_1fr]"><Section title="Customer money" kicker="Click a customer"><div className="space-y-2">{customers.map((item) => <button key={item.id} className={cx("w-full rounded-lg border p-3 text-left text-sm transition hover:border-lagoon dark:border-slate-800", customer.id === item.id ? "border-lagoon bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200" : "border-slate-200 text-slate-600 dark:text-slate-300")} onClick={() => setSelectedId(item.id)}><span className="block font-semibold">{item.name}</span><span className="text-xs">{currency.format(customerSpend(item.id, jobs))} collected</span></button>)}</div></Section><Section title={customer.name} kicker="Edit paid amounts, tips, and payment method"><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="metric-mini"><span>Paid</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + job.amountPaid, 0))}</strong></div><div className="metric-mini"><span>Tips</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + job.tipAmount, 0))}</strong></div><div className="metric-mini"><span>Still owed</span><strong>{currency.format(selectedJobs.reduce((sum, job) => sum + Math.max(job.price - job.amountPaid, 0), 0))}</strong></div></div><div className="space-y-3">{selectedJobs.map((job) => <div key={job.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-ink dark:text-white">{job.date} - {job.serviceType}</p><Badge status={job.paymentStatus} /></div><div className="settings-grid"><Field label="Job price">{moneyInput(job.price, (value) => onJobUpdate(job.id, { price: value }))}</Field><Field label="Amount paid">{moneyInput(job.amountPaid, (value) => onJobUpdate(job.id, { amountPaid: value }))}</Field><Field label="Tip">{moneyInput(job.tipAmount, (value) => onJobUpdate(job.id, { tipAmount: value }))}</Field><Field label="Payment method"><select value={job.paymentMethod ?? "other"} onChange={(event) => onJobUpdate(job.id, { paymentMethod: event.target.value as PaymentMethod })}>{businessSettings.paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></Field></div></div>)}</div></Section></div><Section title="Expenses sheet" kicker="Rows from the new Expenses tab"><DataTable><table className="data-table"><thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Notes</th></tr></thead><tbody>{expenses.length ? expenses.map((expense) => <tr key={expense.id}><td>{expense.date}</td><td>{expense.category}</td><td>{expense.vendor}</td><td>{currency.format(expense.amount)}</td><td>{expense.notes}</td></tr>) : <tr><td colSpan={5}>No expenses recorded yet. Add rows to the Expenses sheet and sync.</td></tr>}</tbody></table></DataTable></Section><Section title="Payment method tracking" kicker="Totals from current job payments"><div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{Object.entries(paymentMethodTotals(jobs)).map(([method, total]) => <div key={method} className="metric-mini"><span>{method}</span><strong>{currency.format(total)}</strong></div>)}</div></Section></div>;
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
  return <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><Section title="Service plans" kicker="Imported from Recurring Jobs"><div className="space-y-2">{plans.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", plan?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}><div className="flex items-center justify-between gap-3"><strong className="capitalize text-ink dark:text-white">{item.type} plan</strong><Badge status={item.paymentStatus} /></div><p className="mt-1 text-sm text-slate-500">{findCustomer(customers, item.customerId).name} - renews {item.renewalDate}</p></button>)}</div></Section>{plan && <Section title="Plan editor" kicker="Subscription status, renewal, services, pricing"><div className="settings-grid"><Field label="Customer"><select value={plan.customerId} onChange={(event) => onPlanUpdate(plan.id, { customerId: event.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Plan type"><select value={String(plan.type)} onChange={(event) => onPlanUpdate(plan.id, { type: event.target.value as ServicePlan["type"] })}>{planTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label="Plan price">{moneyInput(plan.price, (value) => onPlanUpdate(plan.id, { price: value }))}</Field><Field label="Discount %">{moneyInput(plan.discountPct, (value) => onPlanUpdate(plan.id, { discountPct: value }))}</Field><Field label="Renewal date"><input value={plan.renewalDate} onChange={(event) => onPlanUpdate(plan.id, { renewalDate: event.target.value })} /></Field><Field label="Payment status"><select value={plan.paymentStatus} onChange={(event) => onPlanUpdate(plan.id, { paymentStatus: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={plan.notes} onChange={(event) => onPlanUpdate(plan.id, { notes: event.target.value })} /></label></div><div className="mt-4 flex flex-wrap gap-2">{plan.servicesIncluded.map((service) => <span key={service} className="tag">{service}</span>)}</div></Section>}</div>;
}

function Contracts() {
  const [customerName, setCustomerName] = useState("");
  const [dealType, setDealType] = useState<"recurring" | "standard">("recurring");
  const [planFrequency, setPlanFrequency] = useState("");
  const [includedServices, setIncludedServices] = useState("");
  const [price, setPrice] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const cleanName = customerName.trim() || "[Customer Name]";
  const cleanFrequency = planFrequency.trim() || "[Plan frequency]";
  const cleanServices = includedServices.trim() || "[Services included]";
  const cleanPrice = price.trim() || "[Price]";
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

  async function copyContract() {
    try {
      await navigator.clipboard.writeText(contractDraft);
      setCopyStatus("Contract draft copied.");
    } catch {
      setCopyStatus("Copy failed. Select the draft text and copy it manually.");
    }
  }

  return (
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
  );
}

function Reports({ customers, jobs, invoices, expenses }: { customers: Customer[]; jobs: Job[]; invoices: Invoice[]; expenses: Expense[] }) {
  const metrics = businessMetrics(jobs, invoices, leads, expenses, []);
  const revenue = revenueByDay(jobs);
  const maxRevenue = Math.max(...revenue.map((item) => item.revenue), 1);
  const averageJob = jobs.length ? jobs.reduce((sum, job) => sum + job.price, 0) / jobs.length : 0;
  const repeatRate = customers.length ? Math.round((customers.filter((customer) => customer.insights.includes("repeat customer")).length / customers.length) * 100) : 0;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Stat label="Jobs completed" value={`${metrics.completedJobs}`} detail={`${metrics.upcomingJobs} scheduled or active`} icon={CheckCircle2} /><Stat label="Jobs past due" value={`${metrics.pastDueJobs}`} detail="Needs action" icon={FileText} /><Stat label="Average job value" value={currency.format(averageJob)} detail="Across imported jobs" icon={BadgeDollarSign} /><Stat label="Repeat customer rate" value={`${repeatRate}%`} detail="Customers tagged repeat" icon={Users} /></div><div className="grid gap-4 xl:grid-cols-2"><Section title="Revenue over time" kicker="Daily and monthly revenue"><div className="space-y-3">{revenue.map((item) => <div key={item.date}><div className="mb-1 flex justify-between text-sm"><span>{item.date}</span><strong>{currency.format(item.revenue)}</strong></div><div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-3 rounded-full bg-lagoon" style={{ width: `${Math.max(5, (item.revenue / maxRevenue) * 100)}%` }} /></div></div>)}</div></Section><Section title="Most common services" kicker="Service types and revenue"><DataTable><table className="data-table"><thead><tr><th>Service</th><th>Jobs</th><th>Revenue</th></tr></thead><tbody>{serviceBreakdown(jobs).map((service) => <tr key={service.name}><td>{service.name}</td><td>{service.count}</td><td>{currency.format(service.revenue)}</td></tr>)}</tbody></table></DataTable></Section><Section title="Best customers" kicker="Spend and retention"><div className="space-y-3">{bestCustomers(customers, jobs).map((customer) => <div key={customer.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="font-semibold text-ink dark:text-white">{customer.name}</span><span>{currency.format(customer.spent)}</span></div>)}</div></Section><Section title="Paid vs unpaid" kicker="Invoice mix, expenses, lead conversion"><div className="grid gap-3 sm:grid-cols-2"><div className="metric-mini"><span>Paid invoices</span><strong>{invoices.filter((invoice) => invoice.status === "paid").length}</strong></div><div className="metric-mini"><span>Unpaid invoices</span><strong>{invoices.filter((invoice) => invoice.status !== "paid").length}</strong></div><div className="metric-mini"><span>Tips earned</span><strong>{currency.format(metrics.totalTips)}</strong></div><div className="metric-mini"><span>Expenses</span><strong>{currency.format(metrics.expenses)}</strong></div><div className="metric-mini"><span>Lead conversion</span><strong>{metrics.conversionRate}%</strong></div><div className="metric-mini"><span>Jobs scheduled</span><strong>{metrics.upcomingJobs}</strong></div></div></Section></div></div>;
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><Stat label="Average rating" value={`${average.toFixed(1)} / 5`} detail="Powerwashing reviews sheet" icon={Star} /><Stat label="Reviews imported" value={`${reviews.length}`} detail="Synced review rows" icon={ReceiptText} /><Stat label="Five-star reviews" value={`${reviews.filter((review) => review.rating === 5).length}`} detail="Ready for follow-up" icon={CheckCircle2} /></div><Section title="Power Washing Reviews" kicker="Imported from Google Drive spreadsheet"><div className="grid gap-3 lg:grid-cols-2">{reviews.map((review) => <article key={review.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink dark:text-white">{review.name}</h3><p className="text-xs text-slate-500">{new Date(review.submittedAt).toLocaleDateString()}</p></div><span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">{review.rating} stars</span></div><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{review.review}</p></article>)}</div></Section></div>;
}

function JobModal({ customers, job, onClose, onJobUpdate }: { customers: Customer[]; job: Job; onClose: () => void; onJobUpdate: (jobId: string, patch: Partial<Job>) => boolean | void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900">
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
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <PhotoField label="Before" value={job.beforePhoto} onChange={(value) => onJobUpdate(job.id, { beforePhoto: value })} />
          <PhotoField label="After" value={job.afterPhoto} onChange={(value) => onJobUpdate(job.id, { afterPhoto: value })} />
        </div>
      </div>
    </div>
  );
}
