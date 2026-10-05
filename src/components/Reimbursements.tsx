import { useEffect, useRef, useState } from "react";
import { Check, Plus, Receipt, Save, Trash2, X } from "lucide-react";
import { createPayout, reviewReimbursement, submitReimbursement } from "../lib/api";
import { isoToday } from "../lib/calculations";
import type { EarningSubmission, ReimbursementItem, ReimbursementRequest } from "../types/business";

import { reimbursementPayload } from "../lib/reimbursements";
import type { ReimbursementDraft } from "../lib/reimbursements";
const inputClass = "mt-2 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3 text-base font-normal text-ink dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const currency = new Intl.NumberFormat("en-US", { style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2 });
export function ReimbursementEditor({ items, onChange }: { items: ReimbursementDraft[]; onChange: (items: ReimbursementDraft[]) => void }) {
  const total = items.reduce((sum,item) => sum + (Number(item.cost) || 0),0);
  function change(index: number, key: keyof ReimbursementDraft, value: string) { onChange(items.map((item,i) => i === index ? { ...item,[key]:value } : item)); }
  return <fieldset className="min-w-0 space-y-3"><legend className="text-sm font-semibold">Reimbursements</legend>
    {items.map((item,index) => <div key={index} className="grid min-w-0 grid-cols-[minmax(0,1fr)_40px] gap-2 sm:grid-cols-[minmax(0,1fr)_130px_40px]">
      <label className="block min-w-0 text-sm">Item<input className={inputClass} aria-label={`Reimbursement item ${index + 1}`} required maxLength={200} value={item.name} onChange={event => change(index,"name",event.target.value)} placeholder="Gas, supplies, insurance" /></label>
      <button type="button" className="icon-button mt-7 shrink-0 sm:order-last" title="Remove item" aria-label={`Remove reimbursement item ${index + 1}`} onClick={() => onChange(items.filter((_,i) => i !== index))}><Trash2 size={17} /></button>
      <label className="col-span-2 block min-w-0 text-sm sm:col-span-1">Cost<input className={inputClass} aria-label={`Reimbursement cost ${index + 1}`} required type="number" min="0.01" max="999999.99" step="0.01" inputMode="decimal" value={item.cost} onChange={event => change(index,"cost",event.target.value)} placeholder="0.00" /></label>
    </div>)}
    <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className="text-button gap-2" disabled={items.length >= 30} onClick={() => onChange([...items,{ name:"",cost:"" }])}><Plus size={16} />Add item</button><strong className="text-sm">Total: {currency.format(total)}</strong></div>
  </fieldset>;
}
export function ReimbursementDetails({ items }: { items: ReimbursementItem[] }) {
  return <ul className="mt-2 space-y-1 text-sm">{items.map((item,index) => <li key={index} className="flex min-w-0 justify-between gap-3"><span className="break-words">{item.name}</span><span className="shrink-0 font-semibold">{currency.format(item.cost)}</span></li>)}</ul>;
}

export function ReimbursementForm({ preview, onClose, onSaved }: { preview?: boolean; onClose: () => void; onSaved: (item: ReimbursementRequest) => void }) {
  const [items,setItems] = useState<ReimbursementDraft[]>([{ name:"",cost:"" }]);
  const [date,setDate] = useState(isoToday());
  const [notes,setNotes] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [attempt,setAttempt] = useState<Parameters<typeof submitReimbursement>[0] | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const dialog = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  },[]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const payload = attempt ?? { requestId,expenseDate:date,items:reimbursementPayload(items),notes };
      if (!payload.items.length) throw new Error("Add at least one reimbursement item.");
      setAttempt(payload);
      const saved = preview ? { id:requestId,employeeId:"preview-employee",employeeName:"Sample Employee",expenseDate:date,items:payload.items,amount:payload.items.reduce((sum,item) => sum + item.cost,0),notes,status:"pending" as const,ownerNote:"",createdAt:new Date().toISOString() } : await submitReimbursement(payload);
      if (!saved) throw new Error("The reimbursement could not be saved. Retry this request.");
      onSaved(saved);
    } catch(nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to submit reimbursement."); } finally { setBusy(false); }
  }
  return <div className="sales-modal" style={{ zIndex:90 }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form ref={dialog} role="dialog" aria-modal="true" aria-label="Request reimbursement" className="sales-dialog" onSubmit={submit} onKeyDown={event => {
      if (event.key === "Escape" && !busy) onClose();
      if (event.key !== "Tab") return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0],last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <div className="flex items-start justify-between gap-3"><h2 className="text-xl font-bold">Request reimbursement</h2><button type="button" className="icon-button" aria-label="Close reimbursement" title="Close" disabled={busy} onClick={onClose}><X size={18} /></button></div>
      <fieldset className="mt-5 min-w-0 space-y-5" disabled={busy || Boolean(attempt)}><label className="block min-w-0 text-sm font-semibold">Expense date<input className={`${inputClass} reimbursement-date`} type="date" required value={date} onChange={event => setDate(event.target.value)} /></label><ReimbursementEditor items={items} onChange={setItems} /><label className="block text-sm font-semibold">Notes<textarea className={`${inputClass} min-h-24`} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} /></label></fieldset>
      {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}
      <button className="primary-button mt-5 w-full gap-2" disabled={busy}><Save size={17} />{busy ? "Submitting..." : attempt ? "Retry reimbursement" : "Submit reimbursement"}</button>
    </form>
  </div>;
}
export function ReimbursementHistory({ requests }: { requests: ReimbursementRequest[] }) {
  return <section className="min-w-0 space-y-3"><h3 className="text-xl font-bold">Your reimbursements</h3>{!requests.length && <p className="text-sm text-slate-500">No reimbursement requests yet.</p>}{requests.map(item => <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div className="flex flex-wrap justify-between gap-2"><strong>{item.expenseDate} · {currency.format(item.amount)}</strong><span className="text-sm font-semibold capitalize">{item.status}</span></div><ReimbursementDetails items={item.items} />{item.notes && <p className="mt-2 break-words text-sm text-slate-500">{item.notes}</p>}{item.ownerNote && <p className="mt-2 text-sm text-rose-600">Owner note: {item.ownerNote}</p>}</article>)}</section>;
}
export function OwnerReimbursements({ requests = [], earnings, onRefresh }: { requests?: ReimbursementRequest[]; earnings: EarningSubmission[]; onRefresh: () => Promise<void> }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(""); try { await action(); await onRefresh(); } catch(nextError) { setError(nextError instanceof Error ? nextError.message : "Unable to update reimbursement."); } finally { setBusy(false); } }
  const pending = requests.filter(item => item.status === "pending"), approved = requests.filter(item => item.status === "approved");
  const jobRequests = earnings.filter(item => item.status === "pending" && item.gasCost > 0);
  return <section className="min-w-0 space-y-4 border-t border-slate-200 py-5 dark:border-slate-700"><div className="flex items-center gap-2"><Receipt size={20} /><h2 className="text-xl font-bold">Reimbursements</h2></div>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {jobRequests.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"><strong>{item.employeeName} · {item.customerName}</strong><ReimbursementDetails items={item.reimbursementItems ?? [{ name:"Gas",cost:item.gasCost }]} /><p className="mt-2 text-xs text-slate-500">Included in this job's earnings approval.</p></article>)}
    <h3 className="font-semibold">Not tied to a job · {pending.length} pending</h3>
    {pending.map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700"><strong>{item.employeeName} · {item.expenseDate}</strong><ReimbursementDetails items={item.items} />{item.notes && <p className="mt-2 break-words text-sm">{item.notes}</p>}<div className="mt-3 flex flex-wrap gap-2"><button className="text-button gap-2" disabled={busy} onClick={() => void run(() => reviewReimbursement(item.id,"rejected","Please correct and submit a new request."))}><X size={16} />Reject</button><button className="primary-button gap-2" disabled={busy} onClick={() => void run(() => reviewReimbursement(item.id,"approved"))}><Check size={16} />Approve</button></div></article>)}
    <h3 className="font-semibold">Approved reimbursements · {currency.format(approved.reduce((sum,item) => sum + item.amount,0))}</h3>
    {[...new Set(approved.map(item => item.employeeId))].map(id => { const items = approved.filter(item => item.employeeId === id); return <div key={id} className="flex flex-wrap items-center justify-between gap-3"><strong>{items[0].employeeName} · {currency.format(items.reduce((sum,item) => sum + item.amount,0))}</strong><button className="text-button gap-2" disabled={busy} onClick={() => void run(() => createPayout([],items.map(item => item.id)))}><Check size={16} />Mark reimbursement paid</button></div>; })}
    <details><summary className="cursor-pointer text-sm font-semibold">Request history</summary><div className="mt-3 space-y-3">{requests.filter(item => item.status !== "pending").map(item => <article key={item.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><strong className="text-sm">{item.employeeName} · {item.expenseDate} · {item.status}</strong><ReimbursementDetails items={item.items} /></article>)}</div></details>
  </section>;
}
