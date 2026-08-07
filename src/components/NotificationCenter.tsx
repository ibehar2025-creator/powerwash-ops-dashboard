import { Bell, BriefcaseBusiness, CalendarClock, ClipboardList, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadReadNotificationKeys, markNotificationsRead } from "../lib/api";
import { useAuth } from "../lib/authContext";
import { followUpTiming } from "../lib/followUps";
import type { Customer, Job, Lead, ServicePlan } from "../types/business";

type NotificationItem = {
  id: string;
  tone: "urgent" | "today" | "upcoming";
  title: string;
  detail: string;
  kind: "lead" | "job" | "plan";
  record: Lead | Job | ServicePlan;
};

function notificationKey(item: NotificationItem) {
  return [item.id, item.tone, item.title, item.detail].join("|");
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function NotificationCenter({ customers, leads, jobs, plans, currentDate, onLead, onJob, onPlans }: {
  customers: Customer[];
  leads: Lead[];
  jobs: Job[];
  plans: ServicePlan[];
  currentDate: string;
  onLead: (lead: Lead) => void;
  onJob: (job: Job) => void;
  onPlans: () => void;
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
    leads.filter((lead) => !["scheduled", "won", "lost"].includes(lead.status)).forEach((lead) => {
      const timing = followUpTiming(lead.followUpDate, currentDate);
      if (!["overdue", "today", "upcoming"].includes(timing)) return;
      items.push({ id: `lead-${lead.id}`, tone: timing === "overdue" ? "urgent" : timing as "today" | "upcoming", title: timing === "overdue" ? `Overdue: ${lead.name}` : `Follow up with ${lead.name}`, detail: `${lead.followUpDate} - ${lead.address}`, kind: "lead", record: lead });
    });
    jobs.filter((job) => job.status !== "completed" && job.status !== "canceled" && (job.date === currentDate || job.date === addDays(currentDate, 1))).forEach((job) => {
      const today = job.date === currentDate;
      items.push({ id: `job-${job.id}`, tone: today ? "today" : "upcoming", title: `${today ? "Today" : "Tomorrow"}: ${customerNames.get(job.customerId) ?? "Job"}`, detail: `${job.time} - ${job.address}`, kind: "job", record: job });
    });
    const planCutoff = addDays(currentDate, 30);
    plans.filter((plan) => plan.renewalDate >= currentDate && plan.renewalDate <= planCutoff).forEach((plan) => {
      items.push({ id: `plan-${plan.id}`, tone: plan.renewalDate === currentDate ? "today" : "upcoming", title: `Plan renewal: ${customerNames.get(plan.customerId) ?? "Customer"}`, detail: `${plan.renewalDate} - ${plan.type} plan`, kind: "plan", record: plan });
    });
    const rank = { urgent: 0, today: 1, upcoming: 2 };
    return items.sort((a, b) => rank[a.tone] - rank[b.tone] || a.detail.localeCompare(b.detail));
  }, [customerNames, currentDate, jobs, leads, plans]);
  const attentionNotifications = notifications.filter((item) => item.tone === "urgent" || item.tone === "today");
  const unreadCount = readStateLoaded ? attentionNotifications.filter((item) => !readNotificationKeys.has(notificationKey(item))).length : 0;

  function toggleNotifications() {
    if (open) {
      setOpen(false);
      return;
    }
    const nextReadKeys = new Set(readNotificationKeys);
    attentionNotifications.forEach((item) => nextReadKeys.add(notificationKey(item)));
    setReadNotificationKeys(nextReadKeys);
    void markNotificationsRead(attentionNotifications.map(notificationKey)).catch(() => {
      // The optimistic state lasts for this session; a failed save returns as unread next time.
    });
    setOpen(true);
  }

  function openItem(item: NotificationItem) {
    setOpen(false);
    if (item.kind === "lead") onLead(item.record as Lead);
    if (item.kind === "job") onJob(item.record as Job);
    if (item.kind === "plan") onPlans();
  }

  return (
    <div className="relative z-50">
      <button type="button" className="icon-button relative" aria-label="Open notifications" aria-expanded={open} title="Notifications" onClick={toggleNotifications}>
        <Bell size={17} />
        {unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <>
        <button type="button" className="fixed inset-0 z-40 bg-ink/35 sm:bg-transparent" aria-label="Close notifications" onClick={() => setOpen(false)} />
        <div className="fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[390px]" onClick={() => setOpen(false)}>
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
            <div><p className="text-xs font-semibold uppercase text-lagoon dark:text-cyan-300">Notification center</p><h2 className="font-semibold text-ink dark:text-white">Business reminders</h2></div>
            <button type="button" className="icon-button h-8 w-8 shrink-0" aria-label="Close notifications" title="Close notifications" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto p-2 sm:max-h-[min(65vh,520px)]">
            {notifications.map((item) => {
              const Icon = item.kind === "lead" ? CalendarClock : item.kind === "job" ? BriefcaseBusiness : ClipboardList;
              return <button key={item.id} type="button" className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => openItem(item)}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.tone === "urgent" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200" : item.tone === "today" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200" : "bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-200"}`}><Icon size={17} /></span><span className="min-w-0"><strong className="block text-sm text-ink dark:text-white">{item.title}</strong><span className="mt-1 block truncate text-xs text-slate-500">{item.detail}</span></span></button>;
            })}
            {notifications.length === 0 && <div className="p-8 text-center"><Bell className="mx-auto text-slate-300" /><p className="mt-3 font-semibold text-ink dark:text-white">You are caught up</p><p className="mt-1 text-sm text-slate-500">No follow-ups, jobs, or renewals need attention.</p></div>}
          </div>
        </div>
      </>}
    </div>
  );
}
