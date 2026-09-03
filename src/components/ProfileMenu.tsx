import { useEffect, useRef, useState } from "react";
import { BadgePercent, Building2, ChevronDown, CircleHelp, Clipboard, LogOut, Monitor, Moon, Save, Sun, UserRound, X } from "lucide-react";
import { useAuth } from "../lib/authContext";
import type { ThemePreference } from "../lib/themePreference";
import type { EmployeeProfile } from "../types/business";

type View = "profile" | "help" | "report" | "business" | "rates" | null;

export function ProfileMenu({ theme, onTheme, employee, onOwnerNavigate, preview = false }: {
  theme: ThemePreference;
  onTheme: (theme: ThemePreference) => void;
  employee?: EmployeeProfile;
  onOwnerNavigate?: (tab: "team" | "payroll" | "contracts") => void;
  preview?: boolean;
}) {
  const { user, updateProfile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>(null);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [pictureUrl, setPictureUrl] = useState(user.pictureUrl);
  const [issue, setIssue] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function show(next: View) { setView(next); setOpen(false); setMessage(""); }
  async function saveProfile() {
    setWorking(true); setMessage("");
    try { await updateProfile({ name, phone, pictureUrl }); setMessage("Profile saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save profile."); }
    finally { setWorking(false); }
  }
  async function copyIssue() {
    const details = `Dashboard problem\nAccount: ${user.name} (${user.email})\nPage: ${window.location.href}\nDetails: ${issue || "Add details here"}`;
    await navigator.clipboard.writeText(details);
    setMessage("Issue details copied. Send them to the owner with a screenshot.");
  }

  return <div className="relative" ref={menuRef}>
    <button type="button" className="text-button min-w-0 gap-2 px-2" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Open profile menu">
      {user.pictureUrl ? <img className="h-7 w-7 shrink-0 rounded-full object-cover" src={user.pictureUrl} alt="" referrerPolicy="no-referrer" /> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-mist text-xs font-bold text-lagoon">{user.name.slice(0, 1).toUpperCase()}</span>}
      <span className="hidden max-w-28 truncate text-left xl:block"><span className="block truncate text-xs font-semibold">{user.name}</span><span className="block text-[10px] capitalize text-slate-400">{preview ? "Employee preview" : user.role}</span></span><ChevronDown size={14} />
    </button>
    {open && <div className="absolute right-0 z-[80] mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800"><p className="truncate text-sm font-semibold text-ink dark:text-white">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
      <MenuButton icon={UserRound} label="My profile" onClick={() => show("profile")} />
      <div className="my-1 border-t border-slate-100 pt-2 dark:border-slate-800"><p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Appearance</p><div className="mt-2 grid grid-cols-3 gap-1">{([{ id: "light", label: "Light", icon: Sun }, { id: "dark", label: "Dark", icon: Moon }, { id: "system", label: "System", icon: Monitor }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => onTheme(id)} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${theme === id ? "border-lagoon bg-mist text-lagoon dark:bg-cyan-500/15" : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"}`}><Icon className="mx-auto mb-1" size={15} />{label}</button>)}</div></div>
      {user.role === "owner" && !preview && <MenuButton icon={Building2} label="Business settings" onClick={() => show("business")} />}
      {(employee || user.role === "employee") && <MenuButton icon={BadgePercent} label="My commission rates" onClick={() => show("rates")} />}
      <MenuButton icon={CircleHelp} label="Help & instructions" onClick={() => show("help")} />
      <MenuButton icon={Clipboard} label="Report a problem" onClick={() => show("report")} />
      {!preview && <button type="button" className="mt-1 flex w-full items-center gap-3 border-t border-slate-100 px-3 py-3 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-slate-800 dark:hover:bg-rose-500/10" onClick={() => void signOut()}><LogOut size={17} />Sign out</button>}
    </div>}
    {view && <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/55 p-4" role="dialog" aria-modal="true"><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between"><h2 className="text-xl font-bold text-ink dark:text-white">{view === "profile" ? "My profile" : view === "business" ? "Business settings" : view === "rates" ? "My commission rates" : view === "help" ? "Help & instructions" : "Report a problem"}</h2><button className="icon-button" onClick={() => setView(null)} aria-label="Close"><X size={17} /></button></div>
      {view === "profile" && <div className="mt-5 space-y-4"><label className="block text-sm font-semibold">Display name<input className="mt-2 w-full" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block text-sm font-semibold">Phone<input className="mt-2 w-full" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Optional" /></label><label className="block text-sm font-semibold">Profile photo URL<input className="mt-2 w-full" type="url" value={pictureUrl} onChange={(event) => setPictureUrl(event.target.value)} placeholder="https://..." /></label><p className="text-xs text-slate-500">Your email and account role are managed by sign-in and cannot be changed here.</p><button className="primary-button w-full gap-2" disabled={working} onClick={() => void saveProfile()}><Save size={16} />{working ? "Saving..." : "Save profile"}</button></div>}
      {view === "business" && <div className="mt-5 grid gap-3"><p className="text-sm text-slate-500">Quick access to owner-only business controls.</p><Shortcut title="Team & commission settings" detail="Employees, rates, assignments, and approvals" onClick={() => { setView(null); onOwnerNavigate?.("team"); }} /><Shortcut title="Weekly payroll" detail="Draft, finalize, and record payments" onClick={() => { setView(null); onOwnerNavigate?.("payroll"); }} /><Shortcut title="Customer contracts" detail="Review and manage company contracts" onClick={() => { setView(null); onOwnerNavigate?.("contracts"); }} /></div>}
      {view === "rates" && <div className="mt-5">{employee ? <div className="grid grid-cols-2 gap-3"><Rate label="Base commission" value={employee.baseCommissionPct} /><Rate label="Upsell commission" value={employee.upsellCommissionPct} /><Rate label="Contract bonus" value={employee.contractBonusPct} /><Rate label="Tip share" value={employee.tipSharePct} /></div> : <p className="text-sm text-slate-500">Your commission rates will appear after the owner activates your employee profile.</p>}<p className="mt-4 text-xs text-slate-500">Rates are read-only here. Ask the owner to make changes.</p></div>}
      {view === "help" && <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{user.role === "owner" && !preview ? <><p><strong>Jobs:</strong> create or edit work, then assign it from Team.</p><p><strong>Payroll:</strong> review approved earnings, create the weekly draft, finalize it, then record each payment.</p><p><strong>Sheets:</strong> use the separate Sync Sheets button whenever you need an immediate update.</p></> : <><p><strong>Home:</strong> shows today’s assigned jobs and your earnings summary.</p><p><strong>Schedule and Map:</strong> show only jobs assigned to you.</p><p><strong>Earnings:</strong> submit job details and view finalized weekly statements.</p></>}</div>}
      {view === "report" && <div className="mt-5 space-y-4"><p className="text-sm text-slate-500">Describe what happened, copy the report, and send it to the owner with a screenshot.</p><textarea className="min-h-32 w-full" value={issue} onChange={(event) => setIssue(event.target.value)} placeholder="What page were you on, what did you click, and what went wrong?" /><button className="primary-button w-full gap-2" onClick={() => void copyIssue()}><Clipboard size={16} />Copy issue details</button></div>}
      {message && <p className="mt-4 rounded-lg bg-mist p-3 text-sm font-medium text-lagoon dark:bg-cyan-500/10 dark:text-cyan-200">{message}</p>}
    </section></div>}
  </div>;
}

function MenuButton({ icon: Icon, label, onClick }: { icon: typeof UserRound; label: string; onClick: () => void }) { return <button type="button" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClick}><Icon size={17} className="text-lagoon" />{label}</button>; }
function Shortcut({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) { return <button type="button" className="rounded-xl border border-slate-200 p-4 text-left hover:border-lagoon dark:border-slate-700" onClick={onClick}><strong className="text-ink dark:text-white">{title}</strong><span className="mt-1 block text-xs text-slate-500">{detail}</span></button>; }
function Rate({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-ink dark:text-white">{Math.round(value * 100)}%</p></div>; }
