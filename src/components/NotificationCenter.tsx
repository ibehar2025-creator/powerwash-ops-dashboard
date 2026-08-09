import {
  AlertTriangle,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CircleDollarSign,
  ClipboardList,
  FileSignature,
  MapPinOff,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadReadNotificationKeys, markNotificationsRead } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { followUpTiming } from "../lib/followUps";
import type { ContractSubmission, Customer, Job, Lead, ServicePlan } from "../types/business";

type NotificationTone = "urgent" | "today" | "upcoming";
type NotificationKind = "lead" | "job" | "plan" | "contract" | "sync";

type NotificationItem = {
  id: string;
  tone: NotificationTone;
  title: string;
  detail: string;
  kind: NotificationKind;
  record?: Lead | Job | ServicePlan | ContractSubmission;
};

function notificationKey(item: NotificationItem) {
  // Version the key so reminders auto-read by the previous inbox behavior return once.
  return ["v2", item.id, item.tone, item.title, item.detail].join("|");
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function validIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function missingAddress(address: string) {
  return !address.trim() || ["unknown", "n/a", "not listed"].includes(address.trim().toLowerCase());
}

function notificationIcon(item: NotificationItem) {
  if (item.kind === "sync") return RefreshCw;
  if (item.kind === "lead") return CalendarClock;
  if (item.kind === "plan") return ClipboardList;
  if (item.kind === "contract") return FileSignature;
  if (item.id.startsWith("missing-address")) return MapPinOff;
  if (item.id.startsWith("missing-price")) return CircleDollarSign;
  if (item.id.startsWith("conflict")) return AlertTriangle;
  return BriefcaseBusiness;
}

const toneLabels: Record<NotificationTone, string> = {
  urgent: "Needs attention",
  today: "Today",
  upcoming: "Coming up",
};

export function NotificationCenter({
  customers,
  leads,
  jobs,
  plans,
  currentDate,
  syncStatus,
  syncing,
  onLead,
  onJob,
  onPlans,
  onSync,
  contracts = [],
  onContracts,
}: {
  customers: Customer[];
  leads: Lead[];
  jobs: Job[];
  plans: ServicePlan[];
  currentDate: string;
  syncStatus: string;
  syncing: boolean;
  onLead: (lead: Lead) => void;
  onJob: (job: Job) => void;
  onPlans: () => void;
  onSync: () => void;
  contracts?: ContractSubmission[];
  onContracts?: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [readNotificationKeys, setReadNotificationKeys] = useState<Set<string>>(new Set());
  const [readStateLoaded, setReadStateLoaded] = useState(false);
  const customerNames = useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers]);

  useEffect(() => {
    let active = true;
    setReadStateLoaded(false);
    setReadNotificationKeys(new Set());
    loadReadNotificationKeys().then((result) => {
      if (active) setReadNotificationKeys(new Set(result?.readKeys ?? []));
    }).catch(() => {
      // Keep notifications unread if the account-specific state cannot be loaded.
    }).finally(() => {
      if (active) setReadStateLoaded(true);
    });
    return () => { active = false; };
  }, [user.id]);

  const notifications = useMemo(() => {
    const items: NotificationItem[] = [];
    const tomorrow = addDays(currentDate, 1);

    leads.filter((lead) => !["scheduled", "won", "lost"].includes(lead.status)).forEach((lead) => {
      const timing = followUpTiming(lead.followUpDate, currentDate);
      if (["overdue", "today", "upcoming"].includes(timing)) {
        items.push({
          id: `lead-${lead.id}`,
          tone: timing === "overdue" ? "urgent" : timing as "today" | "upcoming",
          title: timing === "overdue" ? `Overdue follow-up: ${lead.name}` : `Follow up with ${lead.name}`,
          detail: `${lead.followUpDate} - ${lead.address || "Address not listed"}`,
          kind: "lead",
          record: lead,
        });
      } else if (timing === "unscheduled" && ["new", "contacted", "quoted"].includes(lead.status)) {
        items.push({
          id: `lead-date-${lead.id}`,
          tone: "upcoming",
          title: `Add a follow-up date: ${lead.name}`,
          detail: `${lead.status} lead - ${lead.address || "Address not listed"}`,
          kind: "lead",
          record: lead,
        });
      }
    });

    const activeJobs = jobs.filter((job) => job.status !== "completed" && job.status !== "canceled");
    activeJobs.filter((job) => job.date === currentDate || job.date === tomorrow).forEach((job) => {
      const today = job.date === currentDate;
      items.push({
        id: `job-${job.id}`,
        tone: today ? "today" : "upcoming",
        title: `${today ? "Today" : "Tomorrow"}: ${customerNames.get(job.customerId) ?? "Job"}`,
        detail: `${job.time || "Time not listed"} - ${job.address || "Address not listed"}`,
        kind: "job",
        record: job,
      });
    });
    activeJobs.filter((job) => job.status === "past due").forEach((job) => {
      items.push({
        id: `past-due-${job.id}`,
        tone: "urgent",
        title: `Past-due job: ${customerNames.get(job.customerId) ?? "Customer"}`,
        detail: `${job.date} - ${job.address || "Address not listed"}`,
        kind: "job",
        record: job,
      });
    });
    activeJobs.filter((job) => job.date >= currentDate && missingAddress(job.address)).forEach((job) => {
      items.push({
        id: `missing-address-${job.id}`,
        tone: job.date <= tomorrow ? "urgent" : "upcoming",
        title: `Job needs an address: ${customerNames.get(job.customerId) ?? "Customer"}`,
        detail: `${job.date} at ${job.time || "time not listed"}`,
        kind: "job",
        record: job,
      });
    });
    activeJobs.filter((job) => job.date >= currentDate && job.price <= 0).forEach((job) => {
      items.push({
        id: `missing-price-${job.id}`,
        tone: job.date <= tomorrow ? "urgent" : "upcoming",
        title: `Job needs a price: ${customerNames.get(job.customerId) ?? "Customer"}`,
        detail: `${job.date} - ${job.address || "Address not listed"}`,
        kind: "job",
        record: job,
      });
    });

    const scheduleGroups = new Map<string, Job[]>();
    activeJobs.filter((job) => job.date >= currentDate && job.time).forEach((job) => {
      const key = `${job.date}|${job.time}`;
      scheduleGroups.set(key, [...(scheduleGroups.get(key) ?? []), job]);
    });
    scheduleGroups.forEach((scheduledJobs, key) => {
      if (scheduledJobs.length < 2) return;
      const [date, time] = key.split("|");
      items.push({
        id: `conflict-${key}`,
        tone: date === currentDate ? "today" : "upcoming",
        title: `${scheduledJobs.length} jobs scheduled together`,
        detail: `${date} at ${time} - check staffing and timing`,
        kind: "job",
        record: scheduledJobs[0],
      });
    });

    const planCutoff = addDays(currentDate, 14);
    plans.filter((plan) => validIsoDate(plan.renewalDate) && plan.renewalDate <= planCutoff).forEach((plan) => {
      const overdue = plan.renewalDate < currentDate;
      items.push({
        id: `plan-${plan.id}`,
        tone: overdue ? "urgent" : plan.renewalDate === currentDate ? "today" : "upcoming",
        title: `${overdue ? "Overdue renewal" : "Plan renewal"}: ${customerNames.get(plan.customerId) ?? "Customer"}`,
        detail: `${plan.renewalDate} - ${plan.type} plan`,
        kind: "plan",
        record: plan,
      });
    });

    contracts.filter((contract) => contract.status === "pending").forEach((contract) => {
      items.push({
        id: `contract-${contract.id}`,
        tone: "urgent",
        title: `New contract: ${contract.customerName}`,
        detail: `${contract.employeeName} submitted ${contract.frequency} at ${contract.price.toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
        kind: "contract",
        record: contract,
      });
    });

    const normalizedSyncStatus = syncStatus.toLowerCase();
    if (["failed", "error", "unavailable", "could not", "not configured"].some((word) => normalizedSyncStatus.includes(word))) {
      items.push({
        id: "sheet-sync-failure",
        tone: "urgent",
        title: "Google Sheets needs attention",
        detail: syncStatus,
        kind: "sync",
      });
    }

    const rank = { urgent: 0, today: 1, upcoming: 2 };
    return items.sort((a, b) => rank[a.tone] - rank[b.tone] || a.detail.localeCompare(b.detail));
  }, [contracts, customerNames, currentDate, jobs, leads, plans, syncStatus]);

  const unreadCount = readStateLoaded
    ? notifications.filter((item) => !readNotificationKeys.has(notificationKey(item))).length
    : 0;

  const visibleNotifications = readStateLoaded
    ? notifications.filter((item) => !readNotificationKeys.has(notificationKey(item)))
    : notifications;

  function toggleNotifications() {
    setOpen((current) => !current);
  }

  function markItemRead(item: NotificationItem) {
    const key = notificationKey(item);
    setReadNotificationKeys((current) => new Set([...current, key]));
    void markNotificationsRead([key]).catch(() => {
      // The optimistic state lasts for this session; a failed save returns as unread next time.
    });
  }

  function openItem(item: NotificationItem) {
    setOpen(false);
    if (item.kind === "lead" && item.record) onLead(item.record as Lead);
    if (item.kind === "job" && item.record) onJob(item.record as Job);
    if (item.kind === "plan") onPlans();
    if (item.kind === "contract") onContracts?.();
    if (item.kind === "sync") onSync();
  }

  return (
    <div className="relative z-50">
      <button type="button" className="icon-button relative" aria-label="Open notifications" aria-expanded={open} title="Notifications" onClick={toggleNotifications}>
        <Bell size={17} />
        {unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <>
        <button type="button" className="fixed inset-0 z-40 bg-ink/35 sm:bg-transparent" aria-label="Close notifications" onClick={() => setOpen(false)} />
        <div className="fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[410px]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold uppercase text-lagoon dark:text-cyan-300">Notification center</p>
              <h2 className="font-semibold text-ink dark:text-white">Business reminders</h2>
              <p className="mt-1 text-xs text-slate-500">{visibleNotifications.length} unread reminder{visibleNotifications.length === 1 ? "" : "s"} for {user.name}</p>
            </div>
            <button type="button" className="icon-button h-8 w-8 shrink-0" aria-label="Close notifications" title="Close notifications" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto p-2 sm:max-h-[min(68vh,560px)]">
            {(["urgent", "today", "upcoming"] as NotificationTone[]).map((tone) => {
              const group = visibleNotifications.filter((item) => item.tone === tone);
              if (!group.length) return null;
              return <section key={tone} className="mb-2 last:mb-0"><h3 className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{toneLabels[tone]} - {group.length}</h3>{group.map((item) => {
                const Icon = notificationIcon(item);
                return <div key={item.id} className="flex items-start rounded-lg transition hover:bg-slate-50 dark:hover:bg-slate-800"><button type="button" className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left" disabled={item.kind === "sync" && syncing} onClick={() => openItem(item)}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone === "urgent" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" : item.tone === "today" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" : "bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"}`}><Icon size={17} /></span><span className="min-w-0"><strong className="block text-sm text-ink dark:text-white">{item.title}</strong><span className="mt-1 block break-words text-xs leading-5 text-slate-500">{item.kind === "sync" && syncing ? "Syncing Google Sheets..." : item.detail}</span></span></button><button type="button" className="icon-button mr-2 mt-3 h-8 w-8 shrink-0" aria-label={`Mark ${item.title} as read`} title="Mark as read" onClick={() => markItemRead(item)}><Check size={16} /></button></div>;
              })}</section>;
            })}
            {visibleNotifications.length === 0 && <div className="p-8 text-center"><Bell className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-ink dark:text-white">You are caught up</p><p className="mt-1 text-sm text-slate-500">No unread follow-ups, jobs, renewals, schedule issues, or sync problems need attention.</p></div>}
          </div>
        </div>
      </>}
    </div>
  );
}
