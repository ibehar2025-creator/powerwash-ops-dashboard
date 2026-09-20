import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Eye, LoaderCircle, Megaphone, MousePointerClick, RefreshCw, ShieldCheck, Target, Users } from "lucide-react";
import { loadMetaAdsReport } from "../lib/api";
import type { MetaAdMetric, MetaAdsLevel, MetaAdsReport } from "../lib/api";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function shiftedToday(days: number) { const date = new Date(); date.setDate(date.getDate() + days); return isoDate(date); }
function money(value: number | null | undefined, currency = "USD") { return value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
function number(value: number | undefined) { return new Intl.NumberFormat("en-US").format(value ?? 0); }
function percent(value: number | undefined) { return `${(value ?? 0).toFixed(2)}%`; }

const levels: { id: MetaAdsLevel; label: string }[] = [{ id: "campaign", label: "Campaigns" }, { id: "adset", label: "Ad sets" }, { id: "ad", label: "Ads" }];

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Eye }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold text-ink dark:text-white">{value}</p></div><span className="grid h-10 w-10 place-items-center rounded-lg bg-cyan-50 text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"><Icon size={19} /></span></div>
  </article>;
}

export function MetaAdsDashboard() {
  const [since, setSince] = useState(shiftedToday(-29));
  const [until, setUntil] = useState(shiftedToday(0));
  const [level, setLevel] = useState<MetaAdsLevel>("campaign");
  const [report, setReport] = useState<MetaAdsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (nextLevel = level) => {
    setLoading(true); setError("");
    try { setReport(await loadMetaAdsReport({ since, until, level: nextLevel })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Meta reporting could not be loaded."); }
    finally { setLoading(false); }
  }, [level, since, until]);

  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseLevel = (next: MetaAdsLevel) => { setLevel(next); void refresh(next); };
  const currency = report?.account.currency || "USD";
  const summary = report?.summary;
  const breakdown = report?.breakdown ?? [];

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-5 shadow-sm dark:border-cyan-900/60 dark:from-cyan-950/50 dark:via-slate-900 dark:to-blue-950/40 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-lagoon dark:text-cyan-300">Private owner reporting</p><h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-ink dark:text-white"><Megaphone size={24} /> Meta Ads</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Powerwashing Pros · Ad account {report?.account.id || "1269731845278311"}</p></div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"><ShieldCheck size={15} /> Read-only</span><span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">Permission: ads_read</span></div></div>
    </section>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void refresh(); }}><label className="text-sm font-semibold text-slate-700 dark:text-slate-200">From<input className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" type="date" value={since} max={until} onChange={(event) => setSince(event.target.value)} /></label><label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Through<input className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" type="date" value={until} min={since} max={shiftedToday(0)} onChange={(event) => setUntil(event.target.value)} /></label><button className="inline-flex items-center gap-2 rounded-lg bg-lagoon px-4 py-2.5 font-bold text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <RefreshCw size={17} />} Apply dates</button></form>
    </section>

    {error && <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><p className="font-semibold">{error}</p><button className="mt-3 rounded-lg border border-rose-300 px-3 py-1.5 font-bold dark:border-rose-800" onClick={() => void refresh()}>Try again</button></section>}

    {!error && report && !report.configured && <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100"><h3 className="font-bold">Connect the read-only Meta report</h3><p className="mt-2 text-sm">Add <code className="font-bold">META_ADS_ACCESS_TOKEN</code> to the Render web service using a token that grants <code className="font-bold">ads_read</code> only. The server will refuse tokens that grant <code className="font-bold">ads_management</code> or another unapproved permission.</p></section>}

    {report?.configured && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Spend" value={money(summary?.spend, currency)} icon={BadgeDollarSign} /><MetricCard label="Impressions" value={number(summary?.impressions)} icon={Eye} /><MetricCard label="Reach" value={number(summary?.reach)} icon={Users} /><MetricCard label="Clicks" value={number(summary?.clicks)} icon={MousePointerClick} /><MetricCard label="CTR" value={percent(summary?.ctr)} icon={Target} /><MetricCard label="CPC" value={money(summary?.cpc, currency)} icon={MousePointerClick} /><MetricCard label="Leads" value={number(summary?.leads)} icon={Users} /><MetricCard label="Cost per lead" value={money(summary?.costPerLead, currency)} icon={BadgeDollarSign} /></div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"><h3 className="font-bold text-ink dark:text-white">Daily spend</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{since} through {until}</p><div className="mt-5 h-72">{(report.trend?.length ?? 0) > 0 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={report.trend}><defs><linearGradient id="metaSpend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0891b2" stopOpacity={0.5}/><stop offset="95%" stopColor="#0891b2" stopOpacity={0.03}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2}/><XAxis dataKey="dateStart" tick={{ fontSize: 11 }} minTickGap={28}/><YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `$${value}`}/><Tooltip formatter={(value) => money(Number(value), currency)} /><Area type="monotone" dataKey="spend" name="Spend" stroke="#0891b2" fill="url(#metaSpend)" strokeWidth={2}/></AreaChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-sm text-slate-500">No delivery data for these dates.</div>}</div></section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800"><div><h3 className="font-bold text-ink dark:text-white">Performance breakdown</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Reporting only—these controls never change ad settings.</p></div><div className="flex rounded-lg border border-slate-200 p-1 dark:border-slate-700">{levels.map((item) => <button key={item.id} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${level === item.id ? "bg-lagoon text-white" : "text-slate-600 dark:text-slate-300"}`} onClick={() => chooseLevel(item.id)}>{item.label}</button>)}</div></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400"><tr>{["Name","Spend","Impressions","Reach","Clicks","CTR","CPC","Leads","Cost / lead"].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{breakdown.map((row: MetaAdMetric) => <tr key={row.id}><td className="max-w-xs px-4 py-3 font-semibold text-ink dark:text-white">{row.name}</td><td className="px-4 py-3">{money(row.spend, currency)}</td><td className="px-4 py-3">{number(row.impressions)}</td><td className="px-4 py-3">{number(row.reach)}</td><td className="px-4 py-3">{number(row.clicks)}</td><td className="px-4 py-3">{percent(row.ctr)}</td><td className="px-4 py-3">{money(row.cpc, currency)}</td><td className="px-4 py-3">{number(row.leads)}</td><td className="px-4 py-3">{money(row.costPerLead, currency)}</td></tr>)}{!breakdown.length && <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={9}>No {levels.find((item) => item.id === level)?.label.toLowerCase()} reported for these dates.</td></tr>}</tbody></table></div></section>
    </>}

    {report && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"><div className="flex flex-wrap gap-x-6 gap-y-2"><span><strong>Reporting timezone:</strong> {report.reporting.timezone}</span><span><strong>Last successful refresh:</strong> {report.reporting.lastSuccessfulRefresh ? new Date(report.reporting.lastSuccessfulRefresh).toLocaleString() : "Not connected"}</span><span><strong>Verified token permissions:</strong> {report.verifiedPermissions.length ? report.verifiedPermissions.join(", ") : "Not yet verified"}</span></div><p className="mt-2">{report.reporting.delayNotice}</p>{report.reporting.missingData.map((message) => <p key={message} className="mt-1 font-semibold text-amber-700 dark:text-amber-300">{message}</p>)}</section>}
  </div>;
}
