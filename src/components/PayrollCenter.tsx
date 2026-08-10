import { useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Download, FileText, Plus, Trash2 } from "lucide-react";
import { addPayrollAdjustment, createPayrollRun, deletePayrollAdjustment, finalizePayrollRun, loadOwnerPayroll, recordPayrollPayment } from "../lib/api";
import type { OwnerPayrollSnapshot } from "../lib/api";
import { currency, isoToday } from "../lib/calculations";
import type { EmployeeProfile, PayrollRun } from "../types/business";

function employeeTotals(run: PayrollRun, employeeId: string) {
  const lines = run.lines.filter((item) => item.employeeId === employeeId);
  const adjustments = run.adjustments.filter((item) => item.employeeId === employeeId);
  const gross = lines.reduce((sum, item) => sum + item.amount, 0);
  const additions = adjustments.filter((item) => item.adjustmentType === "addition").reduce((sum, item) => sum + item.amount, 0);
  const deductions = adjustments.filter((item) => item.adjustmentType === "deduction").reduce((sum, item) => sum + item.amount, 0);
  return { lines, adjustments, gross, additions, deductions, net: gross + additions - deductions };
}

export function PayrollCenter({ employees }: { employees: EmployeeProfile[] }) {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [preview, setPreview] = useState<OwnerPayrollSnapshot["preview"]>();
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [adjustment, setAdjustment] = useState({ employeeId: employees[0]?.id ?? "", adjustmentType: "addition" as "addition" | "deduction", category: "bonus" as "bonus" | "reimbursement" | "deduction" | "correction" | "other", description: "", amount: "" });
  const [paymentEmployee, setPaymentEmployee] = useState("");
  const [payment, setPayment] = useState({ paymentMethod: "bank" as "bank" | "check", paidAt: isoToday(), reference: "", note: "" });

  async function reload() {
    setLoading(true); setError("");
    try {
      const result = await loadOwnerPayroll();
      if (!result) throw new Error("Payroll service is unavailable.");
      setRuns(result.runs); setPreview(result.preview);
      setSelectedId((current) => current || result.runs[0]?.id || "");
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to load payroll."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  const run = runs.find((item) => item.id === selectedId) ?? runs[0];
  const employeeIds = useMemo(() => run ? [...new Set([...run.lines.map((item) => item.employeeId), ...run.adjustments.map((item) => item.employeeId)])] : [], [run]);
  const unpaidIds = run ? employeeIds.filter((id) => !run.payments.some((paymentItem) => paymentItem.employeeId === id)) : [];

  function replaceRun(updated: PayrollRun) {
    setRuns((current) => [updated, ...current.filter((item) => item.id !== updated.id)].sort((a, b) => b.periodStart.localeCompare(a.periodStart)));
    setSelectedId(updated.id);
  }
  async function act(action: () => Promise<PayrollRun | null>, success: string) {
    setWorking(true); setError(""); setMessage("");
    try { const result = await action(); if (!result) throw new Error("Payroll service is unavailable."); replaceRun(result); setMessage(success); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Payroll could not be updated."); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="grid min-h-[360px] place-items-center text-sm font-semibold text-slate-500">Loading payroll...</div>;
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-lagoon">Owner only</p><h2 className="text-2xl font-bold text-ink dark:text-white">Weekly payroll</h2><p className="mt-1 text-sm text-slate-500">Internal commission payroll records. Taxes, filings, and bank transfers are handled outside this app.</p></div>{preview && !runs.some((item) => item.periodStart === preview.periodStart && item.periodEnd === preview.periodEnd) && <button className="primary-button gap-2" disabled={working || !preview.eligibleLines.length} onClick={() => void act(() => createPayrollRun(preview), "Draft payroll created.")}><Plus size={16} />Create {preview.periodStart} payroll</button>}</div>
    {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}{message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</p>}
    {preview && <div className="grid gap-3 sm:grid-cols-3"><Metric label="Uncaptured earnings" value={currency.format(preview.eligibleLines.reduce((sum, item) => sum + item.amount, 0))} detail="Completed work ready for a draft" /><Metric label="Missing approvals" value={String(preview.missingApprovals)} detail="Extras not yet included" /><Metric label="Default payday" value={preview.payday} detail="Friday after the period" /></div>}
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.5fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="font-semibold text-ink dark:text-white">Payroll history</h3><div className="mt-3 space-y-2">{runs.map((item) => <button key={item.id} className={`w-full rounded-lg border p-3 text-left ${item.id === run?.id ? "border-lagoon bg-mist dark:bg-cyan-500/10" : "border-slate-200 dark:border-slate-700"}`} onClick={() => setSelectedId(item.id)}><div className="flex justify-between gap-3"><strong>{item.periodStart} – {item.periodEnd}</strong><Status value={item.status} /></div><p className="mt-1 text-sm text-slate-500">{currency.format(item.netPay)} · payday {item.payday}</p></button>)}{!runs.length && <p className="rounded-lg border border-dashed p-5 text-sm text-slate-500">No payroll runs yet. Complete and assign jobs, then create this week’s draft.</p>}</div><div className="mt-5 border-t pt-4 dark:border-slate-700"><p className="text-xs font-semibold uppercase text-slate-400">Legacy payouts</p><p className="mt-1 text-xs text-slate-500">Existing payout history remains available in Team and is not rewritten.</p></div></section>
      {run ? <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase text-lagoon">{run.status} payroll</p><h3 className="text-xl font-bold text-ink dark:text-white">{run.periodStart} – {run.periodEnd}</h3><p className="text-sm text-slate-500">Payday {run.payday}</p></div><div className="flex flex-wrap gap-2"><a className="text-button gap-2" href={`/api/owner/payroll/${run.id}/export.csv`}><Download size={15} />CSV</a>{run.status === "draft" && <button className="primary-button gap-2" disabled={working} onClick={() => void act(() => finalizePayrollRun(run.id), "Payroll finalized and employee statements published.")}><CheckCircle2 size={15} />Finalize payroll</button>}</div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label="Gross earnings" value={currency.format(run.grossEarnings)} /><Metric label="Additions" value={currency.format(run.totalAdditions)} /><Metric label="Deductions" value={currency.format(run.totalDeductions)} /><Metric label="Amount to record" value={currency.format(run.netPay)} /></div>
        <div className="mt-5 space-y-3">{employeeIds.map((employeeId) => { const totals = employeeTotals(run, employeeId); const employee = employees.find((item) => item.id === employeeId); const recorded = run.payments.find((item) => item.employeeId === employeeId); return <article key={employeeId} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-semibold text-ink dark:text-white">{employee?.name ?? totals.lines[0]?.employeeName ?? "Employee"}</h4><p className="text-xs text-slate-500">Gross {currency.format(totals.gross + totals.additions)} · deductions {currency.format(totals.deductions)}</p></div><strong className="text-lg text-ink dark:text-white">{currency.format(totals.net)}</strong></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="py-2">Date</th><th>Type</th><th>Description</th><th className="text-right">Amount</th></tr></thead><tbody>{totals.lines.map((line) => <tr key={line.id} className="border-t dark:border-slate-700"><td className="py-2">{line.workDate}</td><td className="capitalize">{line.lineType.replaceAll("_", " ")}</td><td>{line.customerName} · {line.description}</td><td className="text-right">{currency.format(line.amount)}</td></tr>)}{totals.adjustments.map((item) => <tr key={item.id} className="border-t dark:border-slate-700"><td className="py-2">—</td><td className="capitalize">{item.category}</td><td>{item.description}</td><td className={`text-right ${item.adjustmentType === "deduction" ? "text-rose-600" : ""}`}>{item.adjustmentType === "deduction" ? "−" : "+"}{currency.format(item.amount)}{run.status === "draft" && <button className="ml-2 text-rose-500" title="Remove adjustment" onClick={() => void act(() => deletePayrollAdjustment(run.id, item.id), "Adjustment removed.")}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div>{recorded && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Paid {recorded.paidAt.slice(0, 10)} by {recorded.paymentMethod}{recorded.reference ? ` · ${recorded.reference}` : ""}</p>}</article>; })}</div>
        {run.status === "draft" && <form className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60" onSubmit={(event) => { event.preventDefault(); void act(() => addPayrollAdjustment(run.id, { ...adjustment, amount: Number(adjustment.amount) }), "Adjustment added."); setAdjustment((current) => ({ ...current, description: "", amount: "" })); }}><h4 className="font-semibold text-ink dark:text-white">Add payroll adjustment</h4><div className="settings-grid mt-3"><label>Employee<select required value={adjustment.employeeId} onChange={(event) => setAdjustment({ ...adjustment, employeeId: event.target.value })}>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Direction<select value={adjustment.adjustmentType} onChange={(event) => setAdjustment({ ...adjustment, adjustmentType: event.target.value as "addition" | "deduction", category: event.target.value === "deduction" ? "deduction" : "bonus" })}><option value="addition">Addition</option><option value="deduction">Deduction</option></select></label><label>Category<select value={adjustment.category} onChange={(event) => setAdjustment({ ...adjustment, category: event.target.value as typeof adjustment.category })}>{(adjustment.adjustmentType === "addition" ? ["bonus", "reimbursement", "correction", "other"] : ["deduction", "correction", "other"]).map((item) => <option key={item}>{item}</option>)}</select></label><label>Amount<input required type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })} /></label><label className="sm:col-span-2">Description<input required value={adjustment.description} onChange={(event) => setAdjustment({ ...adjustment, description: event.target.value })} placeholder="Performance bonus or accountant-provided deduction" /></label></div><button className="text-button mt-3 gap-2" disabled={working}><Plus size={15} />Add adjustment</button></form>}
        {run.status === "finalized" && unpaidIds.length > 0 && <form className="mt-5 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60" onSubmit={(event) => { event.preventDefault(); const employeeId = paymentEmployee || unpaidIds[0]; void act(() => recordPayrollPayment(run.id, { employeeId, ...payment }), "Payment recorded."); }}><h4 className="font-semibold text-ink dark:text-white">Record employee payment</h4><div className="settings-grid mt-3"><label>Employee<select value={paymentEmployee || unpaidIds[0]} onChange={(event) => setPaymentEmployee(event.target.value)}>{unpaidIds.map((id) => <option key={id} value={id}>{employees.find((item) => item.id === id)?.name ?? "Employee"}</option>)}</select></label><label>Method<select value={payment.paymentMethod} onChange={(event) => setPayment({ ...payment, paymentMethod: event.target.value as "bank" | "check" })}><option value="bank">Bank payment</option><option value="check">Check</option></select></label><label>Paid date<input required type="date" value={payment.paidAt} onChange={(event) => setPayment({ ...payment, paidAt: event.target.value })} /></label><label>Reference<input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} placeholder="Optional confirmation" /></label><label className="sm:col-span-2">Note<input value={payment.note} onChange={(event) => setPayment({ ...payment, note: event.target.value })} /></label></div><button className="primary-button mt-3 gap-2" disabled={working}><Banknote size={15} />Record payment</button></form>}
      </section> : <section className="grid min-h-[360px] place-items-center rounded-lg border border-dashed p-6 text-center text-slate-500"><div><FileText className="mx-auto mb-3" /><p className="font-semibold">Create the first weekly payroll draft</p></div></section>}
    </div>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-ink dark:text-white">{value}</p>{detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}</div>; }
function Status({ value }: { value: PayrollRun["status"] }) { return <span className={`rounded-md px-2 py-1 text-xs font-semibold capitalize ${value === "paid" ? "bg-emerald-100 text-emerald-700" : value === "finalized" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{value}</span>; }
