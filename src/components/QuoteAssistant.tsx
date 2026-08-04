import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, ImagePlus, LoaderCircle, MessageCircle, Send, Sparkles, X } from "lucide-react";
import { askAssistant, createPublicLead, type AssistantImage, type AssistantMessage } from "../lib/api";

type ChatMessage = AssistantMessage & { id: string };
type AttachedImage = AssistantImage & { name: string; preview: string };
type Mode = "chat" | "quote";

const services = [
  { label: "Driveway", value: 140 },
  { label: "Sidewalks or walkway", value: 135 },
  { label: "Patio or pool area", value: 175 },
  { label: "Driveway and sidewalks", value: 225 },
  { label: "Exterior walls", value: 275 },
  { label: "Roof cleaning", value: 325 },
  { label: "Full property", value: 375 },
  { label: "Something else", value: 200 },
];

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "model",
  text: "Hi, I am The Powerwashing Pros assistant. Ask me a question or send an address and photo for a preliminary estimate.",
};

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read that image."));
    image.src = url;
  });
}

async function prepareImage(file: File): Promise<AttachedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Choose a photo from your camera or photo library.");
  if (file.size > 12 * 1024 * 1024) throw new Error("That photo is too large. Choose one under 12 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.78);
    return {
      data: preview.split(",")[1],
      mimeType: "image/jpeg",
      name: file.name,
      preview,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function PhotoPicker({ image, onChange, disabled }: { image: AttachedImage | null; onChange: (image: AttachedImage | null) => void; disabled?: boolean }) {
  const [error, setError] = useState("");
  return (
    <div>
      <input
        id="quote-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError("");
          void prepareImage(file).then(onChange).catch((photoError) => setError(photoError instanceof Error ? photoError.message : "Unable to add that photo."));
        }}
      />
      {image ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
          <img src={image.preview} alt="Property preview" className="h-14 w-14 rounded-md object-cover" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{image.name}</p><p className="text-xs text-emerald-700">Ready for review</p></div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-white" aria-label="Remove photo" onClick={() => onChange(null)}><X size={16} /></button>
        </div>
      ) : (
        <label htmlFor="quote-photo" className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-teal-500 hover:text-teal-700">
          <Camera size={18} /> Take or upload a photo
        </label>
      )}
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function ChatView({ onQuote }: { onQuote: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text = draft) {
    const cleanText = text.trim();
    if ((!cleanText && !image) || sending) return;
    const userText = cleanText || "Please review this property photo for pressure washing.";
    const priorHistory = messages.map(({ role, text: messageText }) => ({ role, text: messageText }));
    const userMessage: ChatMessage = { id: messageId(), role: "user", text: image ? `${userText}\n[Property photo attached]` : userText };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setSending(true);
    setError("");
    try {
      const response = await askAssistant(userText, priorHistory, image ? { data: image.data, mimeType: image.mimeType } : undefined);
      if (!response) throw new Error("The assistant is temporarily unavailable.");
      setMessages((current) => [...current, { id: messageId(), role: "model", text: response.reply }]);
      setImage(null);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[86%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-5 ${message.role === "user" ? "bg-teal-700 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{message.text}</p>
          </div>
        ))}
        {sending && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} />Thinking...</div></div>}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-200 bg-white p-3">
        {messages.length === 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={onQuote} className="rounded-md bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-800">Get estimate</button>
            <button type="button" onClick={() => void send("What services do you offer?")} className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">Services</button>
            <button type="button" onClick={() => void send("How should I prepare for service?")} className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">How to prepare</button>
          </div>
        )}
        {image && <div className="mb-2"><PhotoPicker image={image} onChange={setImage} disabled={sending} /></div>}
        <div className="flex items-end gap-2">
          {!image && <label htmlFor="chat-photo" className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-slate-200 text-slate-600 hover:border-teal-500 hover:text-teal-700" title="Attach property photo"><ImagePlus size={18} /><input id="chat-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={sending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void prepareImage(file).then(setImage).catch((photoError) => setError(photoError instanceof Error ? photoError.message : "Unable to add that photo.")); }} /></label>}
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} placeholder="Ask a question or enter an address" className="max-h-24 min-h-10 min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-teal-600" />
          <button type="button" onClick={() => void send()} disabled={sending || (!draft.trim() && !image)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-700 text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send size={17} /></button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <p className="mt-2 text-center text-[11px] text-slate-400">Preliminary guidance only. Final pricing is confirmed by the team.</p>
      </div>
    </div>
  );
}

function QuoteView({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [service, setService] = useState(services[0].label);
  const [details, setDetails] = useState("");
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !contact.trim() || !address.trim()) {
      setError("Enter your name, phone or email, and property address.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const selectedService = services.find((item) => item.label === service) ?? services[0];
      const prompt = `Prepare a preliminary pressure-washing estimate for this quote request. Address: ${address}. Requested service: ${service}. Customer details: ${details || "No additional details"}. Explain what can and cannot be determined${image ? " from the attached property photo" : " without a photo"}, give a sensible price range, and list one useful follow-up question.`;
      const assistant = await askAssistant(prompt, [], image ? { data: image.data, mimeType: image.mimeType } : undefined);
      if (!assistant) throw new Error("Estimate analysis is temporarily unavailable.");
      const savedLead = await createPublicLead({
        name: name.trim(),
        contact: contact.trim(),
        address: address.trim(),
        service,
        estimatedValue: selectedService.value,
        notes: `${details.trim()}${details.trim() ? "\n\n" : ""}Assistant estimate:\n${assistant.reply}\nPhoto reviewed: ${image ? "yes" : "no"}. Photo was not stored.`,
      });
      if (!savedLead) throw new Error("The quote could not be saved. Please try again.");
      setResult(assistant.reply);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit this request.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
        <div className="rounded-lg border border-emerald-200 bg-white p-4">
          <CheckCircle2 className="text-emerald-600" size={28} />
          <h3 className="mt-3 text-lg font-bold text-slate-900">Request received</h3>
          <p className="mt-1 text-sm text-slate-500">This quote request is now in The Powerwashing Pros leads dashboard.</p>
          <div className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{result}</div>
          <p className="mt-3 text-xs text-slate-500">This is a preliminary range, not a final quote. Your uploaded photo was analyzed temporarily and was not stored.</p>
          <button type="button" onClick={onBack} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><MessageCircle size={16} />Ask another question</button>
        </div>
      </div>
    );
  }

  const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-teal-600";
  return (
    <form onSubmit={submit} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700"><ArrowLeft size={14} />Back to chat</button>
      <div><h3 className="text-lg font-bold text-slate-900">Request an estimate</h3><p className="mt-1 text-sm text-slate-500">Send one clear photo for the most useful preliminary range.</p></div>
      <label className="block text-sm font-semibold text-slate-700">Property address<input value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="street-address" placeholder="Street address, city, ZIP" className={inputClass} /></label>
      <label className="block text-sm font-semibold text-slate-700">Service<select value={service} onChange={(event) => setService(event.target.value)} className={inputClass}>{services.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
      <PhotoPicker image={image} onChange={setImage} disabled={submitting} />
      <label className="block text-sm font-semibold text-slate-700">Anything we should know?<textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={2} placeholder="Approximate size, stains, surfaces, gate access..." className={`${inputClass} resize-none`} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">Name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className={inputClass} /></label>
        <label className="block text-sm font-semibold text-slate-700">Phone or email<input value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="tel" className={inputClass} /></label>
      </div>
      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}{submitting ? "Reviewing request..." : "Get preliminary estimate"}</button>
      <p className="text-center text-[11px] leading-4 text-slate-400">By submitting, you agree that The Powerwashing Pros may contact you about this request.</p>
    </form>
  );
}

export function QuoteAssistant({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(embedded);
  const [mode, setMode] = useState<Mode>("chat");

  if (!open && !embedded) {
    return <button type="button" onClick={() => setOpen(true)} className="fixed bottom-5 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-teal-700 text-white shadow-xl transition hover:bg-teal-800 sm:right-6" aria-label="Open quote assistant"><MessageCircle size={25} /></button>;
  }

  return (
    <section className={embedded ? "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl" : "fixed inset-x-3 bottom-3 z-50 flex h-[min(680px,calc(100dvh-24px))] min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl sm:left-auto sm:right-5 sm:w-[390px]"} aria-label="The Powerwashing Pros assistant">
      <header className="flex shrink-0 items-center gap-3 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-teal-600"><Sparkles size={18} /></div>
        <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">The Powerwashing Pros</h2><p className="text-xs text-slate-300">Questions and preliminary estimates</p></div>
        {!embedded && <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Close quote assistant"><X size={18} /></button>}
      </header>
      <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 bg-white p-1.5">
        <button type="button" onClick={() => setMode("chat")} className={`rounded-md px-3 py-2 text-xs font-bold ${mode === "chat" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Ask a question</button>
        <button type="button" onClick={() => setMode("quote")} className={`rounded-md px-3 py-2 text-xs font-bold ${mode === "quote" ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Get estimate</button>
      </div>
      {mode === "chat" ? <ChatView onQuote={() => setMode("quote")} /> : <QuoteView onBack={() => setMode("chat")} />}
    </section>
  );
}

export function PublicQuotePage() {
  return (
    <div className="h-[100dvh] min-h-[640px] overflow-hidden bg-slate-100 text-slate-900">
      <header className="flex h-16 items-center border-b border-slate-200 bg-white px-4 sm:px-8"><div><p className="text-xs font-bold uppercase text-teal-700">The</p><h1 className="text-lg font-extrabold">Powerwashing Pros</h1></div></header>
      <main className="mx-auto grid h-[calc(100dvh-64px)] min-h-[576px] max-w-6xl gap-6 overflow-y-auto p-3 sm:p-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:overflow-hidden">
        <section className="hidden max-w-xl lg:block">
          <p className="text-sm font-bold uppercase text-teal-700">Fast property review</p>
          <h2 className="mt-2 text-4xl font-extrabold leading-tight">Ask a question or request a pressure-washing estimate.</h2>
          <p className="mt-4 text-lg leading-7 text-slate-600">Send the property address, describe the surfaces, and attach a clear photo. Your request goes directly to The Powerwashing Pros.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {["Driveways", "Patios", "Full properties"].map((item) => <div key={item} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700">{item}</div>)}
          </div>
        </section>
        <div className="min-h-0 h-full max-h-[760px]"><QuoteAssistant embedded /></div>
      </main>
    </div>
  );
}
