import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, FileSignature, PenLine, RotateCcw, Send } from "lucide-react";
import { submitEmployeeContract } from "../lib/api";
import { currency } from "../lib/calculations";
import type { ContractSubmission, Customer, Job } from "../types/business";

interface ContractDraft {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceAddress: string;
  serviceDescription: string;
  frequency: string;
  price: string;
  notes: string;
}

const emptyDraft: ContractDraft = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  serviceAddress: "",
  serviceDescription: "",
  frequency: "",
  price: "",
  notes: "",
};

const contractInputClass = "mt-2 block w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3 text-base font-normal text-ink outline-none focus:border-lagoon dark:border-slate-700 dark:bg-slate-950 dark:text-white";
const contractTextareaClass = `${contractInputClass} min-h-28 resize-y`;
const contractLabelClass = "block min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200";

function agreementText(draft: ContractDraft) {
  const price = currency.format(Number(draft.price));
  const notes = draft.notes.trim() || "No additional notes.";
  return [
    "RECURRING POWER WASHING SERVICE AGREEMENT",
    "",
    `Customer: ${draft.customerName.trim()}`,
    `Service address: ${draft.serviceAddress.trim()}`,
    `Services: ${draft.serviceDescription.trim()}`,
    `Service frequency: ${draft.frequency.trim()}`,
    `Price per service: ${price}`,
    `Additional notes: ${notes}`,
    "",
    "The customer authorizes The Powerwashing Pros to provide the services listed above at the stated frequency and price. Service dates will be coordinated with the customer and may change because of weather, property access, or mutual scheduling needs. Work outside the listed service scope requires customer approval and may have an additional charge. Either party may request a change to or cancellation of future service by contacting the other party before the next scheduled visit.",
    "",
    "By signing below, the customer confirms that the information above is accurate, agrees to use an electronic signature, and asks The Powerwashing Pros to accept this recurring-service agreement. The signed agreement is submitted to the business owner for confirmation.",
  ].join("\n");
}

export function EmployeeContractFlow({
  employeeId,
  jobs,
  customers,
  onSubmitted,
}: {
  employeeId?: string;
  jobs: Job[];
  customers: Customer[];
  onSubmitted: (contract: ContractSubmission) => void;
}) {
  const [jobId, setJobId] = useState("");
  const [draft, setDraft] = useState<ContractDraft>(emptyDraft);
  const [stage, setStage] = useState<"prepare" | "sign">("prepare");
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const agreement = useMemo(() => agreementText(draft), [draft]);
  const customerMap = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);

  function chooseJob(nextJobId: string) {
    setJobId(nextJobId);
    const job = jobs.find((item) => item.id === nextJobId);
    if (!job) return;
    const customer = customerMap.get(job.customerId);
    setDraft((current) => ({
      ...current,
      customerName: customer?.name ?? current.customerName,
      customerPhone: customer?.phone ?? current.customerPhone,
      serviceAddress: job.address || customer?.address || current.serviceAddress,
      serviceDescription: job.serviceType || current.serviceDescription,
      price: String(job.price),
    }));
  }

  function update<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function generate(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSignerName(draft.customerName);
    setStage("sign");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signAndSend(event: FormEvent) {
    event.preventDefault();
    if (!signatureData) {
      setMessage("The homeowner must sign inside the signature box.");
      return;
    }
    if (!consent) {
      setMessage("The homeowner must agree to use an electronic signature.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const saved = await submitEmployeeContract({
        ...draft,
        jobId,
        relatedJob: `${jobs.find((job) => job.id === jobId)?.date ?? ""} · ${draft.customerName}`,
        price: Number(draft.price),
        agreementText: agreement,
        signerName,
        signatureData,
        electronicConsent: consent,
        employeeId,
      });
      if (!saved) throw new Error("Contract service is unavailable.");
      setMessage("Signed contract saved and sent to the owners.");
      window.setTimeout(() => onSubmitted(saved), 1400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit the signed contract.");
    } finally {
      setSaving(false);
    }
  }

  if (stage === "sign") {
    return <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase text-lagoon">Homeowner review</p><h2 className="text-2xl font-bold text-ink dark:text-white">Review and sign agreement</h2><p className="mt-1 text-sm text-slate-500">Hand the phone to the homeowner. Nothing is sent until they sign.</p></div>
        <button type="button" className="text-button shrink-0 gap-2" onClick={() => { setStage("prepare"); setSignatureData(""); setConsent(false); }}><ArrowLeft size={16} />Edit</button>
      </div>
      <form onSubmit={signAndSend} className="space-y-5">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7">
          <div className="border-b border-slate-200 pb-5 dark:border-slate-700"><p className="text-sm font-semibold text-lagoon">The Powerwashing Pros</p><h3 className="mt-1 text-xl font-bold text-ink dark:text-white">Recurring Power Washing Service Agreement</h3><p className="mt-1 text-xs text-slate-500">Prepared {new Date().toLocaleDateString()}</p></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2"><AgreementField label="Customer" value={draft.customerName} /><AgreementField label="Phone" value={draft.customerPhone || "Not provided"} /><AgreementField label="Email" value={draft.customerEmail || "Not provided"} /><AgreementField label="Service address" value={draft.serviceAddress} /><AgreementField label="Services" value={draft.serviceDescription} /><AgreementField label="Frequency" value={draft.frequency} /><AgreementField label="Price per service" value={currency.format(Number(draft.price))} /></div>
          {draft.notes && <div className="mt-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs font-semibold uppercase text-slate-500">Additional notes</p><p className="mt-1 whitespace-pre-wrap text-sm">{draft.notes}</p></div>}
          <div className="mt-6 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300"><p>The customer authorizes The Powerwashing Pros to provide the services listed above at the stated frequency and price. Service dates will be coordinated with the customer and may change because of weather, property access, or mutual scheduling needs.</p><p>Work outside the listed service scope requires customer approval and may have an additional charge. Either party may request a change to or cancellation of future service by contacting the other party before the next scheduled visit.</p><p>By signing below, the customer confirms that the information above is accurate and asks The Powerwashing Pros to accept this recurring-service agreement. The signed agreement is submitted to the business owner for confirmation.</p></div>
        </article>
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center gap-2"><PenLine className="text-lagoon" size={19} /><h3 className="font-semibold text-ink dark:text-white">Customer signature</h3></div>
          <label className={`${contractLabelClass} mt-4`}>Full legal name<input className={contractInputClass} required autoComplete="name" value={signerName} onChange={(event) => setSignerName(event.target.value)} /></label>
          <div className="mt-4"><SignaturePad onChange={setSignatureData} /></div>
          <label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><input className="mt-1 h-4 w-4 shrink-0" required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to use this electronic signature and confirm that it represents my signature on this agreement.</span></label>
          {message && <p className={`mt-4 rounded-lg p-3 text-sm font-semibold ${message.startsWith("Signed") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message}</p>}
          <button className="primary-button mt-5 w-full gap-2" disabled={saving}><Send size={16} />{saving ? "Saving signed contract..." : "Sign and send to owners"}</button>
        </section>
      </form>
    </div>;
  }

  return <div className="mx-auto max-w-3xl">
    <div><p className="text-xs font-semibold uppercase text-lagoon">Prepare after the job</p><h2 className="text-2xl font-bold text-ink dark:text-white">Generate a customer contract</h2><p className="mt-1 text-sm text-slate-500">Enter the agreement details first. The next screen is for the homeowner to review and sign.</p></div>
    <form className="mt-5 rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" onSubmit={generate}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${contractLabelClass} sm:col-span-2`}>Assigned job<select className={`${contractInputClass} truncate`} required value={jobId} onChange={(event) => chooseJob(event.target.value)}><option value="">Choose the job this contract belongs to</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.date} · {customerMap.get(job.customerId)?.name ?? "Customer"} · {currency.format(job.price)}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">Linking the signed agreement to the job makes its 10% contract bonus available in Earnings.</span></label>
        <label className={contractLabelClass}>Customer name<input className={contractInputClass} required autoComplete="name" value={draft.customerName} onChange={(event) => update("customerName", event.target.value)} /></label>
        <label className={contractLabelClass}>Customer phone<input className={contractInputClass} type="tel" autoComplete="tel" value={draft.customerPhone} onChange={(event) => update("customerPhone", event.target.value)} /></label>
        <label className={contractLabelClass}>Customer email<input className={contractInputClass} type="email" autoComplete="email" value={draft.customerEmail} onChange={(event) => update("customerEmail", event.target.value)} /></label>
        <label className={contractLabelClass}>Price per service<input className={contractInputClass} required inputMode="decimal" type="number" min="0" step="0.01" value={draft.price} onChange={(event) => update("price", event.target.value)} placeholder="175.00" /></label>
        <label className={`${contractLabelClass} sm:col-span-2`}>Service address<input className={contractInputClass} required autoComplete="street-address" value={draft.serviceAddress} onChange={(event) => update("serviceAddress", event.target.value)} /></label>
        <label className={`${contractLabelClass} sm:col-span-2`}>Services included<input className={contractInputClass} required value={draft.serviceDescription} onChange={(event) => update("serviceDescription", event.target.value)} placeholder="Driveway, front walkway, and sidewalk" /></label>
        <label className={`${contractLabelClass} sm:col-span-2`}>Frequency<input className={contractInputClass} required value={draft.frequency} onChange={(event) => update("frequency", event.target.value)} placeholder="Every 6 months" /><span className="mt-1 block text-xs font-normal text-slate-500">Type the frequency exactly as agreed.</span></label>
        <label className={`${contractLabelClass} sm:col-span-2`}>Additional notes<textarea className={contractTextareaClass} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Access details or terms discussed with the homeowner" /></label>
      </div>
      <button className="primary-button mt-5 w-full gap-2"><FileSignature size={16} />Generate contract for homeowner</button>
    </form>
  </div>;
}

function AgreementField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-ink dark:text-white">{value}</p></div>;
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.floor(176 * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(scale, scale);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#132235";
  }, []);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = point(event);
    context.beginPath();
    context.moveTo(next.x, next.y);
    context.lineTo(next.x + 0.1, next.y + 0.1);
    context.stroke();
    drawing.current = true;
    setHasInk(true);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange("");
  }

  return <div>
    <div className="overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-white dark:border-slate-600"><canvas ref={canvasRef} className="block h-44 w-full touch-none" aria-label="Electronic signature pad" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} /></div>
    <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Sign with a finger or mouse inside the box.</p><button type="button" className="text-button shrink-0 gap-2" onClick={clear} disabled={!hasInk}><RotateCcw size={14} />Clear</button></div>
  </div>;
}
