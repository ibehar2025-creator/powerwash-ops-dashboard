import type { ReactNode } from "react";
import { ClipboardCheck, ClipboardList, FileSignature } from "lucide-react";
import type { OwnerOperationsSnapshot } from "../lib/api";
import type { ServicePlan } from "../types/business";
import { OwnerContractsView } from "./OwnerOperations";

export type RecurringSection = "plans" | "review" | "agreements";
const views = [
  { id: "plans", label: "Plans", icon: ClipboardList },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "agreements", label: "Agreements", icon: FileSignature },
] as const;

export function RecurringWorkspace({ operations, plans, section, onSection, onRefresh, selectedContractId, onClearContract, onOpenPlan, children }: {
  operations: OwnerOperationsSnapshot; plans: ServicePlan[]; section: RecurringSection;
  onSection: (section: RecurringSection) => void; onRefresh: () => Promise<void>;
  selectedContractId: string; onClearContract: () => void; onOpenPlan: (id: string) => void; children: ReactNode;
}) {
  const pending = operations.contracts.filter(item => item.status === "pending").length;
  const approved = operations.contracts.filter(item => item.status === "approved").length;
  return <div className="mx-auto min-w-0 max-w-6xl space-y-5">
    <h2 className="text-xl font-bold text-ink dark:text-white">Plans &amp; Contracts</h2>
    <dl className="grid min-w-0 grid-cols-3 gap-3 border-y border-slate-200 py-4 dark:border-slate-800">
      <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Service plans</dt><dd className="mt-1 text-lg font-bold">{plans.length}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Awaiting review</dt><dd className="mt-1 text-lg font-bold">{pending}</dd></div>
      <div className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">Approved agreements</dt><dd className="mt-1 text-lg font-bold">{approved}</dd></div>
    </dl>
    <div role="tablist" aria-label="Plans and contracts views" className="recurring-tabs">{views.map(({id,label,icon:Icon},index) => <button type="button" key={id} id={`recurring-tab-${id}`} role="tab" aria-controls={`recurring-panel-${id}`} aria-selected={section === id} tabIndex={section === id ? 0 : -1} onClick={() => onSection(id)} onKeyDown={event => {
      const next = event.key === "ArrowRight" ? (index + 1) % views.length : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : -1;
      if (next < 0) return; event.preventDefault(); onSection(views[next].id); document.getElementById(`recurring-tab-${views[next].id}`)?.focus();
    }}><Icon size={17} className="shrink-0" /><span>{label}</span>{id === "review" && pending > 0 && <span className="team-pay-count">{pending}</span>}</button>)}</div>
    <div role="tabpanel" id={`recurring-panel-${section}`} aria-labelledby={`recurring-tab-${section}`} className="min-w-0">
      {section === "plans" ? children : <OwnerContractsView operations={operations} section={section} onRefresh={onRefresh} plans={plans} selectedContractId={selectedContractId} onClearContract={onClearContract} onOpenPlan={onOpenPlan} />}
    </div>
  </div>;
}
