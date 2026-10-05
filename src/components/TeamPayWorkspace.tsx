import { useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, ClipboardCheck, RefreshCw, Users, WalletCards } from "lucide-react";
import type { OwnerOperationsSnapshot } from "../lib/api";
import { payoutCurrency as currency } from "../lib/calculations";
import { salesRequest } from "../lib/sales";
import type { OwnerSales } from "../lib/sales";
import type { Job } from "../types/business";
import { OwnerTeamView } from "./OwnerOperations";
import { OwnerSalesPanel } from "./OwnerSalesPanel";
import { OwnerReimbursements } from "./Reimbursements";
import { PayrollCenter } from "./PayrollCenter";

export type TeamPaySection = "people" | "assignments" | "review" | "payments";
const views = [
  { id: "people", label: "People", icon: Users },
  { id: "assignments", label: "Assignments", icon: BriefcaseBusiness },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "payments", label: "Payments", icon: WalletCards },
] as const;

export function TeamPayWorkspace({ operations, jobs, customerNames, section, onSection, onRefresh }: {
  operations: OwnerOperationsSnapshot; jobs: Job[]; customerNames: Map<string, string>;
  section: TeamPaySection; onSection: (section: TeamPaySection) => void; onRefresh: () => Promise<void>;
}) {
  const [sales, setSales] = useState<OwnerSales>();
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [paymentRevision, setPaymentRevision] = useState(0);
  const loadSales = useCallback(async () => { setSales(await salesRequest<OwnerSales>("/api/owner/sales")); }, []);
  useEffect(() => { let active = true; void salesRequest<OwnerSales>("/api/owner/sales").then(data => { if (active) setSales(data); }).catch(nextError => { if (active) setError(nextError instanceof Error ? nextError.message : "Unable to load sales accounts."); }); return () => { active = false; }; }, []);
  async function refresh() {
    setRefreshing(true); setError("");
    try { await onRefresh(); await loadSales(); setPaymentRevision(value => value + 1); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to refresh team and pay."); throw nextError; }
    finally { setRefreshing(false); }
  }
  const pending = operations.earnings.filter(item => item.status === "pending").length
    + (operations.reimbursements ?? []).filter(item => item.status === "pending").length
    + (sales?.commissions ?? []).filter(item => item.status === "pending").length;
  const approved = operations.earnings.filter(item => item.status === "approved").reduce((sum, item) => sum + item.totalEarnings, 0)
    + (operations.reimbursements ?? []).filter(item => item.status === "approved").reduce((sum, item) => sum + item.amount, 0)
    + (sales?.commissions ?? []).filter(item => item.status === "approved").reduce((sum, item) => sum + item.amount, 0);
  const activePeople = operations.employees.filter(item => item.active).length + (sales?.salesmen ?? []).filter(item => item.active).length;
  return <div className="mx-auto min-w-0 max-w-6xl space-y-5">
    <header className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-ink dark:text-white">Team &amp; Pay</h2><button type="button" className="icon-button shrink-0" title="Refresh team and pay" aria-label="Refresh team and pay" disabled={refreshing} onClick={() => { void refresh().catch(() => undefined); }}><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button></header>
    <dl className="grid min-w-0 grid-cols-3 gap-3 border-y border-slate-200 py-4 dark:border-slate-800">
      <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Active people</dt><dd className="mt-1 break-words text-lg font-bold">{activePeople}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Awaiting review</dt><dd className="mt-1 text-lg font-bold">{pending}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Approved &amp; unpaid</dt><dd className="mt-1 break-all text-lg font-bold">{currency.format(approved)}</dd></div>
    </dl>
    <div role="tablist" aria-label="Team and pay views" className="team-pay-tabs">{views.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" id={`team-pay-tab-${id}`} role="tab" aria-selected={section === id} aria-controls={`team-pay-panel-${id}`} tabIndex={section === id ? 0 : -1} onClick={() => onSection(id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : -1;
      if (next < 0) return; event.preventDefault(); onSection(views[next].id); document.getElementById(`team-pay-tab-${views[next].id}`)?.focus();
    }}><Icon size={17} className="shrink-0" /><span>{label}</span>{id === "review" && pending > 0 && <span className="team-pay-count">{pending}</span>}</button>)}</div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}
    <div role="tabpanel" id={`team-pay-panel-${section}`} aria-labelledby={`team-pay-tab-${section}`} className="min-w-0">
      {section === "people" && <h3 className="mb-4 font-semibold">Employee accounts</h3>}
      {section !== "payments" && <OwnerTeamView section={section} operations={operations} jobs={jobs} customerNames={customerNames} onRefresh={refresh} />}
      {section === "review" && <OwnerReimbursements requests={operations.reimbursements} earnings={[]} onRefresh={refresh} showPayments={false} />}
      {(section === "people" || section === "review") && <OwnerSalesPanel section={section} data={sales} onRefresh={refresh} />}
      {section === "payments" && <PayrollCenter key={paymentRevision} employees={operations.employees} onChanged={async () => { await onRefresh(); await loadSales(); }} />}
    </div>
  </div>;
}
