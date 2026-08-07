import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { BriefcaseBusiness, Check, Mail, Pencil, Phone, Plus, Search, Sparkles, Users, X } from "lucide-react";
import { currency } from "../lib/calculations";
import type { Customer, Job, Lead, LeadStatus } from "../types/business";

export type CreateKind = "customer" | "job" | "lead";

const jobStatuses: Job["status"][] = ["scheduled", "in progress", "completed", "canceled", "past due"];
const leadStatuses: LeadStatus[] = ["new", "contacted", "quoted", "scheduled", "won", "lost"];

function ModalShell({ title, kicker, children, onClose }: { title: string; kicker: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-3 sm:p-4"><div role="dialog" aria-modal="true" aria-label={title} className="max-h-[94vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-lagoon dark:text-cyan-300">{kicker}</p><h2 className="text-xl font-bold text-ink dark:text-white">{title}</h2></div><button type="button" className="icon-button shrink-0" onClick={onClose} aria-label="Close"><X size={17} /></button></div>{children}</div></div>;
}

function FormActions({ saving, onClose }: { saving: boolean; onClose: () => void }) {
  return <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" className="text-button" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="primary-button gap-2" disabled={saving}><Check size={16} />{saving ? "Saving..." : "Save"}</button></div>;
}

export function CreateRecordModal({ kind, customers, currentDate, onClose, onCreateCustomer, onCreateJob, onCreateLead }: {
  kind: CreateKind;
  customers: Customer[];
  currentDate: string;
  onClose: () => void;
  onCreateCustomer: (draft: Omit<Customer, "id" | "insights" | "subscribedPlanId" | "websiteEditedFields">) => Promise<void>;
  onCreateJob: (draft: Pick<Job, "date" | "time" | "customerId" | "address" | "serviceType" | "status" | "price" | "notes">) => Promise<void>;
  onCreateLead: (draft: Omit<Lead, "id" | "source" | "websiteEditedFields">) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [job, setJob] = useState({ date: currentDate, time: "09:00", customerId: customers[0]?.id ?? "", address: customers[0]?.address ?? "", serviceType: "", status: "scheduled" as Job["status"], price: 0, notes: "" });
  const [lead, setLead] = useState({ name: "", contact: "", address: "", status: "new" as LeadStatus, estimatedValue: 0, followUpDate: "", notes: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (kind === "customer") await onCreateCustomer(customer);
      if (kind === "job") await onCreateJob(job);
      if (kind === "lead") await onCreateLead(lead);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this record.");
      setSaving(false);
    }
  }

  const title = kind === "customer" ? "New customer" : kind === "job" ? "New job" : "New lead";
  return <ModalShell title={title} kicker="Create record" onClose={onClose}><form onSubmit={submit}><div className="settings-grid mt-5">{kind === "customer" && <><label>Name<input required value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label><label>Phone<input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label><label>Email<input type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label><label>Address<input value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label><label className="sm:col-span-2">Notes<textarea value={customer.notes} onChange={(event) => setCustomer({ ...customer, notes: event.target.value })} /></label></>}{kind === "job" && <><label>Customer<select required value={job.customerId} onChange={(event) => { const selected = customers.find((item) => item.id === event.target.value); setJob({ ...job, customerId: event.target.value, address: selected?.address || job.address }); }}>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Status<select value={job.status} onChange={(event) => setJob({ ...job, status: event.target.value as Job["status"] })}>{jobStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Date<input type="date" required value={job.date} onChange={(event) => setJob({ ...job, date: event.target.value })} /></label><label>Time<input type="time" required value={job.time} onChange={(event) => setJob({ ...job, time: event.target.value })} /></label><label>Service<input required value={job.serviceType} onChange={(event) => setJob({ ...job, serviceType: event.target.value })} /></label><label>Price<input type="number" min="0" step="0.01" value={job.price} onChange={(event) => setJob({ ...job, price: Number(event.target.value) || 0 })} /></label><label className="sm:col-span-2">Address<input required value={job.address} onChange={(event) => setJob({ ...job, address: event.target.value })} /></label><label className="sm:col-span-2">Notes<textarea value={job.notes} onChange={(event) => setJob({ ...job, notes: event.target.value })} /></label></>}{kind === "lead" && <><label>Name<input required value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} /></label><label>Status<select value={lead.status} onChange={(event) => setLead({ ...lead, status: event.target.value as LeadStatus })}>{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Contact information<input value={lead.contact} onChange={(event) => setLead({ ...lead, contact: event.target.value })} /></label><label>Estimated value<input type="number" min="0" step="0.01" value={lead.estimatedValue} onChange={(event) => setLead({ ...lead, estimatedValue: Number(event.target.value) || 0 })} /></label><label>Follow-up date<input type="date" value={lead.followUpDate} onChange={(event) => setLead({ ...lead, followUpDate: event.target.value })} /></label><label>Address<input value={lead.address} onChange={(event) => setLead({ ...lead, address: event.target.value })} /></label><label className="sm:col-span-2">Notes<textarea value={lead.notes} onChange={(event) => setLead({ ...lead, notes: event.target.value })} /></label></>}</div>{error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>}<FormActions saving={saving} onClose={onClose} /></form></ModalShell>;
}

export function CustomerEditorModal({ customer, onClose, onSave }: { customer: Customer; onClose: () => void; onSave: (id: string, patch: Partial<Customer>) => Promise<void> }) {
  const [draft, setDraft] = useState(customer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const fields: Array<keyof Customer> = ["name", "phone", "email", "address", "notes"];
    const changes = Object.fromEntries(fields.filter((field) => draft[field] !== customer[field]).map((field) => [field, draft[field]]));
    try { if (Object.keys(changes).length) await onSave(customer.id, changes); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save customer."); setSaving(false); }
  }
  return <ModalShell title={draft.name} kicker="Edit customer" onClose={onClose}><form onSubmit={submit}><div className="settings-grid mt-5"><label>Name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Phone<input value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label>Address<input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label><label className="sm:col-span-2">Notes<textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label></div>{error && <p className="mt-4 text-sm text-rose-600">{error}</p>}<FormActions saving={saving} onClose={onClose} /></form></ModalShell>;
}

export function GlobalSearch({ customers, jobs, leads, onCustomer, onJob, onLead, onNew }: { customers: Customer[]; jobs: Job[]; leads: Lead[]; onCustomer: (customer: Customer) => void; onJob: (job: Job) => void; onLead: (lead: Lead) => void; onNew: (kind: CreateKind) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | CreateKind>("all");
  const [newOpen, setNewOpen] = useState(false);
  const normalized = query.trim().toLowerCase();
  const customerNames = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers]);
  const results = useMemo(() => {
    if (!normalized) return [];
    const customerResults = kind === "all" || kind === "customer" ? customers.filter((item) => [item.name, item.address, item.phone, item.email, item.notes].join(" ").toLowerCase().includes(normalized)).slice(0, 5).map((item) => ({ type: "customer" as const, item, title: item.name, detail: item.address })) : [];
    const jobResults = kind === "all" || kind === "job" ? jobs.filter((item) => [customerNames.get(item.customerId) ?? "Unknown customer", item.address, item.serviceType, item.date, item.status].join(" ").toLowerCase().includes(normalized)).slice(0, 5).map((item) => ({ type: "job" as const, item, title: customerNames.get(item.customerId) ?? "Unknown customer", detail: `${item.date} · ${item.serviceType}` })) : [];
    const leadResults = kind === "all" || kind === "lead" ? leads.filter((item) => [item.name, item.contact, item.address, item.notes, item.status].join(" ").toLowerCase().includes(normalized)).slice(0, 5).map((item) => ({ type: "lead" as const, item, title: item.name, detail: `${item.status} · ${item.address}` })) : [];
    return [...customerResults, ...jobResults, ...leadResults].slice(0, 10);
  }, [customerNames, customers, jobs, kind, leads, normalized]);
  function choose(result: (typeof results)[number]) { setQuery(""); if (result.type === "customer") onCustomer(result.item); if (result.type === "job") onJob(result.item); if (result.type === "lead") onLead(result.item); }
  return <div className="relative border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"><div className="mx-auto flex max-w-[1500px] gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers, jobs, addresses, or leads" /></div><select aria-label="Search type" className="hidden h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 sm:block" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="all">All</option><option value="customer">Customers</option><option value="job">Jobs</option><option value="lead">Leads</option></select><div className="relative"><button type="button" className="primary-button h-10 gap-2" aria-label="Create new record" title="Create new record" onClick={() => { setQuery(""); setNewOpen(!newOpen); }}><Plus size={16} /><span className="hidden sm:inline">New</span></button>{newOpen && <div className="absolute right-0 top-12 z-40 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-700 dark:bg-slate-900">{(["customer", "job", "lead"] as CreateKind[]).map((item) => <button key={item} type="button" className="nav-item capitalize" onClick={() => { setNewOpen(false); onNew(item); }}><Plus size={15} />{item}</button>)}</div>}</div></div>{normalized && <div className="absolute left-4 right-4 top-[62px] z-30 mx-auto max-h-80 max-w-[1500px] overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-soft dark:border-slate-700 dark:bg-slate-900">{results.map((result) => <button key={`${result.type}-${result.item.id}`} type="button" className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => choose(result)}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mist text-lagoon">{result.type === "customer" ? <Users size={17} /> : result.type === "job" ? <BriefcaseBusiness size={17} /> : <Sparkles size={17} />}</span><span className="min-w-0"><strong className="block truncate text-sm text-ink dark:text-white">{result.title}</strong><span className="block truncate text-xs text-slate-500">{result.detail}</span></span></button>)}{results.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No matching records</p>}</div>}</div>;
}

export function CustomerProfile({ customer, jobs, onClose, onEditCustomer, onEditJob }: { customer: Customer; jobs: Job[]; onClose: () => void; onEditCustomer: () => void; onEditJob: (job: Job) => void }) {
  const customerJobs = jobs.filter((job) => job.customerId === customer.id).sort((a, b) => b.date.localeCompare(a.date));
  const callable = customer.phone.replace(/\D/g, "").length >= 7;
  const emailable = customer.email.includes("@");
  return <div className="fixed inset-0 z-50 bg-ink/45"><button className="absolute inset-0" aria-label="Close customer profile" onClick={onClose} /><aside className="absolute bottom-0 right-0 top-0 w-full max-w-xl overflow-auto bg-white p-5 shadow-soft dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-lagoon">Customer profile</p><h2 className="text-2xl font-bold text-ink dark:text-white">{customer.name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="detail-row"><span>Phone</span><strong>{customer.phone || "Not listed"}</strong></div><div className="detail-row"><span>Email</span><strong>{customer.email || "Not listed"}</strong></div><div className="detail-row sm:col-span-2"><span>Address</span><strong>{customer.address || "Not listed"}</strong></div><div className="detail-row sm:col-span-2"><span>Notes</span><strong>{customer.notes || "No notes"}</strong></div></div><div className="mt-4 flex flex-wrap gap-2">{callable && <a className="text-button gap-2" href={`tel:${customer.phone}`}><Phone size={15} />Call</a>}{emailable && <a className="text-button gap-2" href={`mailto:${customer.email}`}><Mail size={15} />Email</a>}<button className="primary-button gap-2" onClick={onEditCustomer}><Pencil size={15} />Edit customer</button></div><div className="mt-7"><div className="flex items-center justify-between"><h3 className="font-semibold text-ink dark:text-white">Job history</h3><span className="text-xs text-slate-500">{customerJobs.length} jobs</span></div><div className="mt-3 space-y-2">{customerJobs.map((job) => <button key={job.id} className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-lagoon dark:border-slate-700" onClick={() => onEditJob(job)}><span><strong className="block text-sm text-ink dark:text-white">{job.serviceType}</strong><span className="mt-1 block text-xs text-slate-500">{job.date} at {job.time} · {job.address}</span></span><span className="shrink-0 text-sm font-semibold">{currency.format(job.price)}</span></button>)}{customerJobs.length === 0 && <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">No jobs recorded.</p>}</div></div></aside></div>;
}
