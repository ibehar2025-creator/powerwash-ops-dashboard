import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { BadgeDollarSign, Bell, BriefcaseBusiness, CalendarDays, Check, ClipboardPlus, DollarSign, Home, LogOut, MapPinned, Menu, Moon, Navigation, Phone, Save, Sparkles, Sun, X } from "lucide-react";
import { BusinessMap } from "./BusinessMap";
import { InstallAppButton } from "./InstallAppButton";
import { EmployeeContractFlow } from "./EmployeeContractFlow";
import { EmployeePayrollStatements } from "./EmployeePayrollStatements";
import { createSolicitation, deleteSolicitation, loadEmployeePayroll, loadEmployeeWorkspace, loadReadNotificationKeys, markNotificationsRead, saveEmployeeJobPatch, saveSolicitationPatch, submitEmployeeEarnings, submitEmployeeUpsell } from "../lib/api";
import type { EmployeeWorkspaceSnapshot } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { currency, isoToday } from "../lib/calculations";
import type { EarningSubmission, Job, JobStatus, PayrollRun, Solicitation } from "../types/business";

type EmployeeTab = "home" | "schedule" | "map" | "earnings" | "contract";
const tabs: Array<{ id: EmployeeTab; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "map", label: "Map", icon: MapPinned },
  { id: "earnings", label: "Earnings", icon: BadgeDollarSign },
  { id: "contract", label: "New Contract", icon: ClipboardPlus },
];
const statuses: JobStatus[] = ["scheduled", "in progress", "completed", "canceled", "past due"];

function EmployeeThemeSwitch({ darkMode, onToggle }: { darkMode: boolean; onToggle: () => void }) {
  return <button type="button" className="icon-button" onClick={onToggle} aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"} title={darkMode ? "Light mode" : "Dark mode"}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>;
}

function moneyTotal(items: EarningSubmission[], statusesToInclude: EarningSubmission["status"][]) {
  return items.filter((item) => statusesToInclude.includes(item.status)).reduce((sum, item) => sum + item.totalEarnings, 0);
}

function statusStyle(status: string) {
  if (status === "approved" || status === "paid" || status === "completed") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200";
  if (status === "rejected" || status === "past due") return "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200";
  return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200";
}

export function EmployeeWorkspace({ preview, onExitPreview }: { preview?: boolean; onExitPreview?: () => void }) {
  const { user, signOut } = useAuth();
  const [data, setData] = useState<EmployeeWorkspaceSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<EmployeeTab>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [earningsJob, setEarningsJob] = useState<Job | null>(null);
  const [upsellJob, setUpsellJob] = useState<Job | null>(null);
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

  const employee = data?.employee;
  const assignmentMap = useMemo(() => new Map((data?.assignments ?? []).map((assignment) => [assignment.jobId, assignment])), [data?.assignments]);
  const customerMap = useMemo(() => new Map((data?.customers ?? []).map((customer) => [customer.id, customer])), [data?.customers]);
  const today = isoToday();
  const jobsToday = (data?.jobs ?? []).filter((job) => job.date === today);
  const assignedJobs = (data?.jobs ?? []).filter((job) => assignmentMap.has(job.id));

  async function updateJob(jobId: string, patch: Pick<Partial<Job>, "status" | "notes">) {
    const saved = await saveEmployeeJobPatch(jobId, patch, preview ? employee?.id : undefined);
    if (!saved) throw new Error("The job could not be saved.");
    setData((current) => current ? { ...current, jobs: current.jobs.map((job) => job.id === jobId ? saved : job) } : current);
    setSelectedJob(null);
  }

  async function addSolicitation(draft: Omit<Solicitation, "id">) {
    const result = await createSolicitation(draft, preview ? employee?.id : undefined);
    if (!result) throw new Error("The solicitation could not be saved.");
    setData((current) => current ? { ...current, solicitations: [result.solicitation, ...current.solicitations] } : current);
  }

  async function updateSolicitation(id: string, patch: Partial<Solicitation>) {
    const result = await saveSolicitationPatch(id, patch);
    if (!result) throw new Error("The solicitation could not be updated.");
    setData((current) => current ? { ...current, solicitations: current.solicitations.map((item) => item.id === id ? result.solicitation : item) } : current);
  }

  async function removeSolicitation(id: string) {
    const result = await deleteSolicitation(id);
    if (!result?.deleted) throw new Error("The solicitation could not be removed.");
    setData((current) => current ? { ...current, solicitations: current.solicitations.filter((item) => item.id !== id) } : current);
  }

  const content = loading ? <div className="grid min-h-[420px] place-items-center"><p className="text-sm font-semibold text-slate-500">Loading your workspace...</p></div>
    : error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-rose-700"><p className="font-semibold">Employee workspace could not load</p><p className="mt-1 text-sm">{error}</p><button className="text-button mt-4" onClick={() => void reload()}>Try again</button></div>
      : data ? <>
        {activeTab === "home" && <EmployeeHome data={data} jobsToday={jobsToday} assignmentMap={assignmentMap} customerMap={customerMap} onJob={setSelectedJob} />}
        {activeTab === "schedule" && <EmployeeSchedule data={data} assignmentMap={assignmentMap} customerMap={customerMap} onJob={setSelectedJob} />}
        {activeTab === "map" && <BusinessMap customers={data.customers} jobs={data.jobs} solicitations={data.solicitations} onSaveJobCoordinates={async () => undefined} onCreateSolicitation={addSolicitation} onUpdateSolicitation={updateSolicitation} onDeleteSolicitation={removeSolicitation} />}
        {activeTab === "earnings" && <><EmployeePayrollStatements statements={statements} /><div className="mt-5"><EmployeeEarnings earnings={data.earnings} payouts={data.payouts} jobs={assignedJobs} customerMap={customerMap} onSubmit={setEarningsJob} /></div></>}
        {activeTab === "contract" && <EmployeeContractFlow employeeId={preview ? employee?.id : undefined} onSubmitted={() => setActiveTab("home")} />}
      </> : null;

  return <div className={darkMode ? "dark" : ""}><div className="flex min-h-screen bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 lg:block">
      <div className="mb-6 rounded-lg bg-ink p-4 text-white"><p className="text-sm text-cyan-100">The</p><h1 className="text-xl font-bold">Powerwashing Pros</h1><p className="mt-2 text-xs text-slate-300">Employee field workspace</p></div>
      <EmployeeNav active={activeTab} onChoose={setActiveTab} />
    </aside>
    <main className="min-w-0 flex-1 overflow-x-hidden">
      {preview && <div className="employee-preview-banner flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900"><span>Owner preview: employee workspace</span><button className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1" onClick={onExitPreview}>Return to owner</button></div>}
      <header className={`${preview ? "" : "app-header "}border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900`}><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><button className="icon-button lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={18} /></button><div className="min-w-0"><p className="text-xs font-semibold uppercase text-lagoon">Employee workspace</p><h1 className="truncate text-2xl font-bold text-ink dark:text-white">{tabs.find((tab) => tab.id === activeTab)?.label}</h1><p className="truncate text-xs text-slate-500">{employee?.name ?? user.name}</p></div></div><div className="flex items-center gap-2"><InstallAppButton /><EmployeeNotifications data={data} statements={statements} assignmentMap={assignmentMap} /><EmployeeThemeSwitch darkMode={darkMode} onToggle={() => setDarkMode((value) => !value)} />{!preview && <button className="icon-button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>}</div></div></header>
      <div className="p-4 sm:p-6">{content}</div>
    </main>
    {menuOpen && <div className="fixed inset-0 z-[70] lg:hidden"><button className="absolute inset-0 bg-ink/45" onClick={() => setMenuOpen(false)} aria-label="Close navigation" /><aside className="absolute bottom-0 left-0 top-0 w-[min(82vw,320px)] bg-white p-4 shadow-soft dark:bg-slate-900"><div className="mb-5 flex items-center justify-between"><strong className="text-ink dark:text-white">Employee menu</strong><button className="icon-button" onClick={() => setMenuOpen(false)}><X size={17} /></button></div><EmployeeNav active={activeTab} onChoose={(tab) => { setActiveTab(tab); setMenuOpen(false); }} /></aside></div>}
    {selectedJob && <EmployeeJobModal job={selectedJob} customer={customerMap.get(selectedJob.customerId)} assigned={assignmentMap.has(selectedJob.id)} onClose={() => setSelectedJob(null)} onSave={updateJob} onEarnings={() => { setSelectedJob(null); setEarningsJob(selectedJob); }} onUpsell={() => { setSelectedJob(null); setUpsellJob(selectedJob); }} />}
    {earningsJob && <EarningsModal job={earningsJob} employeeId={preview ? employee?.id : undefined} existing={data?.earnings.find((item) => item.jobId === earningsJob.id)} onClose={() => setEarningsJob(null)} onSaved={(saved) => { setData((current) => current ? { ...current, earnings: current.earnings.some((item) => item.id === saved.id) ? current.earnings.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.earnings] } : current); setEarningsJob(null); }} />}
    {upsellJob && <UpsellModal job={upsellJob} employeeId={preview ? employee?.id : undefined} existing={data?.earnings.find((item) => item.jobId === upsellJob.id)} onClose={() => setUpsellJob(null)} onSaved={(saved) => { setData((current) => current ? { ...current, earnings: current.earnings.some((item) => item.id === saved.id) ? current.earnings.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.earnings] } : current); setUpsellJob(null); }} />}
  </div></div>;
}

function EmployeeNav({ active, onChoose }: { active: EmployeeTab; onChoose: (tab: EmployeeTab) => void }) {
  return <nav className="space-y-1">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} className={`nav-item ${active === tab.id ? "active" : ""}`} onClick={() => onChoose(tab.id)}><Icon size={18} />{tab.label}</button>; })}</nav>;
}

function EmployeeHome({ data, jobsToday, assignmentMap, customerMap, onJob }: { data: EmployeeWorkspaceSnapshot; jobsToday: Job[]; assignmentMap: Map<string, unknown>; customerMap: Map<string, EmployeeWorkspaceSnapshot["customers"][number]>; onJob: (job: Job) => void }) {
  const pending = moneyTotal(data.earnings, ["pending"]);
  const approved = moneyTotal(data.earnings, ["approved"]);
  return <div className="space-y-5"><div><p className="text-xs font-semibold uppercase text-lagoon">Field overview</p><h2 className="text-2xl font-bold text-ink dark:text-white">Ready for the day</h2><p className="mt-1 text-sm text-slate-500">Your schedule, assignments, and personal pay in one place.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MiniMetric label="Jobs today" value={String(jobsToday.length)} detail="Company schedule" icon={BriefcaseBusiness} /><MiniMetric label="Your assignments" value={String(data.assignments.length)} detail="Inside this two-week window" icon={Check} /><MiniMetric label="Awaiting approval" value={currency.format(pending)} detail="Your submitted earnings" icon={DollarSign} /><MiniMetric label="Approved unpaid" value={currency.format(approved)} detail="Ready for payout" icon={BadgeDollarSign} /></div><section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="font-semibold text-ink dark:text-white">Today’s jobs</h3><div className="mt-3 grid gap-3 lg:grid-cols-2">{jobsToday.map((job) => { const customer = customerMap.get(job.customerId); return <button key={job.id} className="rounded-lg border border-slate-200 p-4 text-left hover:border-lagoon dark:border-slate-700" onClick={() => onJob(job)}><div className="flex items-start justify-between gap-3"><div><strong className="text-ink dark:text-white">{job.time} · {customer?.name ?? "Customer"}</strong><p className="mt-1 text-sm text-slate-500">{job.address}</p></div>{assignmentMap.has(job.id) && <span className="rounded-md bg-mist px-2 py-1 text-xs font-semibold text-lagoon">Assigned to you</span>}</div><p className="mt-3 text-sm">{job.serviceType} · {currency.format(job.price)}</p></button>; })}{!jobsToday.length && <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">No jobs scheduled today.</p>}</div></section></div>;
}

function MiniMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Home }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex justify-between gap-3"><p className="text-sm text-slate-500">{label}</p><Icon className="text-lagoon" size={19} /></div><p className="mt-5 text-2xl font-bold text-ink dark:text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}

function EmployeeSchedule({ data, assignmentMap, customerMap, onJob }: { data: EmployeeWorkspaceSnapshot; assignmentMap: Map<string, unknown>; customerMap: Map<string, EmployeeWorkspaceSnapshot["customers"][number]>; onJob: (job: Job) => void }) {
  const groups = useMemo(() => { const result = new Map<string, Job[]>(); data.jobs.forEach((job) => result.set(job.date, [...(result.get(job.date) ?? []), job])); return [...result.entries()]; }, [data.jobs]);
  return <div className="space-y-4"><div><p className="text-xs font-semibold uppercase text-lagoon">Previous and upcoming week</p><h2 className="text-2xl font-bold text-ink dark:text-white">Two-week schedule</h2></div>{groups.map(([date, jobs]) => <section key={date} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="font-semibold text-ink dark:text-white">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</h3><div className="mt-3 grid gap-3 lg:grid-cols-2">{jobs.map((job) => { const customer = customerMap.get(job.customerId); return <button key={job.id} className="rounded-lg border border-slate-200 p-3 text-left hover:border-lagoon dark:border-slate-700" onClick={() => onJob(job)}><div className="flex justify-between gap-3"><strong className="text-ink dark:text-white">{job.time} · {customer?.name ?? "Customer"}</strong><span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusStyle(job.status)}`}>{job.status}</span></div><p className="mt-1 text-sm text-slate-500">{job.address}</p><p className="mt-2 text-sm">{job.serviceType} · {currency.format(job.price)}</p>{assignmentMap.has(job.id) && <p className="mt-2 text-xs font-semibold text-lagoon">Your assigned job</p>}</button>; })}</div></section>)}</div>;
}

function EmployeeEarnings({ earnings, payouts, jobs, customerMap, onSubmit }: { earnings: EarningSubmission[]; payouts: EmployeeWorkspaceSnapshot["payouts"]; jobs: Job[]; customerMap: Map<string, EmployeeWorkspaceSnapshot["customers"][number]>; onSubmit: (job: Job) => void }) {
  return <div className="space-y-5"><div><p className="text-xs font-semibold uppercase text-lagoon">Personal compensation</p><h2 className="text-2xl font-bold text-ink dark:text-white">Your earnings</h2><p className="mt-1 text-sm text-slate-500">Company revenue and other employees’ pay are not shown here.</p></div><div className="grid gap-4 sm:grid-cols-3"><MiniMetric label="Pending" value={currency.format(moneyTotal(earnings, ["pending"]))} detail="Waiting for owner approval" icon={DollarSign} /><MiniMetric label="Approved unpaid" value={currency.format(moneyTotal(earnings, ["approved"]))} detail="Ready for payout" icon={Check} /><MiniMetric label="Paid" value={currency.format(moneyTotal(earnings, ["paid"]))} detail={`${payouts.length} payout records`} icon={BadgeDollarSign} /></div><section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between"><h3 className="font-semibold text-ink dark:text-white">Assigned jobs</h3></div><div className="mt-3 space-y-2">{jobs.map((job) => { const earning = earnings.find((item) => item.jobId === job.id); return <div key={job.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-ink dark:text-white">{customerMap.get(job.customerId)?.name ?? "Customer"}</strong><p className="text-xs text-slate-500">{job.date} · {currency.format(job.price)}</p>{earning && <p className="mt-1 text-sm font-semibold">Estimated pay: {currency.format(earning.totalEarnings)} <span className={`ml-2 rounded-md px-2 py-1 text-xs ${statusStyle(earning.status)}`}>{earning.status}</span></p>}{earning?.ownerNote && <p className="mt-1 text-xs text-rose-600">Owner note: {earning.ownerNote}</p>}</div><button className="text-button" disabled={earning?.status === "approved" || earning?.status === "paid"} onClick={() => onSubmit(job)}>{earning ? "Update submission" : "Submit job earnings"}</button></div>; })}{!jobs.length && <p className="text-sm text-slate-500">No jobs are assigned to you in this schedule window.</p>}</div></section></div>;
}

function EmployeeJobModal({ job, customer, assigned, onClose, onSave, onEarnings, onUpsell }: { job: Job; customer?: EmployeeWorkspaceSnapshot["customers"][number]; assigned: boolean; onClose: () => void; onSave: (id: string, patch: Pick<Partial<Job>, "status" | "notes">) => Promise<void>; onEarnings: () => void; onUpsell: () => void }) {
  const [status, setStatus] = useState(job.status);
  const [notes, setNotes] = useState(job.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/55 p-3"><div className="max-h-[94dvh] w-full max-w-xl overflow-auto rounded-lg bg-white p-5 dark:bg-slate-900"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-lagoon">Job details</p><h2 className="text-xl font-bold text-ink dark:text-white">{customer?.name ?? "Customer"}</h2></div><button className="icon-button" onClick={onClose}><X size={17} /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label="Date and time" value={`${job.date} at ${job.time}`} /><Info label="Job price" value={currency.format(job.price)} /><Info label="Service" value={job.serviceType} /><Info label="Address" value={job.address} /></div><div className="mt-4 flex flex-wrap gap-2">{customer?.phone && <a className="text-button gap-2" href={`tel:${customer.phone}`}><Phone size={15} />Call customer</a>}<a className="text-button gap-2" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer"><Navigation size={15} />Directions</a>{assigned && <><button className="text-button gap-2" onClick={onUpsell}><Sparkles size={15} />Record upsell</button><button className="text-button gap-2" onClick={onEarnings}><DollarSign size={15} />Earnings</button></>}</div>{assigned ? <div className="mt-5 space-y-4"><label className="block text-sm font-semibold">Status<select value={status} onChange={(event) => setStatus(event.target.value as JobStatus)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block text-sm font-semibold">Operational notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>{error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button className="primary-button w-full gap-2" disabled={saving} onClick={() => { setSaving(true); setError(""); void onSave(job.id, { status, notes }).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "Unable to save.")).finally(() => setSaving(false)); }}><Save size={16} />{saving ? "Saving..." : "Save job update"}</button></div> : <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">This job is visible for scheduling awareness but is not assigned to you.</p>}</div></div>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs text-slate-500">{label}</span><strong className="mt-1 block text-sm text-ink dark:text-white">{value || "Not listed"}</strong></div>; }

function EarningsModal({ job, employeeId, existing, onClose, onSaved }: { job: Job; employeeId?: string; existing?: EarningSubmission; onClose: () => void; onSaved: (saved: EarningSubmission) => void }) {
  const [tip, setTip] = useState(existing?.tipAmount ? String(existing.tipAmount) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const saved = await submitEmployeeEarnings({ jobId: job.id, tipAmount: Number(tip) || 0, employeeId }); if (!saved) throw new Error("Submission service is unavailable."); onSaved(saved); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to submit earnings."); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/55 p-3"><form className="w-full max-w-md rounded-lg bg-white p-5 dark:bg-slate-900" onSubmit={submit}><div className="flex justify-between"><div><p className="text-xs font-semibold uppercase text-lagoon">Job compensation</p><h2 className="text-xl font-bold text-ink dark:text-white">Submit earnings details</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><p className="mt-2 text-sm text-slate-500">Base commission and accepted upsell commission are calculated automatically. Enter the customer tip here.</p><div className="mt-5 space-y-4"><label className="block text-sm font-semibold">Customer tip<input type="number" min="0" step="0.01" value={tip} onChange={(event) => setTip(event.target.value)} placeholder="0.00" /></label>{existing?.upsellDescription && <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><p className="font-semibold">Upsell: {existing.upsellDescription}</p><p className="mt-1 text-xs text-slate-500">{existing.upsellOutcome} · quoted {currency.format(existing.upsellQuotedAmount)}</p></div>}</div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button className="primary-button mt-5 w-full" disabled={saving}>{saving ? "Submitting..." : "Send for owner approval"}</button></form></div>;
}

function UpsellModal({ job, employeeId, existing, onClose, onSaved }: { job: Job; employeeId?: string; existing?: EarningSubmission; onClose: () => void; onSaved: (saved: EarningSubmission) => void }) {
  const [description, setDescription] = useState(existing?.upsellDescription ?? "");
  const [quotedAmount, setQuotedAmount] = useState(existing?.upsellQuotedAmount ? String(existing.upsellQuotedAmount) : "");
  const [outcome, setOutcome] = useState<"accepted" | "declined" | "follow-up">(existing?.upsellOutcome || "accepted");
  const [notes, setNotes] = useState(existing?.upsellNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const saved = await submitEmployeeUpsell({ jobId: job.id, description, outcome, quotedAmount: Number(quotedAmount), notes, employeeId });
      if (!saved) throw new Error("Upsell service is unavailable.");
      onSaved(saved);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to save the upsell."); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/55 p-3"><form className="max-h-[94dvh] w-full max-w-md overflow-auto rounded-lg bg-white p-5 dark:bg-slate-900" onSubmit={submit}><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-lagoon">Sales opportunity</p><h2 className="text-xl font-bold text-ink dark:text-white">Record customer upsell</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={17} /></button></div><p className="mt-2 text-sm text-slate-500">Record exactly what was offered and how the customer responded.</p><div className="mt-5 space-y-4"><label className="block text-sm font-semibold">Service offered<input required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Back patio cleaning" /></label><label className="block text-sm font-semibold">Quoted price<input required type="number" min="0" step="0.01" inputMode="decimal" value={quotedAmount} onChange={(event) => setQuotedAmount(event.target.value)} placeholder="125.00" /></label><label className="block text-sm font-semibold">Customer result<select value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="follow-up">Follow up later</option></select></label><label className="block text-sm font-semibold">Conversation notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What the customer said, timing, or follow-up details" /></label></div><div className={`mt-4 rounded-lg p-3 text-sm ${outcome === "accepted" ? "bg-emerald-50 text-emerald-800" : outcome === "follow-up" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{outcome === "accepted" ? "This will be sent to the owner for approval and included in commission calculations." : outcome === "follow-up" ? "This will be saved as a follow-up opportunity without changing job revenue." : "This will be saved as sales history without changing job revenue."}</div>{error && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<button className="primary-button mt-5 w-full gap-2" disabled={saving}><Sparkles size={16} />{saving ? "Saving upsell..." : "Save upsell result"}</button></form></div>;
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
    data.solicitations.filter((item) => item.outcome === "follow up" && item.followUpDate && item.followUpDate <= addDay(today, 7)).forEach((item) => reminders.push({ key: `employee-followup-v1|${item.id}|${item.followUpDate}`, title: "Solicitation follow-up", detail: `${item.followUpDate} · ${item.address}` }));
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
