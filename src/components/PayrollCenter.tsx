import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, WalletCards } from "lucide-react";
import { createPayrollRun, finalizePayrollRun, loadOwnerPayroll, recordPayrollPayment } from "../lib/api";
import type { OwnerPayrollSnapshot } from "../lib/api";
import { currency, isoToday } from "../lib/calculations";
import type { EmployeeProfile, PayrollLine, PayrollRun } from "../types/business";

type ContractorTotal = { employeeId: string; employeeName: string; lines: PayrollLine[]; total: number };

function contractorTotals(lines: PayrollLine[]) {
  const grouped = new Map<string, ContractorTotal>();
  for (const line of lines) {
    const current = grouped.get(line.employeeId) ?? { employeeId: line.employeeId, employeeName: line.employeeName, lines: [], total: 0 };
    current.lines.push(line);
    current.total += line.amount;
    grouped.set(line.employeeId, current);
  }
  return [...grouped.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

function displayDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PayrollCenter({ employees }: { employees: EmployeeProfile[] }) {
  const [snapshot, setSnapshot] = useState<OwnerPayrollSnapshot>();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  async function reload(showLoader = false) {
    if (showLoader) setLoading(true);
    setError("");
    try {
      const result = await loadOwnerPayroll();
      if (!result) throw new Error("Contractor payments are unavailable.");
      setSnapshot(result);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load contractor payments.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const preview = snapshot?.preview;
  const currentRun = snapshot?.runs.find((run) => run.periodStart === preview?.periodStart && run.periodEnd === preview?.periodEnd);
  const totals = useMemo(() => contractorTotals(currentRun?.lines ?? preview?.eligibleLines ?? []), [currentRun?.lines, preview?.eligibleLines]);
  const weeklyTotal = currentRun?.netPay ?? totals.reduce((sum, person) => sum + person.total, 0);
  const paidIds = new Set(currentRun?.payments.map((payment) => payment.employeeId) ?? []);

  async function prepareWeek() {
    if (!preview) return;
    setWorking("prepare"); setError(""); setMessage("");
    try {
      const draft = currentRun ?? await createPayrollRun(preview);
      if (!draft) throw new Error("The weekly payment list could not be created.");
      const ready = draft.status === "draft" ? await finalizePayrollRun(draft.id) : draft;
      if (!ready) throw new Error("The weekly payment list could not be confirmed.");
      setMessage(`Amounts confirmed. Pay contractors by ${displayDate(ready.payday)}.`);
      await reload();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to confirm this week."); }
    finally { setWorking(""); }
  }

  async function markPaid(employeeId: string) {
    if (!currentRun) return;
    setWorking(employeeId); setError(""); setMessage("");
    try {
      const updated = await recordPayrollPayment(currentRun.id, { employeeId, paymentMethod: "bank", reference: "", note: "1099 contractor payment", paidAt: isoToday() });
      if (!updated) throw new Error("The payment could not be recorded.");
      setMessage("Payment marked as paid.");
      await reload();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to mark the payment paid."); }
    finally { setWorking(""); }
  }

  if (loading) return <div className="grid min-h-[360px] place-items-center text-sm font-semibold text-slate-500"><span className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin" />Loading contractor payments...</span></div>;
  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon">Owner only</p><h2 className="text-2xl font-bold text-ink dark:text-white">Weekly contractor payments</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Approved job earnings automatically build this week’s 1099 contractor total.</p></div><button className="text-button gap-2" disabled={Boolean(working)} onClick={() => void reload(true)}><RefreshCw size={15} />Refresh totals</button></header>
    {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
    {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</p>}
    {preview && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="bg-gradient-to-r from-lagoon to-cyan-600 p-5 text-white sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">Week of {displayDate(preview.periodStart)}</p><p className="mt-2 text-4xl font-bold">{currency.format(weeklyTotal)}</p><p className="mt-1 text-sm text-cyan-50">{totals.length} contractor{totals.length === 1 ? "" : "s"} · through {displayDate(preview.periodEnd)}</p></div><div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur"><div className="flex items-center gap-2 text-cyan-50"><CalendarClock size={19} /><span className="text-xs font-bold uppercase tracking-wide">Pay by</span></div><p className="mt-1 text-xl font-bold">{displayDate(preview.payday)}</p></div></div></div>
      <div className="p-4 sm:p-6"><div className="space-y-3">{totals.map((person) => {
        const paid = paidIds.has(person.employeeId);
        const name = employees.find((item) => item.id === person.employeeId)?.name ?? person.employeeName;
        const jobCount = person.lines.filter((line) => line.lineType === "commission").length;
        return <article key={person.employeeId} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-ink dark:text-white">{name}</h3><p className="mt-1 text-sm text-slate-500">{jobCount} approved job{jobCount === 1 ? "" : "s"} plus approved tips and upsells</p></div><div className="flex items-center justify-between gap-3 sm:justify-end"><strong className="text-xl text-ink dark:text-white">{currency.format(person.total)}</strong>{paid ? <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"><Check size={14} />Paid</span> : currentRun?.status === "finalized" ? <button className="primary-button" disabled={Boolean(working)} onClick={() => void markPaid(person.employeeId)}>{working === person.employeeId ? "Saving..." : "Mark paid"}</button> : null}</div></div><details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-lagoon">View earnings included</summary><div className="mt-2 space-y-2">{person.lines.map((line) => <div key={line.id} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800"><span>{displayDate(line.workDate)} · {line.customerName} · {line.lineType.replaceAll("_", " ")}</span><strong>{currency.format(line.amount)}</strong></div>)}</div></details></article>;
      })}</div>
        {!totals.length && <div className="py-10 text-center"><WalletCards className="mx-auto text-slate-300" size={34} /><p className="mt-3 font-semibold text-ink dark:text-white">No approved earnings yet</p><p className="mt-1 text-sm text-slate-500">Approve completed-job earnings in Team and they will appear here automatically.</p></div>}
        {totals.length > 0 && (!currentRun || currentRun.status === "draft") && <button className="primary-button mt-5 w-full gap-2" disabled={Boolean(working)} onClick={() => void prepareWeek()}><CheckCircle2 size={17} />{working === "prepare" ? "Confirming..." : "Confirm weekly amounts"}</button>}
        {preview.missingApprovals > 0 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{preview.missingApprovals} completed-job submission{preview.missingApprovals === 1 ? " is" : "s are"} still waiting for approval and not included yet.</p>}
      </div>
    </section>}
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><button className="flex w-full items-center justify-between p-4 text-left font-semibold text-ink dark:text-white" onClick={() => setHistoryOpen((value) => !value)}><span>Previous payment weeks</span>{historyOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{historyOpen && <div className="border-t border-slate-200 p-4 dark:border-slate-800"><div className="space-y-2">{snapshot?.runs.filter((run) => run.id !== currentRun?.id).map((run) => <HistoryRow key={run.id} run={run} />)}{!snapshot?.runs.filter((run) => run.id !== currentRun?.id).length && <p className="text-sm text-slate-500">No previous weekly payment records.</p>}</div></div>}</section>
    <p className="px-1 text-xs leading-5 text-slate-500 dark:text-slate-400">This page tracks internal contractor earnings and payment status only. It does not calculate taxes or create tax forms.</p>
  </div>;
}

function HistoryRow({ run }: { run: PayrollRun }) {
  return <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-ink dark:text-white">{displayDate(run.periodStart)} – {displayDate(run.periodEnd)}</p><p className="text-xs text-slate-500">Pay date {displayDate(run.payday)}</p></div><div className="flex items-center gap-3"><strong>{currency.format(run.netPay)}</strong><span className={`rounded-md px-2 py-1 text-xs font-bold ${run.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200"}`}>{run.status === "paid" ? "Paid" : "Payment due"}</span></div></div>;
}
