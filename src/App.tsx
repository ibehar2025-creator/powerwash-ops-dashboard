import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementType, FormEvent, ReactNode } from "react";
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
  FileSignature,
  ExternalLink,
  LayoutDashboard,
  MapPinned,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Star,
  Trash2,
  UserRoundCog,
  X,
  WalletCards,
} from "lucide-react";
import { useAuth } from "./lib/authContext";
import { loadThemePreference, saveThemePreference, themeIsDark } from "./lib/themePreference";
import { JobsSpreadsheet } from "./components/JobsSpreadsheet";
import { ProfileMenu } from "./components/ProfileMenu";
import { NotificationCenter } from "./components/NotificationCenter";
import { EmployeeWorkspace } from "./components/EmployeeWorkspace";
import { OwnerContractsView, OwnerTeamView } from "./components/OwnerOperations";
import { PayrollCenter } from "./components/PayrollCenter";
import { CreateRecordModal, CustomerEditorModal, CustomerProfile, GlobalSearch } from "./components/OperationsUi";
import type { CreateKind } from "./components/OperationsUi";
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
  isoToday,
  isUpcomingJob,
  jobDisplayStatus,
  jobsForCustomer,
  recurringPlanType,
} from "./lib/calculations";
import { createCalendarEvent, createCustomer, createJob, createLead, createServicePlan, createSolicitation, deleteCalendarEvent, deleteJob, deleteLead, deleteSolicitation, loadDatabaseSnapshot, loadOwnerOperations, saveCalendarEventPatch, saveCustomerPatch, saveJobPatch, saveLeadPatch, saveServicePlanPatch, saveSolicitationPatch, syncSheetsToDatabase } from "./lib/api";
import type { OwnerOperationsSnapshot } from "./lib/api";
import { followUpLabel, followUpTiming } from "./lib/followUps";
import type { CalendarEvent, CalendarEventType, Customer, Expense, Invoice, Job, JobCreateInput, Lead, LeadStatus, PaymentStatus, ServicePlan, ServicePlanCreateInput, Solicitation } from "./types/business";

type ReviewRow = { id: string; submittedAt: string; name: string; rating: number; review: string; source: string };
type TabId = "dashboard" | "customers" | "leads" | "jobs" | "calendar" | "map" | "analytics" | "plans" | "team" | "payroll" | "contracts";
type SyncPayload = Partial<{ customers: Customer[]; jobs: Job[]; leads: Lead[]; invoices: Invoice[]; servicePlans: ServicePlan[]; reviews: ReviewRow[]; expenses: Expense[]; solicitations: Solicitation[]; calendarEvents: CalendarEvent[] }>;
type CalendarDay = { label: string; date: string };

const tabs: { id: TabId; label: string; icon: ElementType; mobileOnly?: boolean }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "leads", label: "Leads", icon: Sparkles },
  { id: "jobs", label: "Jobs", icon: BriefcaseBusiness },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "map", label: "Map", icon: MapPinned },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "plans", label: "Service Plans", icon: ClipboardList },
  { id: "team", label: "Team", icon: UserRoundCog },
  { id: "payroll", label: "Contractor Pay", icon: WalletCards },
  { id: "contracts", label: "Contracts", icon: FileSignature },
];

const planTypes = ["monthly", "3-month", "4-month", "6-month", "yearly"];
const leadStatuses: LeadStatus[] = ["new", "contacted", "quoted", "scheduled", "won", "lost"];
const jobStatuses: Job["status"][] = ["scheduled", "in progress", "completed", "canceled", "past due"];
const calendarEventTypes: CalendarEventType[] = ["meeting", "soliciting", "estimate", "reminder", "other"];
const upcomingJobsSheetUrl = "https://docs.google.com/spreadsheets/d/19LNiR-1HTfT8wwdAZtGnqXlCJh6y-HbxeuqZuo95p2Q/edit";
const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const fullDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const calendarSkeletonDurationMs = 1_500;
const BusinessMap = lazy(() => import("./components/BusinessMap").then((module) => ({ default: module.BusinessMap })));
const Analytics = lazy(() => import("./components/Analytics").then((module) => ({ default: module.Analytics })));

function TabLoader({ label }: { label: string }) {
  return <div className="grid min-h-80 place-items-center rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-lagoon" size={24} /><p className="mt-3 text-sm font-medium text-slate-500">Loading {label}...</p></div></div>;
}

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function findCustomer(customers: Customer[], customerId: string) {
  return customers.find((customer) => customer.id === customerId) ?? customers[0];
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
      if (!linkedPlan) return customer;
      const insights = customer.insights.includes("repeat customer")
        ? customer.insights
        : [...customer.insights, "repeat customer" as const];
      return { ...customer, subscribedPlanId: linkedPlan.id, insights };
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
  const { user } = useAuth();
  const [employeePreview, setEmployeePreview] = useState(false);
  if (user.role === "employee" || employeePreview) {
    return <EmployeeWorkspace preview={employeePreview} onExitPreview={() => setEmployeePreview(false)} />;
  }
  return <OwnerDashboard onPreviewEmployee={() => setEmployeePreview(true)} />;
}

function OwnerDashboard({ onPreviewEmployee }: { onPreviewEmployee: () => void }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(importedCustomers);
  const [jobs, setJobs] = useState<Job[]>(importedJobs.map((job) => ({ ...job, crewIds: [] })));
  const [leads, setLeads] = useState<Lead[]>(importedLeads);
  const [invoices, setInvoices] = useState<Invoice[]>(importedInvoices);
  const [savedExpenses, setSavedExpenses] = useState<Expense[]>(expenses);
  const [plans, setPlans] = useState<ServicePlan[]>(normalizePlans(importedServicePlans));
  const [reviews, setReviews] = useState<ReviewRow[]>(importedReviews);
  const [solicitations, setSolicitations] = useState<Solicitation[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [ownerOperations, setOwnerOperations] = useState<OwnerOperationsSnapshot>({ employees: [], assignments: [], earnings: [], contracts: [], payouts: [] });
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [mapJobFocus, setMapJobFocus] = useState<{ jobId: string; requestId: number } | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [themePreference, setThemePreference] = useState(() => loadThemePreference(user.id));
  const [darkMode, setDarkMode] = useState(() => themeIsDark(loadThemePreference(user.id)));
  const [syncStatus, setSyncStatus] = useState("Using bundled Google Sheets snapshot.");
  const [syncing, setSyncing] = useState(false);
  const [showCalendarSkeleton, setShowCalendarSkeleton] = useState(false);
  const calendarSkeletonShown = useRef(false);
  const calendarSkeletonTimer = useRef<number | null>(null);
  const [currentDate, setCurrentDate] = useState(() => isoToday());
  const metrics = businessMetrics(jobs, invoices, leads, expenses, [], currentDate);
  const activeLabel = useMemo(() => tabs.find((tab) => tab.id === activeTab)?.label ?? "Dashboard", [activeTab]);
  const syncEndpoint = import.meta.env.VITE_SHEETS_SYNC_URL as string | undefined;

  const refreshOwnerOperations = useCallback(async () => {
    const result = await loadOwnerOperations();
    if (result) setOwnerOperations(result);
  }, []);

  const syncSheets = useCallback(async () => {
    const minimumManualSkeleton = new Promise<void>((resolve) => window.setTimeout(resolve, calendarSkeletonDurationMs));
    setSyncing(true);
    setSyncStatus(syncEndpoint ? "Syncing Google Sheets..." : "Syncing through the database...");
    if (calendarSkeletonTimer.current !== null) {
      window.clearTimeout(calendarSkeletonTimer.current);
      calendarSkeletonTimer.current = null;
    }
    setShowCalendarSkeleton(true);
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
      if (payload.expenses) setSavedExpenses(payload.expenses);
      if (payload.servicePlans) setPlans(normalizePlans(payload.servicePlans));
      if (payload.reviews) setReviews(payload.reviews);
      if (payload.solicitations) setSolicitations(payload.solicitations);
      if (payload.calendarEvents) setCalendarEvents(payload.calendarEvents);
      setSyncStatus(`Synced from Google Sheets at ${new Date().toLocaleTimeString()}.`);
    } catch (error) {
      setSyncStatus(error instanceof Error ? error.message : "Google Sheets sync failed.");
    } finally {
      await minimumManualSkeleton;
      setSyncing(false);
      setShowCalendarSkeleton(false);
    }
  }, [syncEndpoint]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentDate(isoToday()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    saveThemePreference(user.id, themePreference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setDarkMode(themePreference === "dark" || (themePreference === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themePreference, user.id]);

  useEffect(() => {
    void syncSheets();
    const interval = window.setInterval(() => void syncSheets(), 15 * 60_000);
    return () => window.clearInterval(interval);
  }, [syncSheets]);

  useEffect(() => {
    void refreshOwnerOperations();
  }, [refreshOwnerOperations]);

  useEffect(() => {
    let ignore = false;
    void loadDatabaseSnapshot()
      .then((payload) => {
        if (ignore || !payload) return;
        if (payload.customers) setCustomers(mergeRecurringCustomers(payload.customers, payload.servicePlans ?? []));
        if (payload.jobs) setJobs(payload.jobs.map((job) => ({ ...job, crewIds: [] })));
        if (payload.leads) setLeads(payload.leads);
        if (payload.invoices) setInvoices(payload.invoices);
        if (payload.expenses) setSavedExpenses(payload.expenses);
        if (payload.servicePlans) setPlans(normalizePlans(payload.servicePlans));
        if (payload.reviews) setReviews(payload.reviews);
        if (payload.solicitations) setSolicitations(payload.solicitations);
        if (payload.calendarEvents) setCalendarEvents(payload.calendarEvents);
        setSyncStatus("Loaded saved database records.");
      })
      .catch((error) => {
        setSyncStatus(error instanceof Error ? error.message : "Database load failed.");
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => () => {
    if (calendarSkeletonTimer.current !== null) window.clearTimeout(calendarSkeletonTimer.current);
  }, []);

  async function updateLead(leadId: string, patch: Partial<Lead>) {
    const saved = await saveLeadPatch(leadId, patch);
    if (!saved) throw new Error("Lead save service is unavailable.");
    setLeads((current) => current.map((lead) => lead.id === leadId ? saved : lead));
    setSyncStatus("Lead changes saved to the database.");
    return saved;
  }

  async function addLead(draft: Omit<Lead, "id" | "source" | "websiteEditedFields">) {
    const saved = await createLead(draft);
    if (!saved) throw new Error("Lead creation service is unavailable.");
    setLeads((current) => [saved, ...current]);
    setSyncStatus("New lead saved to the database and Google Sheets.");
  }

  async function removeLead(leadId: string) {
    const lead = leads.find((item) => item.id === leadId);
    const removed = await deleteLead(leadId);
    if (!removed?.deleted) throw new Error("Lead removal service is unavailable.");
    setLeads((current) => current.filter((lead) => lead.id !== leadId));
    if (lead?.source === "Map solicitation" && lead.id.startsWith("solicitation-")) {
      const solicitationId = lead.id.slice("solicitation-".length);
      setSolicitations((current) => current.map((item) => item.id === solicitationId
        ? { ...item, outcome: "no answer", followUpDate: "" }
        : item));
    }
    setSelectedLead(null);
    setSyncStatus("Lead removed from the website and Google Sheets.");
  }

  async function addCustomer(draft: Omit<Customer, "id" | "insights" | "subscribedPlanId" | "websiteEditedFields">) {
    const saved = await createCustomer(draft);
    if (!saved) throw new Error("Customer creation service is unavailable.");
    setCustomers((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
    setSyncStatus("New customer saved to the database.");
    return saved;
  }

  async function updateCustomer(customerId: string, patch: Partial<Customer>) {
    const saved = await saveCustomerPatch(customerId, patch);
    if (!saved) throw new Error("Customer save service is unavailable.");
    setCustomers((current) => current.map((customer) => customer.id === customerId ? saved : customer));
    setSelectedCustomer((current) => current?.id === customerId ? saved : current);
    setSyncStatus("Customer changes saved to the database.");
  }

  async function updateJob(jobId: string, patch: Partial<Job>) {
    const saved = await saveJobPatch(jobId, patch);
    if (!saved) throw new Error("Job save service is unavailable.");
    setJobs((current) => current.map((job) => job.id === jobId ? { ...saved, crewIds: saved.crewIds ?? [] } : job));
    setSyncStatus("Job changes saved to the website and Google Sheets.");
    return saved;
  }

  async function addJob(draft: JobCreateInput) {
    const saved = await createJob(draft);
    if (!saved) throw new Error("Job creation service is unavailable.");
    setJobs((current) => [...current, { ...saved.job, crewIds: saved.job.crewIds ?? [] }].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)));
    if (saved.servicePlan) setPlans((current) => normalizePlans([...current.filter((plan) => plan.id !== saved.servicePlan?.id), saved.servicePlan!]));
    setSyncStatus(saved.servicePlan ? "Recurring job saved to Google Sheets and the database." : "New job saved to Google Sheets and the database.");
  }

  async function removeJob(jobId: string) {
    const removed = await deleteJob(jobId);
    if (!removed?.deleted) throw new Error("Job removal service is unavailable.");
    setJobs((current) => current.filter((job) => job.id !== jobId));
    setSelectedJob(null);
    setSyncStatus("Job removed from the website and Google Sheets.");
  }

  async function addCalendarEvent(draft: Omit<CalendarEvent, "id">) {
    const saved = await createCalendarEvent(draft);
    if (!saved) throw new Error("Calendar event service is unavailable.");
    setCalendarEvents((current) => [...current, saved].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)));
    setSyncStatus("Calendar event saved.");
    return saved;
  }

  async function updateCalendarEvent(eventId: string, patch: Partial<CalendarEvent>) {
    const saved = await saveCalendarEventPatch(eventId, patch);
    if (!saved) throw new Error("Calendar event save service is unavailable.");
    setCalendarEvents((current) => current.map((event) => event.id === eventId ? saved : event));
    setSyncStatus("Calendar event updated.");
    return saved;
  }

  async function removeCalendarEvent(eventId: string) {
    const removed = await deleteCalendarEvent(eventId);
    if (!removed?.deleted) throw new Error("Calendar event removal service is unavailable.");
    setCalendarEvents((current) => current.filter((event) => event.id !== eventId));
    setSyncStatus("Calendar event removed.");
  }

  const updateMapLead = useCallback((solicitation: Solicitation, savedLead?: Lead | null) => {
    const leadId = `solicitation-${solicitation.id}`;
    if (solicitation.outcome !== "follow up") {
      setLeads((current) => current.filter((lead) => lead.id !== leadId || lead.source !== "Map solicitation"));
      return;
    }

    const lead = savedLead ?? {
      id: leadId,
      name: "Map follow-up",
      contact: "Contact info pending",
      address: solicitation.address,
      source: "Map solicitation",
      status: "new" as LeadStatus,
      estimatedValue: 0,
      followUpDate: solicitation.followUpDate || "",
      notes: solicitation.notes,
    };
    setLeads((current) => current.some((item) => item.id === lead.id)
      ? current.map((item) => item.id === lead.id ? lead : item)
      : [lead, ...current]);
  }, []);

  async function updatePlan(planId: string, patch: Partial<ServicePlan>) {
    const saved = await saveServicePlanPatch(planId, patch);
    if (!saved) throw new Error("Service plan save service is unavailable.");
    setPlans((current) => normalizePlans(current.map((plan) => plan.id === planId ? saved : plan)));
    setSyncStatus("Service plan changes saved.");
    return saved;
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
    const solicitation = saved?.solicitation ?? { ...draft, id: crypto.randomUUID() };
    setSolicitations((current) => [solicitation, ...current]);
    updateMapLead(solicitation, saved?.lead);
  }, [updateMapLead]);

  const updateSolicitation = useCallback(async (id: string, patch: Partial<Solicitation>) => {
    const saved = await saveSolicitationPatch(id, patch);
    const existing = solicitations.find((item) => item.id === id);
    const updated = saved?.solicitation ?? (existing ? { ...existing, ...patch } : undefined);
    if (!updated) return;
    setSolicitations((current) => current.map((item) => item.id === id ? updated : item));
    updateMapLead(updated, saved?.lead);
  }, [solicitations, updateMapLead]);

  const removeSolicitation = useCallback(async (id: string) => {
    const removed = await deleteSolicitation(id);
    setSolicitations((current) => current.filter((item) => item.id !== id));
    const removedLeadId = removed?.removedLeadId ?? `solicitation-${id}`;
    setLeads((current) => current.filter((lead) => lead.id !== removedLeadId || lead.source !== "Map solicitation"));
  }, []);

  function chooseTab(tabId: TabId) {
    if (tabId === "calendar" && !calendarSkeletonShown.current) {
      calendarSkeletonShown.current = true;
      setShowCalendarSkeleton(true);
      calendarSkeletonTimer.current = window.setTimeout(() => setShowCalendarSkeleton(false), calendarSkeletonDurationMs);
    }
    if (tabId !== "map") setMapJobFocus(null);
    setActiveTab(tabId);
    setMobileMenuOpen(false);
  }

  async function addPlan(draft: ServicePlanCreateInput) {
    const saved = await createServicePlan(draft);
    if (!saved) throw new Error("Service plan creation service is unavailable.");
    setPlans((current) => normalizePlans([...current, saved]));
    setSyncStatus("Service plan saved to Google Sheets and the database.");
    return saved;
  }

  function findJobOnMap(job: Job) {
    setMapJobFocus({ jobId: job.id, requestId: Date.now() });
    setSelectedJob(null);
    chooseTab("map");
  }

  return (
    <div className={cx("min-h-screen w-full max-w-full overflow-x-hidden", darkMode && "dark")}>
      <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
        <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
          <div className="mb-6 rounded-lg bg-ink p-4 text-white"><p className="text-sm text-cyan-100">The</p><h1 className="text-xl font-bold">Powerwashing Pros</h1><p className="mt-2 text-xs text-slate-300">Daily control center for jobs, scheduling, and growth.</p></div>
          <nav className="space-y-1">{tabs.filter((tab) => !tab.mobileOnly).map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`desktop-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}</nav>
          <button type="button" className="nav-item mt-5 border-t border-slate-200 pt-5 dark:border-slate-700" onClick={onPreviewEmployee}><UserRoundCog size={18} /><span>Preview employee</span></button>
        </aside>
        <main className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
          <header className="app-header min-w-0 max-w-full border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <button className="icon-button mt-1 lg:hidden" onClick={() => setMobileMenuOpen(true)} title="Open navigation" aria-label="Open navigation"><Menu size={18} /></button>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">{fullDateFormatter.format(dateFromIso(currentDate))}</p><h1 className="text-2xl font-bold text-ink dark:text-white">{activeLabel}</h1><p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">{syncStatus}</p></div>
              </div>
              <div className="flex items-center gap-2"><span className="hidden rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200 sm:inline-flex">{currency.format(metrics.dailyRevenue)} job value today</span><button type="button" className="text-button hidden xl:inline-flex" onClick={onPreviewEmployee}>Preview employee</button><NotificationCenter customers={customers} leads={leads} jobs={jobs} plans={plans} contracts={ownerOperations.contracts} earnings={ownerOperations.earnings} currentDate={currentDate} syncStatus={syncStatus} syncing={syncing} onLead={setSelectedLead} onJob={setSelectedJob} onPlans={() => chooseTab("plans")} onContracts={() => chooseTab("contracts")} onTeam={() => chooseTab("team")} onSync={() => void syncSheets()} /><button className="text-button" disabled={syncing} onClick={() => void syncSheets()}>{syncing ? "Syncing" : "Sync sheets"}</button><ProfileMenu theme={themePreference} onTheme={setThemePreference} onOwnerNavigate={chooseTab} /></div>
            </div>
          </header>
          {activeTab === "jobs" && <GlobalSearch customers={customers} jobs={jobs} onJob={setSelectedJob} onNew={setCreateKind} />}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-[60] lg:hidden">
              <button className="absolute inset-0 bg-ink/45" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />
              <aside className="mobile-drawer relative flex h-full w-[min(86vw,340px)] flex-col border-r border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-ink p-4 text-white">
                  <div><p className="text-sm text-cyan-100">The</p><h2 className="text-lg font-bold">Powerwashing Pros</h2><p className="mt-1 text-xs text-slate-300">Choose a dashboard tab.</p></div>
                  <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/20 text-white transition hover:bg-white/10" onClick={() => setMobileMenuOpen(false)} title="Close navigation" aria-label="Close navigation"><X size={18} /></button>
                </div>
                <nav className="space-y-1 overflow-y-auto">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} data-testid={`mobile-tab-${tab.id}`} onClick={() => chooseTab(tab.id)} className={cx("nav-item", activeTab === tab.id && "active")}><Icon size={18} /><span>{tab.label}</span></button>; })}<button type="button" className="nav-item mt-3 border-t border-slate-200 pt-4 dark:border-slate-700" onClick={onPreviewEmployee}><UserRoundCog size={18} /><span>Preview employee</span></button></nav>
              </aside>
            </div>
          )}
          <div className="app-content min-h-0 min-w-0 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-6">
            {activeTab === "dashboard" && <Dashboard jobs={jobs} leads={leads} invoices={invoices} plans={plans} reviews={reviews} currentDate={currentDate} />}
            {activeTab === "customers" && <Customers customers={customers} jobs={jobs} currentDate={currentDate} onCustomerClick={setSelectedCustomer} onJobClick={setSelectedJob} />}
            {activeTab === "leads" && <Leads leads={leads} currentDate={currentDate} onLeadClick={setSelectedLead} />}
            {activeTab === "jobs" && <JobsSpreadsheet customers={customers} jobs={jobs} onAddJob={() => setCreateKind("job")} onEditJob={setSelectedJob} />}
            {activeTab === "calendar" && <Calendar customers={customers} jobs={jobs} events={calendarEvents} currentDate={currentDate} loading={showCalendarSkeleton} onJobClick={setSelectedJob} onCreateEvent={addCalendarEvent} onUpdateEvent={updateCalendarEvent} onDeleteEvent={removeCalendarEvent} />}
            {activeTab === "map" && <Suspense fallback={<TabLoader label="map" />}><BusinessMap customers={customers} jobs={jobs} solicitations={solicitations} jobFocusRequest={mapJobFocus} onSaveJobCoordinates={saveMapJobCoordinates} onCreateSolicitation={addSolicitation} onUpdateSolicitation={updateSolicitation} onDeleteSolicitation={removeSolicitation} /></Suspense>}
            {activeTab === "analytics" && <Suspense fallback={<TabLoader label="analytics" />}><Analytics customers={customers} jobs={jobs} leads={leads} invoices={invoices} plans={plans} expenses={savedExpenses} currentDate={currentDate} /></Suspense>}
            {activeTab === "plans" && <Plans customers={customers} plans={plans} onPlanCreate={addPlan} onPlanUpdate={updatePlan} />}
            {activeTab === "team" && <OwnerTeamView operations={ownerOperations} jobs={jobs} customerNames={new Map(customers.map((customer) => [customer.id, customer.name]))} onRefresh={refreshOwnerOperations} />}
            {activeTab === "payroll" && <PayrollCenter employees={ownerOperations.employees} />}
            {activeTab === "contracts" && <OwnerContractsView operations={ownerOperations} onRefresh={async () => { await refreshOwnerOperations(); const snapshot = await loadDatabaseSnapshot(); if (snapshot?.servicePlans) setPlans(normalizePlans(snapshot.servicePlans)); }} />}
          </div>
        </main>
      </div>
      {selectedJob && <JobModal key={selectedJob.id} customers={customers} job={selectedJob} onSave={updateJob} onDelete={removeJob} onFindOnMap={findJobOnMap} onClose={() => setSelectedJob(null)} />}
      {selectedLead && <LeadModal key={selectedLead.id} lead={selectedLead} onSave={updateLead} onDelete={removeLead} onClose={() => setSelectedLead(null)} />}
      {selectedCustomer && <CustomerProfile customer={selectedCustomer} jobs={jobs} onClose={() => setSelectedCustomer(null)} onEditCustomer={() => { setEditingCustomer(selectedCustomer); setSelectedCustomer(null); }} onEditJob={(job) => { setSelectedCustomer(null); setSelectedJob(job); }} />}
      {editingCustomer && <CustomerEditorModal customer={editingCustomer} onClose={() => setEditingCustomer(null)} onSave={updateCustomer} />}
      {createKind && <CreateRecordModal kind={createKind} customers={customers} currentDate={currentDate} onClose={() => setCreateKind(null)} onCreateCustomer={addCustomer} onCreateJob={addJob} onCreateLead={addLead} />}
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
        <DashboardMetric className="xl:col-span-3" label="Projected revenue" value={currency.format(metrics.projectedRevenue)} detail="All past and future non-canceled jobs" icon={BadgeDollarSign} featured />
        <DashboardMetric className="xl:col-span-3" label="Completed revenue" value={currency.format(metrics.completedRevenue)} detail={`${metrics.completedJobs} completed jobs`} icon={CheckCircle2} featured />
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

function Customers({ customers, jobs, currentDate, onCustomerClick, onJobClick }: { customers: Customer[]; jobs: Job[]; currentDate: string; onCustomerClick: (customer: Customer) => void; onJobClick: (job: Job) => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const filteredCustomers = statusFilter === "all" ? customers : customers.filter((customer) => customer.insights.includes(statusFilter as Customer["insights"][number]));
  return <Section title="Customer management" kicker="Customer status and editable jobs" action={<select aria-label="Customer status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="repeat customer">Repeat customers</option><option value="high-value customer">High-value</option><option value="overdue payment">Overdue</option><option value="inactive customer">Inactive</option></select>}><DataTable><table className="data-table"><thead><tr><th>Customer</th><th>Jobs</th><th>Status</th></tr></thead><tbody>{filteredCustomers.map((customer) => { const customerJobs = jobsForCustomer(customer.id, jobs); const past = customerJobs.filter((job) => job.status === "completed" || jobDisplayStatus(job, currentDate) === "past due").length; const upcoming = customerJobs.filter((job) => isUpcomingJob(job, currentDate)).length; return <tr key={customer.id}><td><button type="button" className="font-semibold text-ink hover:text-lagoon dark:text-white" onClick={() => onCustomerClick(customer)}>{customer.name}</button><p className="text-xs text-slate-500 dark:text-slate-400">{customer.address}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{customer.notes}</p></td><td><p className="mb-2 text-xs text-slate-500">{past} past / {upcoming} upcoming</p><div className="flex min-w-44 flex-col gap-1.5">{customerJobs.map((job) => <button key={job.id} type="button" className="inline-flex min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-left text-xs font-medium transition hover:border-lagoon hover:text-lagoon dark:border-slate-700" onClick={() => onJobClick(job)}><span className="min-w-0 truncate">{job.date} · {job.serviceType}</span><Pencil size={13} className="shrink-0" /></button>)}{customerJobs.length === 0 && <span className="text-xs text-slate-400">No jobs</span>}</div></td><td className="space-y-1">{customer.insights.map((insight) => <Badge key={insight} status={insight.includes("overdue") ? "past due" : "completed"} />)}{customer.insights.length === 0 && <span className="text-xs text-slate-400">No status</span>}</td></tr>; })}</tbody></table></DataTable></Section>;
}

function Leads({ leads, currentDate, onLeadClick }: { leads: Lead[]; currentDate: string; onLeadClick: (lead: Lead) => void }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const wins = leads.filter((lead) => lead.status === "won" || lead.status === "scheduled").length;
  const overdueCount = leads.filter((lead) => followUpTiming(lead.followUpDate, currentDate) === "overdue" && !["scheduled", "won", "lost"].includes(lead.status)).length;
  const filteredLeads = leads
    .filter((lead) => statusFilter === "all" || lead.status === statusFilter)
    .filter((lead) => {
      if (followUpFilter === "all") return true;
      const timing = followUpTiming(lead.followUpDate, currentDate);
      return followUpFilter === "upcoming" ? timing === "upcoming" || timing === "later" : timing === followUpFilter;
    })
    .sort((a, b) => (a.followUpDate || "9999-12-31").localeCompare(b.followUpDate || "9999-12-31") || a.name.localeCompare(b.name));

  return (
    <Section
      title="Leads & prospects"
      kicker={`${leads.length ? Math.round((wins / leads.length) * 100) : 0}% conversion tracked${overdueCount ? ` - ${overdueCount} overdue` : ""}`}
      action={<div className="grid w-full min-w-0 gap-2 sm:flex sm:w-auto sm:flex-wrap"><select className="w-full min-w-0 pr-9 sm:w-auto" aria-label="Lead status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><select className="w-full min-w-0 pr-9 sm:w-auto" aria-label="Follow-up timing filter" value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value)}><option value="all">All follow-ups</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="upcoming">Upcoming</option><option value="unscheduled">Not scheduled</option></select></div>}
    >
      <DataTable><table className="data-table"><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Est. value</th><th>Follow-up</th><th>Notes</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredLeads.map((lead) => {
        const timing = followUpTiming(lead.followUpDate, currentDate);
        return <tr key={lead.id}><td><p className="font-semibold text-ink dark:text-white">{lead.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.contact}</p><p className="text-xs text-slate-500 dark:text-slate-400">{lead.address}</p></td><td>{lead.source}</td><td><Badge status={lead.status} /></td><td>{currency.format(lead.estimatedValue)}</td><td><p className="whitespace-nowrap text-sm font-medium">{lead.followUpDate || "Not scheduled"}</p><span className={cx("mt-1 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold", timing === "overdue" && "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200", timing === "today" && "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200", (timing === "upcoming" || timing === "later") && "bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200", timing === "unscheduled" && "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300")}>{followUpLabel(timing)}</span></td><td>{lead.notes}</td><td><button type="button" className="icon-button" title={`Edit ${lead.name}`} aria-label={`Edit ${lead.name}`} onClick={() => onLeadClick(lead)}><Pencil size={15} /></button></td></tr>;
      })}</tbody></table></DataTable>
    </Section>
  );
}

function Calendar({ customers, jobs, events, currentDate, loading, onJobClick, onCreateEvent, onUpdateEvent, onDeleteEvent }: { customers: Customer[]; jobs: Job[]; events: CalendarEvent[]; currentDate: string; loading: boolean; onJobClick: (job: Job) => void; onCreateEvent: (event: Omit<CalendarEvent, "id">) => Promise<CalendarEvent>; onUpdateEvent: (eventId: string, patch: Partial<CalendarEvent>) => Promise<CalendarEvent>; onDeleteEvent: (eventId: string) => Promise<void> }) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const [anchorIso, setAnchorIso] = useState(currentDate);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const anchorDate = dateFromIso(anchorIso);
  const days = calendarDays(anchorDate, mode);
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
          <div className={cx("calendar-grid", mode === "month" && "month-mode")}>
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
  const visibleJobCount = days.reduce((total, day) => total + jobs.filter((job) => job.date === day.date).length, 0);
  const visibleEventCount = days.reduce((total, day) => total + events.filter((event) => event.date === day.date).length, 0);
  const newEvent = (): CalendarEvent => ({ id: "", title: "", type: "meeting", date: anchorIso, startTime: "09:00", endTime: "10:00", location: "", notes: "" });
  const actions = <div className="flex flex-wrap items-center justify-end gap-2"><button type="button" className="primary-button gap-2" onClick={() => setSelectedEvent(newEvent())}><Plus size={16} />Add event</button><button className="icon-button" onClick={() => moveCalendar(-1)} title={`Previous ${mode}`} aria-label={`Previous ${mode}`}><ChevronLeft size={18} /></button><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-lagoon hover:text-lagoon dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" onClick={() => setAnchorIso(currentDate)}>Today</button><button className="icon-button" onClick={() => moveCalendar(1)} title={`Next ${mode}`} aria-label={`Next ${mode}`}><ChevronRight size={18} /></button><div className="segmented">{(["day", "week", "month"] as const).map((item) => <button key={item} onClick={() => setMode(item)} className={cx(mode === item && "active")}>{item}</button>)}</div></div>;

  return <><Section title="Scheduling calendar" kicker="Jobs and business events" action={actions}><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-lg font-semibold text-ink dark:text-white">{calendarLabel(anchorDate, mode)}</p><p className="text-sm text-slate-500 dark:text-slate-400">{visibleJobCount} jobs · {visibleEventCount} events</p></div><div className={cx("calendar-grid", mode === "month" && "month-mode")}>{days.map((day) => { const dayJobs = jobs.filter((job) => job.date === day.date); const dayEvents = events.filter((event) => event.date === day.date).sort((a, b) => a.startTime.localeCompare(b.startTime)); return <div key={day.date} className="calendar-day"><div className="mb-3 flex items-center justify-between"><p className="font-semibold text-ink dark:text-white">{day.label}</p><span className="text-xs text-slate-500 dark:text-slate-400">{day.date.slice(5)}</span></div>{dayJobs.length === 0 && dayEvents.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">Nothing scheduled</p>}{dayJobs.map((job) => <button key={job.id} onClick={() => onJobClick(job)} className="calendar-job"><span className="text-xs font-semibold">{job.time}</span><span className="font-semibold">{findCustomer(customers, job.customerId).name}</span><span className="text-xs">{job.address}</span><span className="text-xs">Unassigned</span><Badge status={jobDisplayStatus(job, currentDate)} /></button>)}{dayEvents.map((event) => <button key={event.id} type="button" onClick={() => setSelectedEvent(event)} className="calendar-event"><span className="text-xs font-semibold">{event.startTime}{event.endTime ? ` - ${event.endTime}` : ""}</span><span className="font-semibold text-ink dark:text-white">{event.title}</span><span className="text-xs capitalize text-lagoon dark:text-cyan-300">{event.type}</span>{event.location && <span className="truncate text-xs">{event.location}</span>}</button>)}</div>; })}</div></Section>{selectedEvent && <CalendarEventModal key={selectedEvent.id || "new-event"} event={selectedEvent} onCreate={onCreateEvent} onUpdate={onUpdateEvent} onDelete={onDeleteEvent} onClose={() => setSelectedEvent(null)} />}</>;
}

function CalendarEventModal({ event, onCreate, onUpdate, onDelete, onClose }: { event: CalendarEvent; onCreate: (event: Omit<CalendarEvent, "id">) => Promise<CalendarEvent>; onUpdate: (eventId: string, patch: Partial<CalendarEvent>) => Promise<CalendarEvent>; onDelete: (eventId: string) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(event);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");
  const isNew = !event.id;

  async function submit(eventForm: FormEvent<HTMLFormElement>) {
    eventForm.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        await onCreate({ title: draft.title, type: draft.type, date: draft.date, startTime: draft.startTime, endTime: draft.endTime, location: draft.location, notes: draft.notes });
      } else {
        const fields: Array<keyof CalendarEvent> = ["title", "type", "date", "startTime", "endTime", "location", "notes"];
        const patch = Object.fromEntries(fields.filter((field) => draft[field] !== event[field]).map((field) => [field, draft[field]])) as Partial<CalendarEvent>;
        if (Object.keys(patch).length) await onUpdate(event.id, patch);
      }
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this event.");
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await onDelete(event.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove this event.");
      setDeleting(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-3 sm:p-4"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">{isNew ? "New calendar event" : "Edit calendar event"}</p><h3 className="text-xl font-bold text-ink dark:text-white">{draft.title || "Untitled event"}</h3></div><button type="button" className="icon-button shrink-0" onClick={onClose} title="Close" aria-label="Close calendar event editor"><X size={17} /></button></div><div className="settings-grid mt-5"><Field label="Title"><input required value={draft.title} placeholder="Team meeting" onChange={(change) => setDraft({ ...draft, title: change.target.value })} /></Field><Field label="Event type"><select value={draft.type} onChange={(change) => setDraft({ ...draft, type: change.target.value as CalendarEventType })}>{calendarEventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label="Date"><input required type="date" value={draft.date} onChange={(change) => setDraft({ ...draft, date: change.target.value })} /></Field><Field label="Location"><input value={draft.location} placeholder="Address or meeting place" onChange={(change) => setDraft({ ...draft, location: change.target.value })} /></Field><Field label="Start time"><input required type="time" value={draft.startTime} onChange={(change) => setDraft({ ...draft, startTime: change.target.value })} /></Field><Field label="End time"><input type="time" value={draft.endTime} onChange={(change) => setDraft({ ...draft, endTime: change.target.value })} /></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={draft.notes} placeholder="Details, preparation, or people involved" onChange={(change) => setDraft({ ...draft, notes: change.target.value })} /></label></div>{confirmingDelete && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>This permanently removes the calendar event.</span><div className="flex gap-2"><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Keep event</button><button type="button" className="primary-button bg-rose-600 gap-2 hover:bg-rose-700" onClick={() => void remove()} disabled={deleting}><Trash2 size={15} />{deleting ? "Removing..." : "Yes, remove"}</button></div></div>}{error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">{isNew ? <span /> : <button type="button" className="text-button gap-2 text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}><Trash2 size={15} />Remove event</button>}<div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="text-button" onClick={onClose} disabled={saving || deleting}>Cancel</button><button type="submit" className="primary-button gap-2" disabled={saving || deleting}><Save size={16} />{saving ? "Saving..." : isNew ? "Add event" : "Save changes"}</button></div></div></form></div>;
}

function Plans({ customers, plans, onPlanCreate, onPlanUpdate }: { customers: Customer[]; plans: ServicePlan[]; onPlanCreate: (plan: ServicePlanCreateInput) => Promise<ServicePlan>; onPlanUpdate: (planId: string, patch: Partial<ServicePlan>) => Promise<ServicePlan> }) {
  const [selectedId, setSelectedId] = useState(plans[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const plan = plans.find((item) => item.id === selectedId) ?? plans[0];

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Recurring customer work</p><h2 className="text-2xl font-bold text-ink dark:text-white">Service plans</h2></div>
      <button type="button" className="primary-button w-full gap-2 sm:w-auto" onClick={() => setCreating(true)}><Plus size={17} />Add service plan</button>
    </div>
    {plans.length ? <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]"><Section title="Current plans" kicker="Monthly, 3-month, 4-month, 6-month, and yearly"><div className="space-y-2">{plans.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cx("w-full rounded-lg border p-3 text-left transition hover:border-lagoon dark:border-slate-800", plan?.id === item.id ? "border-lagoon bg-mist dark:bg-cyan-500/15" : "border-slate-200")}><div className="flex items-center justify-between gap-3"><strong className="capitalize text-ink dark:text-white">{item.type} plan</strong><Badge status={item.paymentStatus} /></div><p className="mt-1 text-sm text-slate-500">{findCustomer(customers, item.customerId).name} - renews {item.renewalDate}</p></button>)}</div></Section>{plan && <PlanEditor key={plan.id} customers={customers} plan={plan} onSave={onPlanUpdate} />}</div> : <Section title="No service plans yet" kicker="Add the first recurring customer"><div className="py-8 text-center"><p className="text-sm text-slate-500 dark:text-slate-400">Use Add service plan to create one here without creating a job first.</p></div></Section>}
    {creating && <ServicePlanCreateModal customers={customers} onCreate={async (draft) => { const saved = await onPlanCreate(draft); setSelectedId(saved.id); setCreating(false); }} onClose={() => setCreating(false)} />}
  </div>;
}

function PlanEditor({ customers, plan, onSave }: { customers: Customer[]; plan: ServicePlan; onSave: (planId: string, patch: Partial<ServicePlan>) => Promise<ServicePlan> }) {
  const [draft, setDraft] = useState({ ...plan, servicesIncluded: [...plan.servicesIncluded] });
  const [price, setPrice] = useState(plan.price === 0 ? "" : String(plan.price));
  const [discount, setDiscount] = useState(plan.discountPct === 0 ? "" : String(plan.discountPct));
  const [services, setServices] = useState(plan.servicesIncluded.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setDraft({ ...plan, servicesIncluded: [...plan.servicesIncluded] });
    setPrice(plan.price === 0 ? "" : String(plan.price));
    setDiscount(plan.discountPct === 0 ? "" : String(plan.discountPct));
    setServices(plan.servicesIncluded.join(", "));
    setSaved(false);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const serviceList = services.split(",").map((service) => service.trim()).filter(Boolean);
    try {
      const updated = await onSave(plan.id, {
        customerId: draft.customerId,
        type: draft.type,
        price: Number(price) || 0,
        discountPct: Number(discount) || 0,
        renewalDate: draft.renewalDate,
        paymentStatus: draft.paymentStatus,
        servicesIncluded: serviceList,
        notes: draft.notes,
      });
      setDraft({ ...updated, servicesIncluded: [...updated.servicesIncluded] });
      setPrice(updated.price === 0 ? "" : String(updated.price));
      setDiscount(updated.discountPct === 0 ? "" : String(updated.discountPct));
      setServices(updated.servicesIncluded.join(", "));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this service plan.");
    } finally {
      setSaving(false);
    }
  }

  return <Section title="Plan editor" kicker="Subscription status, renewal, services, pricing"><form onSubmit={submit}><div className="settings-grid"><Field label="Customer"><select value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Plan type"><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ServicePlan["type"] })}>{planTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field><Field label="Plan price"><input type="number" min="0" step="0.01" inputMode="decimal" value={price} placeholder="0.00" onChange={(event) => setPrice(event.target.value)} /></Field><Field label="Discount %"><input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={discount} placeholder="0" onChange={(event) => setDiscount(event.target.value)} /></Field><Field label="Renewal date"><input required type="date" value={draft.renewalDate} onChange={(event) => setDraft({ ...draft, renewalDate: event.target.value })} /></Field><Field label="Payment status"><select value={draft.paymentStatus} onChange={(event) => setDraft({ ...draft, paymentStatus: event.target.value as PaymentStatus })}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Services<input required value={services} placeholder="Full property, driveway" onChange={(event) => setServices(event.target.value)} /></label><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>{error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}{saved && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Service plan saved.</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="text-button" onClick={reset} disabled={saving}>Cancel changes</button><button type="submit" className="primary-button gap-2" disabled={saving}><Save size={16} />{saving ? "Saving..." : "Save changes"}</button></div></form></Section>;
}

function ServicePlanCreateModal({ customers, onCreate, onClose }: { customers: Customer[]; onCreate: (plan: ServicePlanCreateInput) => Promise<void>; onClose: () => void }) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [type, setType] = useState<ServicePlan["type"]>("3-month");
  const [renewalDate, setRenewalDate] = useState(isoToday());
  const [service, setService] = useState("");
  const [price, setPrice] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onCreate({ customerId, type, renewalDate, servicesIncluded: [service.trim()], price: Number(price) || 0, paymentStatus, notes: notes.trim() });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create this service plan.");
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-3 sm:p-4"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">New recurring customer</p><h3 className="text-xl font-bold text-ink dark:text-white">Add service plan</h3><p className="mt-1 text-xs text-slate-500">Saves to Supabase and the Recurring Jobs spreadsheet.</p></div><button type="button" className="icon-button shrink-0" onClick={onClose} title="Close" aria-label="Close service plan form"><X size={17} /></button></div><div className="settings-grid mt-5"><Field label="Customer"><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Frequency"><select value={type} onChange={(event) => setType(event.target.value as ServicePlan["type"])}>{planTypes.map((planType) => <option key={planType} value={planType}>{planType}</option>)}</select></Field><Field label="Next service date"><input required type="date" value={renewalDate} onChange={(event) => setRenewalDate(event.target.value)} /></Field><Field label="Plan price"><input required type="number" min="0" step="0.01" inputMode="decimal" value={price} placeholder="0.00" onChange={(event) => setPrice(event.target.value)} /></Field><Field label="Service"><input required value={service} placeholder="Full property" onChange={(event) => setService(event.target.value)} /></Field><Field label="Payment status"><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>{(["paid", "unpaid", "partially paid", "past due"] as PaymentStatus[]).map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={notes} placeholder="Plan details or customer preferences" onChange={(event) => setNotes(event.target.value)} /></label></div>{!customers.length && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">Create a customer from Jobs first, then return here to add their plan.</p>}{error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="text-button" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="primary-button gap-2" disabled={saving || !customers.length}><Save size={16} />{saving ? "Saving..." : "Add service plan"}</button></div></form></div>;
}

function sourceSpreadsheetRowUrl(job: Job) {
  const rowNumber = Number(job.id.match(/(\d+)$/)?.[1]);
  return Number.isFinite(rowNumber) ? `${upcomingJobsSheetUrl}#gid=0&range=A${rowNumber + 1}` : upcomingJobsSheetUrl;
}

function JobModal({ customers, job, onSave, onDelete, onFindOnMap, onClose }: { customers: Customer[]; job: Job; onSave: (jobId: string, patch: Partial<Job>) => Promise<Job>; onDelete: (jobId: string) => Promise<void>; onFindOnMap: (job: Job) => void; onClose: () => void }) {
  const importedMetadata = job.source === "spreadsheet-import" && !job.websiteEditedFields?.includes("notes") && job.notes.startsWith("Spreadsheet status:");
  const [draft, setDraft] = useState({ ...job, notes: importedMetadata ? "" : job.notes });
  const [priceInput, setPriceInput] = useState(job.price === 0 ? "" : String(job.price));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await onDelete(job.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove this job.");
      setDeleting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const editableFields: Array<keyof Job> = ["date", "time", "customerId", "address", "serviceType", "status", "price", "notes", "employeeInstructions"];
    const original = importedMetadata ? { ...job, notes: "" } : job;
    const parsedPrice = Number(priceInput);
    const submittedDraft = { ...draft, price: priceInput.trim() && Number.isFinite(parsedPrice) ? parsedPrice : 0 };
    const patch = Object.fromEntries(editableFields.filter((field) => submittedDraft[field] !== original[field]).map((field) => [field, submittedDraft[field]])) as Partial<Job>;
    try {
      if (Object.keys(patch).length) await onSave(job.id, patch);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this job.");
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-3 sm:p-4"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Edit job</p><h3 className="text-xl font-bold text-ink dark:text-white">{findCustomer(customers, draft.customerId).name}</h3><p className="mt-1 text-xs text-slate-500">Changes save to both the website and Upcoming Jobs spreadsheet.</p></div><button type="button" className="icon-button shrink-0" onClick={onClose} title="Close" aria-label="Close job editor"><X size={17} /></button></div><div className="settings-grid mt-5"><Field label="Customer"><select value={draft.customerId} onChange={(event) => setDraft({ ...draft, customerId: event.target.value })}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></Field><Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Job["status"] })}>{jobStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><Field label="Date"><input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></Field><Field label="Time"><input value={draft.time} required placeholder="09:00" onChange={(event) => setDraft({ ...draft, time: event.target.value })} /></Field><Field label="Price"><input type="number" min="0" step="0.01" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} /></Field><Field label="Service"><input value={draft.serviceType} required onChange={(event) => setDraft({ ...draft, serviceType: event.target.value })} /></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Address<input value={draft.address} required onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Instructions for employee<textarea value={draft.employeeInstructions ?? ""} onChange={(event) => setDraft({ ...draft, employeeInstructions: event.target.value })} placeholder="Gate code, water access, pets, surfaces to avoid, customer requests, or equipment needed" /></label><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Internal job notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>{job.websiteEditedFields?.length ? <p className="mt-4 rounded-lg bg-mist px-3 py-2 text-xs font-medium text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200">Website edits saved for: {job.websiteEditedFields.join(", ")}</p> : null}{confirmingDelete && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>This permanently removes the job from the website and spreadsheet.</span><div className="flex gap-2"><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Keep job</button><button type="button" className="primary-button bg-rose-600 gap-2 hover:bg-rose-700" onClick={() => void remove()} disabled={deleting}><Trash2 size={15} />{deleting ? "Removing..." : "Yes, remove"}</button></div></div>}{error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-col gap-2 sm:flex-row">{job.source === "spreadsheet-import" && <a className="text-button gap-2" href={sourceSpreadsheetRowUrl(job)} target="_blank" rel="noreferrer"><ExternalLink size={15} />View original spreadsheet row</a>}<button type="button" className="text-button gap-2" onClick={() => onFindOnMap(job)} disabled={!job.address.trim()}><MapPinned size={15} />Find on map</button><button type="button" className="text-button gap-2 text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}><Trash2 size={15} />Remove job</button></div><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="text-button" onClick={onClose} disabled={saving || deleting}>Cancel</button><button type="submit" className="primary-button gap-2" disabled={saving || deleting}><Save size={16} />{saving ? "Saving..." : "Save changes"}</button></div></div></form></div>;
}

function LeadModal({ lead, onSave, onDelete, onClose }: { lead: Lead; onSave: (leadId: string, patch: Partial<Lead>) => Promise<Lead>; onDelete: (leadId: string) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(lead);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await onDelete(lead.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to remove this lead.");
      setDeleting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const editableFields: Array<keyof Lead> = ["name", "contact", "address", "status", "estimatedValue", "followUpDate", "notes"];
    const patch = Object.fromEntries(editableFields.filter((field) => draft[field] !== lead[field]).map((field) => [field, draft[field]])) as Partial<Lead>;
    try {
      if (Object.keys(patch).length) await onSave(lead.id, patch);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this lead.");
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-3 sm:p-4"><form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Edit lead</p><h3 className="text-xl font-bold text-ink dark:text-white">{draft.name}</h3><p className="mt-1 text-xs text-slate-500">Source: {lead.source || "Manual entry"}</p></div><button type="button" className="icon-button shrink-0" onClick={onClose} title="Close" aria-label="Close lead editor"><X size={17} /></button></div><div className="settings-grid mt-5"><Field label="Name"><input value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="Status"><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LeadStatus })}>{leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field><Field label="Contact information"><input value={draft.contact} onChange={(event) => setDraft({ ...draft, contact: event.target.value })} /></Field><Field label="Estimated value"><input type="number" min="0" step="0.01" value={draft.estimatedValue} onChange={(event) => setDraft({ ...draft, estimatedValue: Number(event.target.value) || 0 })} /></Field><Field label="Follow-up date"><input type="date" value={draft.followUpDate} onChange={(event) => setDraft({ ...draft, followUpDate: event.target.value })} /></Field><Field label="Address"><input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></Field><label className="sm:col-span-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>{lead.websiteEditedFields?.length ? <p className="mt-4 rounded-lg bg-mist px-3 py-2 text-xs font-medium text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200">Website edits saved for: {lead.websiteEditedFields.join(", ")}</p> : null}{confirmingDelete && <div className="mt-4 flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>This permanently removes the lead from the website and spreadsheet.</span><div className="flex gap-2"><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Keep lead</button><button type="button" className="primary-button bg-rose-600 gap-2 hover:bg-rose-700" onClick={() => void remove()} disabled={deleting}><Trash2 size={15} />{deleting ? "Removing..." : "Yes, remove"}</button></div></div>}{error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><button type="button" className="text-button gap-2 text-rose-600 hover:border-rose-300 hover:text-rose-700 dark:text-rose-300" onClick={() => setConfirmingDelete(true)} disabled={saving || deleting}><Trash2 size={15} />Remove lead</button><div className="flex flex-col-reverse gap-2 sm:flex-row"><button type="button" className="text-button" onClick={onClose} disabled={saving || deleting}>Cancel</button><button type="submit" className="primary-button gap-2" disabled={saving || deleting}><Save size={16} />{saving ? "Saving..." : "Save changes"}</button></div></div></form></div>;
}
