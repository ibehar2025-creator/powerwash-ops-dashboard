import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, BriefcaseBusiness, Download, ReceiptText, Target, TrendingUp, Users } from "lucide-react";
import { currency } from "../lib/calculations";
import type { Customer, Expense, Invoice, Job, Lead, ServicePlan } from "../types/business";

type RangePreset = "30d" | "90d" | "year" | "all";

const dayMs = 86_400_000;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function localDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(value: string, days: number) {
  const date = localDate(value);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function cleanService(value: string) {
  const trimmed = value.trim();
  return trimmed || "Unspecified service";
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function AnalyticsMetric({ label, value, detail, change, icon: Icon }: { label: string; value: string; detail: string; change?: number | null; icon: typeof TrendingUp }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p><p className="mt-3 text-2xl font-bold text-ink dark:text-white">{value}</p></div><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"><Icon size={19} /></span></div>
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="text-slate-500 dark:text-slate-400">{detail}</span>{change !== undefined && <span className={change === null || change >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-300" : "font-semibold text-rose-600 dark:text-rose-300"}>{change === null ? "New in this period" : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs prior period`}</span>}</div>
  </article>;
}

function AnalyticsSection({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"><div><h3 className="text-base font-bold text-ink dark:text-white">{title}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p></div><div className="mt-5">{children}</div></section>;
}

export function Analytics({ customers, jobs, leads, invoices, plans, expenses, currentDate }: { customers: Customer[]; jobs: Job[]; leads: Lead[]; invoices: Invoice[]; plans: ServicePlan[]; expenses: Expense[]; currentDate: string }) {
  const year = currentDate.slice(0, 4);
  const earliestJob = jobs.map((job) => job.date).filter(Boolean).sort()[0] ?? `${year}-01-01`;
  const [preset, setPreset] = useState<RangePreset>("year");
  const [customStart, setCustomStart] = useState(`${year}-01-01`);
  const [customEnd, setCustomEnd] = useState(`${year}-12-31`);

  const range = useMemo(() => {
    if (preset === "all") return { start: earliestJob, end: jobs.map((job) => job.date).filter(Boolean).sort().at(-1) ?? currentDate };
    if (preset === "30d") return { start: shiftDate(currentDate, -29), end: currentDate };
    if (preset === "90d") return { start: shiftDate(currentDate, -89), end: currentDate };
    const first = customStart || earliestJob;
    const last = customEnd || currentDate;
    return first <= last ? { start: first, end: last } : { start: last, end: first };
  }, [currentDate, customEnd, customStart, earliestJob, jobs, preset]);

  const report = useMemo(() => {
    const filteredJobs = jobs.filter((job) => job.date >= range.start && job.date <= range.end && job.status !== "canceled");
    const completed = filteredJobs.filter((job) => job.status === "completed");
    const filteredExpenses = expenses.filter((expense) => expense.date >= range.start && expense.date <= range.end);
    const bookedRevenue = filteredJobs.reduce((sum, job) => sum + job.price, 0);
    const completedRevenue = completed.reduce((sum, job) => sum + job.price, 0);
    const expenseTotal = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const paid = filteredJobs.reduce((sum, job) => sum + Math.min(job.amountPaid, job.price), 0);
    const outstanding = filteredJobs.reduce((sum, job) => sum + Math.max(0, job.price - job.amountPaid), 0);

    const startDate = localDate(range.start);
    const endDate = localDate(range.end);
    const span = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1);
    const previousEnd = shiftDate(range.start, -1);
    const previousStart = shiftDate(previousEnd, -(span - 1));
    const previousJobs = jobs.filter((job) => job.date >= previousStart && job.date <= previousEnd && job.status !== "canceled");
    const previousBooked = previousJobs.reduce((sum, job) => sum + job.price, 0);
    const previousCompleted = previousJobs.filter((job) => job.status === "completed").reduce((sum, job) => sum + job.price, 0);

    const customerJobCounts = new Map<string, number>();
    filteredJobs.forEach((job) => customerJobCounts.set(job.customerId, (customerJobCounts.get(job.customerId) ?? 0) + 1));
    const activeCustomers = [...customerJobCounts.values()];
    const repeatRate = activeCustomers.length ? activeCustomers.filter((count) => count > 1).length / activeCustomers.length * 100 : 0;

    const serviceMap = new Map<string, { service: string; revenue: number; completed: number; jobs: number }>();
    filteredJobs.forEach((job) => {
      const service = cleanService(job.serviceType);
      const row = serviceMap.get(service) ?? { service, revenue: 0, completed: 0, jobs: 0 };
      row.revenue += job.price;
      row.jobs += 1;
      if (job.status === "completed") row.completed += job.price;
      serviceMap.set(service, row);
    });
    const services = [...serviceMap.values()].sort((a, b) => b.revenue - a.revenue);

    const customerNames = new Map(customers.map((customer) => [customer.id, customer.name]));
    const customerMap = new Map<string, { id: string; name: string; revenue: number; jobs: number; completed: number }>();
    filteredJobs.forEach((job) => {
      const row = customerMap.get(job.customerId) ?? { id: job.customerId, name: customerNames.get(job.customerId) ?? "Customer", revenue: 0, jobs: 0, completed: 0 };
      row.revenue += job.price;
      row.jobs += 1;
      if (job.status === "completed") row.completed += job.price;
      customerMap.set(job.customerId, row);
    });
    const topCustomers = [...customerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    const monthly = span > 120;
    const trendMap = new Map<string, { period: string; booked: number; completed: number; jobs: number }>();
    filteredJobs.forEach((job) => {
      const key = monthly ? job.date.slice(0, 7) : job.date;
      const row = trendMap.get(key) ?? { period: key, booked: 0, completed: 0, jobs: 0 };
      row.booked += job.price;
      row.jobs += 1;
      if (job.status === "completed") row.completed += job.price;
      trendMap.set(key, row);
    });
    const trend = [...trendMap.values()].sort((a, b) => a.period.localeCompare(b.period)).map((row) => ({ ...row, label: monthly ? new Date(`${row.period}-02T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : new Date(`${row.period}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }) }));

    const sourceMap = new Map<string, { source: string; leads: number; won: number; lost: number; value: number }>();
    leads.forEach((lead) => {
      const source = lead.source.trim() || "Unknown";
      const row = sourceMap.get(source) ?? { source, leads: 0, won: 0, lost: 0, value: 0 };
      row.leads += 1;
      if (lead.status === "won") row.won += 1;
      if (lead.status === "lost") row.lost += 1;
      row.value += lead.estimatedValue;
      sourceMap.set(source, row);
    });
    const leadSources = [...sourceMap.values()].sort((a, b) => b.leads - a.leads);
    const decidedLeads = leads.filter((lead) => lead.status === "won" || lead.status === "lost");
    const conversionRate = decidedLeads.length ? decidedLeads.filter((lead) => lead.status === "won").length / decidedLeads.length * 100 : 0;

    return { filteredJobs, bookedRevenue, completedRevenue, expenseTotal, paid, outstanding, completedJobs: completed.length, averageJob: completed.length ? completedRevenue / completed.length : 0, repeatRate, previousBooked, previousCompleted, services, topCustomers, trend, leadSources, conversionRate };
  }, [customers, expenses, jobs, leads, range.end, range.start]);

  const pricedPlans = plans.filter((plan) => plan.price > 0);
  const annualRecurring = pricedPlans.reduce((sum, plan) => sum + plan.price * ({ monthly: 12, "3-month": 4, "4-month": 3, "6-month": 2, yearly: 1 }[plan.type] ?? 0), 0);
  const invoiceExposure = invoices
    .filter((invoice) => invoice.issuedDate >= range.start && invoice.issuedDate <= range.end && invoice.status !== "paid")
    .reduce((sum, invoice) => sum + Math.max(0, invoice.price + invoice.tip - invoice.discount - invoice.amountPaid), 0);

  function exportJobs() {
    const names = new Map(customers.map((customer) => [customer.id, customer.name]));
    const rows = [["Date", "Time", "Customer", "Address", "Service", "Status", "Price", "Paid", "Outstanding"]];
    report.filteredJobs.forEach((job) => rows.push([job.date, job.time, names.get(job.customerId) ?? "Customer", job.address, job.serviceType, job.status, String(job.price), String(job.amountPaid), String(Math.max(0, job.price - job.amountPaid))]));
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `powerwashing-analytics-${range.start}-to-${range.end}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <div className="space-y-4">
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5 xl:flex-row xl:items-end xl:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon dark:text-cyan-300">Owner analytics</p><h2 className="mt-1 text-2xl font-bold text-ink dark:text-white">Business performance</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Revenue, customer, service, lead, and payment performance from saved business records.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="segmented self-start" aria-label="Analytics date range">{(["30d", "90d", "year", "all"] as RangePreset[]).map((item) => <button key={item} type="button" className={preset === item ? "active" : ""} onClick={() => setPreset(item)}>{item === "year" ? "This year" : item === "all" ? "All time" : item}</button>)}</div>
        <label className="text-xs font-semibold text-slate-500">Start<input className="mt-1 block" type="date" value={customStart} onChange={(event) => { setCustomStart(event.target.value); setPreset("year"); }} /></label>
        <label className="text-xs font-semibold text-slate-500">End<input className="mt-1 block" type="date" value={customEnd} onChange={(event) => { setCustomEnd(event.target.value); setPreset("year"); }} /></label>
        <button type="button" className="text-button gap-2" onClick={exportJobs}><Download size={15} />Export CSV</button>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <AnalyticsMetric label="Booked revenue" value={currency.format(report.bookedRevenue)} detail={`${report.filteredJobs.length} non-canceled jobs`} change={percentChange(report.bookedRevenue, report.previousBooked)} icon={TrendingUp} />
      <AnalyticsMetric label="Completed revenue" value={currency.format(report.completedRevenue)} detail={`${report.completedJobs} completed jobs`} change={percentChange(report.completedRevenue, report.previousCompleted)} icon={BadgeDollarSign} />
      <AnalyticsMetric label="Recorded expenses" value={currency.format(report.expenseTotal)} detail="Expenses dated in this range" icon={ReceiptText} />
      <AnalyticsMetric label="Margin before payroll & tax" value={currency.format(report.completedRevenue - report.expenseTotal)} detail="Completed revenue minus recorded expenses" icon={Target} />
      <AnalyticsMetric label="Average completed job" value={currency.format(report.averageJob)} detail="Completed jobs in this range" icon={BriefcaseBusiness} />
      <AnalyticsMetric label="Repeat customer rate" value={`${report.repeatRate.toFixed(1)}%`} detail="Customers with 2+ jobs in this range" icon={Users} />
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <AnalyticsSection title="Revenue over time" detail="Booked versus completed job value"><div className="h-80 min-h-80 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={report.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" opacity={0.45} /><XAxis dataKey="label" minTickGap={24} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis width={54} tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => currency.format(Number(value))} contentStyle={{ borderRadius: 6, borderColor: "#cbd5e1", fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="booked" name="Booked" fill="#087f8c" radius={[3, 3, 0, 0]} /><Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></AnalyticsSection>
      <AnalyticsSection title="Cash exposure" detail="Payment signals in the selected range, plus current recurring revenue"><div className="space-y-4"><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800"><span className="text-sm text-slate-500">Recorded paid amount</span><strong className="text-ink dark:text-white">{currency.format(report.paid)}</strong></div><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800"><span className="text-sm text-slate-500">Job value outstanding</span><strong className="text-amber-700 dark:text-amber-300">{currency.format(report.outstanding)}</strong></div><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800"><span className="text-sm text-slate-500">Invoice exposure</span><strong className="text-ink dark:text-white">{currency.format(invoiceExposure)}</strong></div><div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800"><span className="text-sm text-slate-500">Annual recurring revenue</span><strong className="text-ink dark:text-white">{currency.format(annualRecurring)}</strong></div><div className="flex items-center justify-between"><span className="text-sm text-slate-500">Lead conversion</span><strong className="text-ink dark:text-white">{report.conversionRate.toFixed(1)}%</strong></div></div></AnalyticsSection>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <AnalyticsSection title="Top services" detail="Ranked by booked revenue in the selected range">
        <div className="space-y-2 sm:hidden">
          {report.services.slice(0, 10).map((item) => <div key={item.service} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><p className="break-words font-semibold text-ink dark:text-white">{item.service}</p><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="block text-slate-400">Jobs</span><strong>{item.jobs}</strong></div><div><span className="block text-slate-400">Completed</span><strong>{currency.format(item.completed)}</strong></div><div className="text-right"><span className="block text-slate-400">Booked</span><strong>{currency.format(item.revenue)}</strong></div></div></div>)}
          {!report.services.length && <p className="py-8 text-center text-sm text-slate-400">No jobs in this range.</p>}
        </div>
        <div className="hidden sm:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="pb-2">Service</th><th className="pb-2 text-right">Jobs</th><th className="pb-2 text-right">Completed</th><th className="pb-2 text-right">Booked</th></tr></thead><tbody>{report.services.slice(0, 10).map((item) => <tr key={item.service} className="border-t border-slate-100 dark:border-slate-800"><td className="max-w-64 py-3 pr-3 font-medium text-ink dark:text-white">{item.service}</td><td className="text-right text-slate-500">{item.jobs}</td><td className="text-right text-slate-500">{currency.format(item.completed)}</td><td className="text-right font-semibold">{currency.format(item.revenue)}</td></tr>)}{!report.services.length && <tr><td colSpan={4} className="py-8 text-center text-slate-400">No jobs in this range.</td></tr>}</tbody></table></div>
      </AnalyticsSection>
      <AnalyticsSection title="Best customers" detail="Highest booked value in the selected range"><div className="space-y-2">{report.topCustomers.map((item, index) => <div key={item.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800"><span className="text-xs font-bold text-slate-400">{index + 1}</span><div className="min-w-0"><p className="truncate font-semibold text-ink dark:text-white">{item.name}</p><p className="text-xs text-slate-500">{item.jobs} jobs / {currency.format(item.completed)} completed</p></div><strong className="text-sm text-ink dark:text-white">{currency.format(item.revenue)}</strong></div>)}{!report.topCustomers.length && <p className="py-8 text-center text-sm text-slate-400">No customers in this range.</p>}</div></AnalyticsSection>
    </div>

    <AnalyticsSection title="Lead source performance" detail="All-time lead pipeline because imported leads do not include a created date">
      <div className="space-y-2 sm:hidden">{report.leadSources.map((item) => { const decisions = item.won + item.lost; return <div key={item.source} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"><p className="break-words font-semibold text-ink dark:text-white">{item.source}</p><div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><span className="block text-slate-400">Leads / won</span><strong>{item.leads} / {item.won}</strong></div><div className="text-right"><span className="block text-slate-400">Conversion</span><strong>{decisions ? `${(item.won / decisions * 100).toFixed(1)}%` : "Not enough data"}</strong></div><div className="col-span-2"><span className="block text-slate-400">Estimated value</span><strong>{currency.format(item.value)}</strong></div></div></div>; })}{!report.leadSources.length && <p className="py-8 text-center text-sm text-slate-400">No leads recorded.</p>}</div>
      <div className="hidden sm:block"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="pb-2">Source</th><th className="pb-2 text-right">Leads</th><th className="pb-2 text-right">Won</th><th className="pb-2 text-right">Conversion</th><th className="pb-2 text-right">Estimated value</th></tr></thead><tbody>{report.leadSources.map((item) => { const decisions = item.won + item.lost; return <tr key={item.source} className="border-t border-slate-100 dark:border-slate-800"><td className="py-3 font-medium text-ink dark:text-white">{item.source}</td><td className="text-right">{item.leads}</td><td className="text-right">{item.won}</td><td className="text-right">{decisions ? `${(item.won / decisions * 100).toFixed(1)}%` : "-"}</td><td className="text-right font-semibold">{currency.format(item.value)}</td></tr>; })}{!report.leadSources.length && <tr><td colSpan={5} className="py-8 text-center text-slate-400">No leads recorded.</td></tr>}</tbody></table></div>
    </AnalyticsSection>
  </div>;
}
