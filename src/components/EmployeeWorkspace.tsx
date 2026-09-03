import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BadgeDollarSign, Bell, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, DollarSign, Home, MapPinned, Menu, Navigation, Phone, Save, Sparkles, X } from "lucide-react";
import { ProfileMenu } from "./ProfileMenu";
import { EmployeePayrollStatements } from "./EmployeePayrollStatements";
import { loadEmployeePayroll, loadEmployeeWorkspace, loadReadNotificationKeys, markNotificationsRead, saveEmployeeJobPatch, submitEmployeeEarnings } from "../lib/api";
import type { EmployeeWorkspaceSnapshot } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { currency, isoToday } from "../lib/calculations";
import { loadThemePreference, saveThemePreference, themeIsDark } from "../lib/themePreference";
import type { EarningSubmission, Job, JobStatus, PayrollRun } from "../types/business";

type EmployeeTab = "home" | "schedule" | "map" | "earnings";
const tabs: Array<{ id: EmployeeTab; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "map", label: "Map", icon: MapPinned },
  { id: "earnings", label: "Earnings", icon: BadgeDollarSign },
];
const statuses: JobStatus[] = ["scheduled", "in progress", "completed", "canceled", "past due"];
const employeeInputClass = "mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const employeeTextareaClass = `${employeeInputClass} min-h-28 resize-y`;
const BusinessMap = lazy(() => import("./BusinessMap").then((module) => ({ default: module.BusinessMap })));

function moneyTotal(items: EarningSubmission[], statusesToInclude: EarningSubmission["status"][]) {
  return items.filter((item) => statusesToInclude.includes(item.status)).reduce((sum, item) => sum + item.totalEarnings, 0);
}

function statusStyle(status: string) {
  if (status === "approved" || status === "paid" || status === "completed") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
  if (status === "rejected" || status === "past due") return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200";
  return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200";
}

export function EmployeeWorkspace({ preview, onExitPreview }: { preview?: boolean; onExitPreview?: () => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<EmployeeWorkspaceSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<EmployeeTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePreference, setThemePreference] = useState(() => loadThemePreference(user.id));
  const [darkMode, setDarkMode] = useState(() => themeIsDark(loadThemePreference(user.id)));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [earningsJob, setEarningsJob] = useState<Job | null>(null);
  const [statements, setStatements] = useState<PayrollRun[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [snapshot, payroll] = await Promise.all([loadEmployeeWorkspace(), loadEmployeePayroll()]);
      if (!snapshot) throw new Error("The employee workspace is unavailable.");
      setData(snapshot);
      setStatements(payroll?.statements ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load employee workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    saveThemePreference(user.id, themePreference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setDarkMode(themePreference === "dark" || (themePreference === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [themePreference, user.id]);

  useEffect(() => {
    const refresh = () => void reload();
    const interval = window.setInterval(refresh, 30 * 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  const employee = data?.employee;
  const assignmentMap = useMemo(() => new Map((data?.assignments ?? []).map((assignment) => [assignment.jobId, assignment])), [data?.assignments]);
  const customerMap = useMemo(() => new Map((data?.customers ?? []).map((customer) => [customer.id, customer])), [data?.customers]);
  const today = isoToday();
  const assignedJobs = (data?.jobs ?? []).filter((job) => assignmentMap.has(job.id));
  const jobsToday = assignedJobs.filter((job) => job.date === today);

  async function updateJob(jobId: string, patch: Pick<Partial<Job>, "status" | "notes">) {
    const saved = await saveEmployeeJobPatch(jobId, patch, preview ? employee?.id : undefined);
    if (!saved) throw new Error("The job could not be saved.");
    setData((current) => current ? { ...current, jobs: current.jobs.map((job) => job.id === jobId ? saved : job) } : current);
    setSelectedJob(null);
  }

  const content = loading ? <div className="grid min-h-[420px] place-items-center"><p className="text-sm font-semibold text-slate-500">Loading your workspace...</p></div>
    : error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-700"><p className="font-semibold">Employee workspace could not load</p><p className="mt-1 text-sm">{error}</p><button className="text-button mt-4" onClick={() => void reload()}>Try again</button></div>
      : data ? <>
        {activeTab === "home" && <EmployeeHome data={data} jobsToday={jobsToday} assignmentMap={assignmentMap} customerMap={customerMap} onJob={setSelectedJob} />}
        {activeTab === "schedule" && <EmployeeSchedule jobs={assignedJobs} customerMap={customerMap} onJob={setSelectedJob} />}
        {activeTab === "map" && <Suspense fallback={<div className="grid min-h-80 place-items-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900">Loading map...</div>}><BusinessMap employeeView customers={data.customers} jobs={assignedJobs} solicitations={[]} onSaveJobCoordinates={async () => undefined} onCreateSolicitation={async () => undefined} onUpdateSolicitation={async () => undefined} onDeleteSolicitation={async () => undefined} /></Suspense>}
        {activeTab === "earnings" && <><EmployeePayrollStatements statements={statements} /><div className="mt-5"><EmployeeEarnings earnings={data.earnings} payouts={data.payouts} jobs={assignedJobs} customerMap={customerMap} onSubmit={setEarningsJob} /></div></>}
      </> : null;

  return <div className={darkMode ? "dark" : ""}><div className="flex min-h-screen bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
      <div className="mb-6 rounded-lg bg-ink p-4 text-white"><p className="text-sm text-cyan-100">The</p><h1 className="text-xl font-bold">Powerwashing Pros</h1><p className="mt-2 text-xs text-slate-300">Employee field workspace</p></div>
      <EmployeeNav active={activeTab} onChoose={setActiveTab} />
    </aside>
    <main className="min-w-0 flex-1 overflow-x-hidden">
      {preview && <div className="employee-preview-banner flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900"><span>Owner preview: employee workspace</span><button className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1" onClick={onExitPreview}>Return to owner</button></div>}
      <header className={`${preview ? "" : "app-header "}border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900`}><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><button className="icon-button lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={18} /></button><div className="min-w-0"><p className="text-xs font-semibold uppercase text-lagoon">Employee workspace</p><h1 className="truncate text-2xl font-bold text-ink dark:text-white">{tabs.find((tab) => tab.id === activeTab)?.label}</h1><p className="truncate text-xs text-slate-500">{employee?.name ?? user.name}</p></div></div><div className="flex items-center gap-2"><EmployeeNotifications data={data} statements={statements} assignmentMap={assignmentMap} /><ProfileMenu theme={themePreference} onTheme={setThemePreference} employee={employee} preview={preview} /></div></div></header>
      <div className="p-4 sm:p-6">{content}</div>
    </main>
    {menuOpen && <div className="fixed inset-0 z-[70] lg:hidden"><button className="absolute inset-0 bg-ink/45" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /><aside className="absolute bottom-0 left-0 top-0 w-[min(82vw,320px)] bg-white p-4 shadow-soft dark:bg-slate-900"><div className="mb-5 flex items-center justify-between"><strong className="text-ink dark:text-white">Employee menu</strong><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={17} /></button></div><EmployeeNav active={activeTab} onChoose={(tab) => { setActiveTab(tab); setMenuOpen(false); }} /></aside></div>}
    {selectedJob && <EmployeeJobModal job={selectedJob} customer={customerMap.get(selectedJob.customerId)} assigned={assignmentMap.has(selectedJob.id)} onClose={() => setSelectedJob(null)} onSave={updateJob} onEarnings={() => { setSelectedJob(null); setEarningsJob(selectedJob); }} />}
    {earningsJob && <EarningsModal job={earningsJob} employeeId={preview ? employee?.id : undefined} existing={data?.earnings.find((item) => item.jobId === earningsJob.id)} onClose={() => setEarningsJob(null)} onSaved={(saved) => { setData((current) => current ? { ...current, earnings: current.earnings.some((item) => item.id === saved.id) ? current.earnings.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.earnings] } : current); setEarningsJob(null); }} />}
  </div></div>;
}

function EmployeeNav({ active, onChoose }: { active: EmployeeTab; onChoose: (tab: EmployeeTab) => void }) {
  return <nav className="space-y-1">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} className={`nav-item ${active === tab.id ? "active" : ""}`} onClick={() => onChoose(tab.id)}><Icon size={18} />{tab.label}</button>; })}</nav>;
}

function EmployeeHome({ data, jobsToday, assignmentMap, customerMap, onJob }: { data: EmployeeWorkspaceSnapshot; jobsToday: Job[]; assignmentMap: Map<string, unknown>; customerMap: Map<string, EmployeeWorkspaceSnapshot["customers"][number]>; onJob: (job: Job) => void }) {
  const pending = moneyTotal(data.earnings, ["pending"]);
  const approved = moneyTotal(data.earnings, ["approved"]);
  const today = isoToday();
  const upcoming = data.jobs.filter((job) => assignmentMap.has(job.id) && job.date >= today && job.status !== "canceled").sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const nextJob = upcoming[0];
  const nextCustomer = nextJob ? customerMap.get(nextJob.customerId) : undefined;
  const firstName = data.employee?.name?.split(" ")[0] || "there";
  return <div className="space-y-5">
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink via-[#0d6070] to-lagoon p-5 text-white shadow-soft sm:p-7">
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-300/15" /><div className="absolute -bottom-20 right-28 h-44 w-44 rounded-full bg-white/10" />
      <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">Your workday</p><h2 className="mt-2 text-3xl font-bold sm:text-4xl">Good to see you, {firstName}.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-cyan-50/90">Your assigned jobs, earnings, and next stop are together here.</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{jobsToday.length} today</span><span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{upcoming.length} upcoming</span></div></div>
        <div className="rounded-2xl border border-white/20 bg-white/12 p-4 backdrop-blur-sm">{nextJob ? <><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-100">Next assigned job</p><span className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${nextJob.date === today ? "bg-amber-300 text-amber-950" : "bg-white/20 text-white"}`}>{nextJob.date === today ? "Today" : formatScheduleDate(nextJob.date, { weekday: "short" })}</span></div><p className="mt-3 text-2xl font-bold">{nextJob.time} · {nextCustomer?.name ?? "Customer"}</p><p className="mt-2 text-sm text-cyan-50">{nextJob.address}</p><p className="mt-1 text-sm text-cyan-100">{nextJob.serviceType}</p><button type="button" className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-lagoon transition hover:bg-cyan-50" onClick={() => onJob(nextJob)}>Open job details</button></> : <div className="py-4 text-center"><CalendarDays className="mx-auto text-cyan-100" size={30} /><p className="mt-3 font-semibold">No upcoming assignments</p><p className="mt-1 text-sm text-cyan-100">New assigned work will appear here.</p></div>}</div>
      </div>
    </section>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MiniMetric label="Jobs today" value={String(jobsToday.length)} detail="Assigned stops" icon={BriefcaseBusiness} tone="cyan" /><MiniMetric label="Upcoming jobs" value={String(upcoming.length)} detail="Current schedule" icon={CalendarDays} tone="blue" /><MiniMetric label="Awaiting approval" value={currency.format(pending)} detail="Earnings submitted" icon={DollarSign} tone="amber" /><MiniMetric label="Approved unpaid" value={currency.format(approved)} detail="Ready for payment" icon={BadgeDollarSign} tone="emerald" /></div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon">Today’s route</p><h3 className="mt-1 text-xl font-bold text-ink dark:text-white">Assigned jobs</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-lagoon dark:bg-cyan-500/10 dark:text-cyan-200"><MapPinned size={19} /></span></div><div className="grid gap-3 p-4 lg:grid-cols-2">{jobsToday.map((job, index) => { const customer = customerMap.get(job.customerId); return <button key={job.id} className="group rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-lagoon hover:shadow-md dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60" onClick={() => onJob(job)}><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lagoon text-sm font-bold text-white shadow-sm">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon">{job.time}</p><strong className="mt-1 block text-lg text-ink dark:text-white">{customer?.name ?? "Customer"}</strong></div><span className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${statusStyle(job.status)}`}>{job.status}</span></div><p className="mt-2 text-sm text-slate-500">{job.address}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{job.serviceType}</span><span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{currency.format(job.price)}</span></div></div></div></button>; })}{!jobsToday.length && <div className="col-span-full rounded-xl border border-dashed border-cyan-200 bg-cyan-50/50 px-5 py-10 text-center dark:border-cyan-500/20 dark:bg-cyan-500/5"><CalendarDays className="mx-auto text-lagoon dark:text-cyan-200" size={30} /><p className="mt-3 font-semibold text-ink dark:text-white">No assigned jobs today</p><p className="mt-1 text-sm text-slate-500">Your next assignment is shown above.</p></div>}</div></section>
  </div>;
}

function MiniMetric({ label, value, detail, icon: Icon, tone = "cyan" }: { label: string; value: string; detail: string; icon: typeof Home; tone?: "cyan" | "blue" | "amber" | "emerald" }) {
  const tones = { cyan: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200", blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200", amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200", emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-2xl font-bold text-ink dark:text-white">{value}</p></div><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={19} /></span></div><p className="mt-2 text-xs text-slate-500">{detail}</p></div>;
}

function EmployeeSchedule({ jobs, customerMap, onJob }: { jobs: Job[]; customerMap: Map<string, EmployeeWorkspaceSnapshot["customers"][number]>; onJob: (job: Job) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const jobsByDate = useMemo(() => { const result = new Map<string, Job[]>(); jobs.forEach((job) => result.set(job.date, [...(result.get(job.date) ?? []), job].sort((a, b) => a.time.localeCompare(b.time)))); return result; }, [jobs]);
  const currentWeekStart = useMemo(() => startOfWeek(isoToday()), []);
  const weekStart = addDay(currentWeekStart, weekOffset * 7);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDay(weekStart, index)), [weekStart]);
  const weekEnd = dates[6];
  const weekJobs = dates.reduce((total, date) => total + (jobsByDate.get(date)?.length ?? 0), 0);
  const rangeLabel = `${formatScheduleDate(weekStart, { month: "short", day: "numeric", year: "numeric" })} - ${formatScheduleDate(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`;

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon">Assigned work</p><h2 className="text-2xl font-bold text-ink dark:text-white">Your schedule</h2></div>
      <div className="flex items-center gap-2 self-start lg:self-auto">
        <button type="button" className="icon-button h-12 w-12" onClick={() => setWeekOffset((value) => value - 1)} title="Previous week" aria-label="Previous week"><ChevronLeft size={20} /></button>
        <button type="button" className="text-button min-h-12 px-5" onClick={() => setWeekOffset(0)}>Today</button>
        <button type="button" className="icon-button h-12 w-12" onClick={() => setWeekOffset((value) => value + 1)} title="Next week" aria-label="Next week"><ChevronRight size={20} /></button>
        <span className="hidden min-h-12 items-center rounded-lg bg-lagoon px-5 text-sm font-semibold text-white sm:inline-flex">Week</span>
      </div>
    </div>
    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h3 className="text-xl font-bold text-ink dark:text-white">{rangeLabel}</h3>
      <p className="text-sm text-slate-500">{weekJobs} assigned {weekJobs === 1 ? "job" : "jobs"}</p>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {dates.map((date) => {
        const dayJobs = jobsByDate.get(date) ?? [];
        const isToday = date === isoToday();
        return <article key={date} className={`min-h-72 rounded-xl border bg-slate-50/70 p-4 dark:bg-slate-950/40 ${isToday ? "border-lagoon ring-2 ring-lagoon/10" : "border-slate-200 dark:border-slate-700"}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="text-lg font-bold text-ink dark:text-white">{formatScheduleDate(date, { weekday: "short" })} {Number(date.slice(8))}</h4>
            <span className="text-sm text-slate-500">{date.slice(5)}</span>
          </div>
          <div className="mt-4 space-y-3">
            {dayJobs.map((job) => {
              const customer = customerMap.get(job.customerId);
              return <button key={job.id} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-lagoon hover:shadow-sm dark:border-slate-700 dark:bg-slate-900" onClick={() => onJob(job)}>
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{job.time}</span>
                <strong className="mt-1 block text-base text-ink dark:text-white">{customer?.name ?? "Customer"}</strong>
                <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{job.address}</span>
                <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{job.serviceType}</span>
                <span className={`mt-2 inline-block rounded-md px-2 py-1 text-xs font-semibold capitalize ${statusStyle(job.status)}`}>{job.status}</span>
              </button>;
            })}
            {!dayJobs.length && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-base text-slate-500 dark:border-slate-700 dark:text-slate-400">Nothing<br />scheduled</div>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function EmployeeEarnings({ earnings, payouts, jobs, customerMap, onSubmit }: { earnings: EarningSubmission[]; payouts: EmployeeWorkspaceSnapshot["payouts"]; jobs: Job[]; customerMap: Map<string, EmployeeWorkspaceSnapshot["customers"][number]>; onSubmit: (job: Job) => void }) {
  return <div className="space-y-5"><div><p className="text-xs font-semibold uppercase text-lagoon">Personal compensation</p><h2 className="text-2xl font-bold text-ink dark:text-white">Your earnings</h2></div><div className="grid gap-4 sm:grid-cols-3"><MiniMetric label="Pending" value={currency.format(moneyTotal(earnings, ["pending"]))} detail="Waiting for owner approval" icon={DollarSign} /><MiniMetric label="Approved unpaid" value={currency.format(moneyTotal(earnings, ["approved"]))} detail="Ready for payout" icon={Check} /><MiniMetric label="Paid" value={currency.format(moneyTotal(earnings, ["paid"]))} detail={`${payouts.length} payout records`} icon={BadgeDollarSign} /></div><section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h3 className="font-semibold text-ink dark:text-white">Assigned jobs</h3></div><div className="mt-3 space-y-2">{jobs.map((job) => { const earning = earnings.find((item) => item.jobId === job.id); return <div key={job.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-ink dark:text-white">{customerMap.get(job.customerId)?.name ?? "Customer"}</strong><p className="text-xs text-slate-500">{job.date} · {currency.format(job.price)}</p>{earning && <p className="mt-1 text-sm font-semibold">Estimated pay: {currency.format(earning.totalEarnings)} <span className={`ml-2 rounded-md px-2 py-1 text-xs ${statusStyle(earning.status)}`}>{earning.status}</span></p>}{earning?.ownerNote && <p className="mt-1 text-xs text-rose-600">Owner note: {earning.ownerNote}</p>}</div><button className="text-button" disabled={earning?.status === "approved" || earning?.status === "paid"} onClick={() => onSubmit(job)}>{earning ? "Update submission" : "Submit job earnings"}</button></div>; })}{!jobs.length && <p className="text-sm text-slate-500">No jobs are assigned to you in this schedule window.</p>}</div></section></div>;
}

function EmployeeJobModal({ job, customer, assigned, onClose, onSave, onEarnings }: { job: Job; customer?: EmployeeWorkspaceSnapshot["customers"][number]; assigned: boolean; onClose: () => void; onSave: (id: string, patch: Pick<Partial<Job>, "status" | "notes">) => Promise<void>; onEarnings: () => void }) {
  const [status, setStatus] = useState(job.status);
  const [notes, setNotes] = useState(job.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/55 p-3"><div className="max-h-[94dvh] w-full max-w-xl min-w-0 overflow-auto rounded-lg bg-white p-5 dark:bg-slate-900"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-lagoon">Job details</p><h2 className="text-xl font-bold text-ink dark:text-white">{customer?.name ?? "Customer"}</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Date and time" value={`${job.date} at ${job.time}`} /><Info label="Job price" value={currency.format(job.price)} /><Info label="Service" value={job.serviceType} /><Info label="Address" value={job.address} /></div><div className="mt-4 flex flex-wrap gap-2">{customer?.phone && <a className="text-button gap-2" href={`tel:${customer.phone}`}><Phone size={15} />Call customer</a>}<a className="text-button gap-2" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer"><Navigation size={15} />Directions</a>{assigned && <button className="text-button gap-2" onClick={onEarnings}><DollarSign size={15} />Earnings &amp; tip</button>}</div>{assigned ? <div className="mt-5 min-w-0 space-y-4"><label className="block min-w-0 text-sm font-semibold"><span className="block">Status</span><select className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={status} onChange={(event) => setStatus(event.target.value as JobStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block min-w-0 text-sm font-semibold"><span className="block">Operational notes</span><textarea className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button className="primary-button w-full gap-2" disabled={saving} onClick={() => { setSaving(true); setError(""); void onSave(job.id, { status, notes }).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to save.")).finally(() => setSaving(false)); }}><Save size={16} />{saving ? "Saving..." : "Save job update"}</button></div> : <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">This job is visible for scheduling awareness but is not assigned to you.</p>}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-sm text-ink dark:text-white">{value || "Not listed"}</strong></div>; }

function EarningsModal({ job, employeeId, existing, onClose, onSaved }: { job: Job; employeeId?: string; existing?: EarningSubmission; onClose: () => void; onSaved: (saved: EarningSubmission) => void }) {
  const [tip, setTip] = useState(existing?.tipAmount ? String(existing.tipAmount) : "");
  const [hasUpsell, setHasUpsell] = useState(Boolean(existing?.upsellDescription));
  const [description, setDescription] = useState(existing?.upsellDescription ?? "");
  const [quotedAmount, setQuotedAmount] = useState(existing?.upsellQuotedAmount ? String(existing.upsellQuotedAmount) : "");
  const [outcome, setOutcome] = useState<"accepted" | "declined" | "follow-up">(existing?.upsellOutcome || "accepted");
  const [upsellNotes, setUpsellNotes] = useState(existing?.upsellNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const saved = await submitEmployeeEarnings({
        jobId: job.id,
        tipAmount: Number(tip) || 0,
        employeeId,
        hasUpsell,
        ...(hasUpsell ? { upsellDescription: description, upsellOutcome: outcome, upsellQuotedAmount: Number(quotedAmount), upsellNotes } : {}),
      });
      if (!saved) throw new Error("Submission service is unavailable.");
      onSaved(saved);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to submit earnings."); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/55 p-3"><form className="max-h-[94dvh] w-full max-w-lg min-w-0 overflow-auto rounded-xl bg-white p-5 shadow-soft dark:bg-slate-900" onSubmit={submit}><div className="flex justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase text-lagoon">Job compensation</p><h2 className="text-xl font-bold text-ink dark:text-white">Earnings, tip &amp; upsell</h2></div><button type="button" className="icon-button shrink-0" onClick={onClose}><X size={17} /></button></div><p className="mt-2 text-sm text-slate-500">Submit everything from this job in one place for owner approval.</p><div className="mt-5 min-w-0 space-y-5"><label className="block min-w-0 text-sm font-semibold"><span className="block">Customer tip</span><input className={employeeInputClass} type="number" min="0" step="0.01" inputMode="decimal" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0.00" /></label><fieldset><legend className="text-sm font-semibold">Did you offer an upsell?</legend><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" className={hasUpsell ? "primary-button" : "text-button"} aria-pressed={hasUpsell} onClick={() => setHasUpsell(true)}>Yes</button><button type="button" className={!hasUpsell ? "primary-button" : "text-button"} aria-pressed={!hasUpsell} onClick={() => setHasUpsell(false)}>No</button></div></fieldset>{hasUpsell && <div className="space-y-4 rounded-xl border border-cyan-100 bg-cyan-50/60 p-4 dark:border-cyan-500/20 dark:bg-cyan-500/10"><div className="flex items-center gap-2 text-lagoon dark:text-cyan-200"><Sparkles size={17} /><p className="text-sm font-semibold">Upsell details</p></div><label className="block min-w-0 text-sm font-semibold"><span className="block">Service offered</span><input className={employeeInputClass} required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Back patio cleaning" /></label><label className="block min-w-0 text-sm font-semibold"><span className="block">Quoted price</span><input className={employeeInputClass} required type="number" min="0" step="0.01" inputMode="decimal" value={quotedAmount} onChange={(event) => setQuotedAmount(event.target.value)} placeholder="125.00" /></label><label className="block min-w-0 text-sm font-semibold"><span className="block">Customer result</span><select className={employeeInputClass} value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="follow-up">Follow up later</option></select></label><label className="block min-w-0 text-sm font-semibold"><span className="block">Conversation notes</span><textarea className={employeeTextareaClass} value={upsellNotes} onChange={(event) => setUpsellNotes(event.target.value)} placeholder="What the customer said, timing, or follow-up details" /></label></div>}</div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button className="primary-button mt-5 w-full gap-2" disabled={saving}><DollarSign size={16} />{saving ? "Submitting..." : "Send everything for approval"}</button></form></div>;
}

function EmployeeNotifications({ data, statements, assignmentMap }: { data: EmployeeWorkspaceSnapshot | null; statements: PayrollRun[]; assignmentMap: Map<string, unknown> }) {
  const [open, setOpen] = useState(false); const [read, setRead] = useState<Set<string>>(new Set());
  useEffect(() => { void loadReadNotificationKeys().then((result) => setRead(new Set(result?.readKeys ?? []))); }, []);
  const today = isoToday();
  const items = useMemo(() => {
    if (!data) return [];
    const reminders = data.jobs.filter((job) => assignmentMap.has(job.id) && job.date >= today && job.date <= addDay(today, 1)).map((job) => ({ key: `employee-job-v1|${job.id}|${job.date}|${job.status}`, title: job.date === today ? "Assigned job today" : "Assigned job tomorrow", detail: `${job.time} · ${job.address}` }));
    data.earnings.filter((item) => item.status === "approved" || item.status === "rejected").forEach((item) => reminders.push({ key: `employee-earning-v1|${item.id}|${item.status}|${item.reviewedAt}`, title: `Earnings ${item.status}`, detail: `${item.customerName} · ${currency.format(item.totalEarnings)}` }));
    statements.forEach((statement) => reminders.push({ key: `employee-payroll-v1|${statement.id}|${statement.status}`, title: statement.status === "paid" ? "Payroll payment recorded" : "Earnings statement ready", detail: `${statement.periodStart} - ${statement.periodEnd} · ${currency.format(statement.netPay)}` }));
    return reminders;
  }, [assignmentMap, data, statements, today]);
  const visible = items.filter((item) => !read.has(item.key));
  const attentionCount = items.filter((item) => !read.has(`inbox-seen|${item.key}`)).length;
  function mark(key: string) { setRead((current) => new Set([...current, key])); void markNotificationsRead([key]); }
  function toggle() {
    if (!open) {
      const seenKeys = items.map((item) => `inbox-seen|${item.key}`).filter((key) => !read.has(key));
      if (seenKeys.length) {
        setRead((current) => new Set([...current, ...seenKeys]));
        void markNotificationsRead(seenKeys);
      }
    }
    setOpen(!open);
  }
  return <div className="relative z-50"><button className="icon-button relative" onClick={toggle} aria-label="Notifications"><Bell size={17} />{attentionCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{attentionCount}</span>}</button>{open && <><button className="fixed inset-0 z-40 bg-ink/30" onClick={() => setOpen(false)} aria-label="Close notifications" /><div className="fixed inset-x-3 top-20 z-50 max-h-[70dvh] overflow-auto rounded-lg bg-white p-3 shadow-soft dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"><h3 className="px-2 py-2 font-semibold text-ink dark:text-white">Your notifications</h3>{visible.map((item) => <div key={item.key} className="flex items-start gap-3 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-800"><div className="min-w-0 flex-1"><strong className="text-sm text-ink dark:text-white">{item.title}</strong><p className="mt-1 text-xs text-slate-500">{item.detail}</p></div><button className="icon-button h-8 w-8" title="Mark as read" onClick={() => mark(item.key)}><Check size={15} /></button></div>)}{!visible.length && <p className="p-5 text-center text-sm text-slate-500">No unread notifications.</p>}</div></>}</div>;
}

function addDay(date: string, days: number) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); }
function startOfWeek(date: string) { const value = new Date(`${date}T12:00:00`); const daysFromMonday = (value.getDay() + 6) % 7; value.setDate(value.getDate() - daysFromMonday); return value.toISOString().slice(0, 10); }
function formatScheduleDate(date: string, options: Intl.DateTimeFormatOptions) { return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options); }
