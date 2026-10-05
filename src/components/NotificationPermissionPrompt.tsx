import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BellRing, X } from "lucide-react";
import { loadPushConfig } from "../lib/api";

export function NotificationPermissionPrompt({ userId, disabled, onOpenSettings }: {
  userId: string;
  disabled: boolean;
  onOpenSettings: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const dismissed = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = `notification-prompt-dismissed:${userId}`;

  useEffect(() => {
    if (disabled || dismissed.current) return;
    try { if (sessionStorage.getItem(storageKey)) return; } catch { /* Storage may be unavailable in private browsing. */ }
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const config = await loadPushConfig();
        if (!active || !config?.enabled) return;
        let enabled = false;
        if ("Notification" in window && Notification.permission === "granted" && "serviceWorker" in navigator && "PushManager" in window) {
          const registration = await navigator.serviceWorker.getRegistration();
          enabled = Boolean(await registration?.pushManager.getSubscription());
        }
        if (active && !enabled) setVisible(true);
      })().catch(() => { /* A failed settings check should not interrupt the workspace. */ });
    }, 1500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [disabled, storageKey]);

  useEffect(() => {
    if (visible && !disabled && !dialog.current?.open) dialog.current?.showModal();
  }, [visible, disabled]);

  function dismiss() {
    dismissed.current = true;
    try { sessionStorage.setItem(storageKey, "1"); } catch { /* Keep the in-memory dismissal when storage is blocked. */ }
    setVisible(false);
  }

  if (!visible || disabled) return null;
  return createPortal(<dialog ref={dialog} className="notification-permission-prompt sales-dialog" aria-labelledby="notification-prompt-title" aria-describedby="notification-prompt-description" onCancel={(event) => { event.preventDefault(); dismiss(); }}>
    <div className="flex items-start justify-between gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-mist text-lagoon dark:bg-cyan-500/15 dark:text-cyan-300"><BellRing size={23} /></span>
      <button type="button" className="icon-button shrink-0" aria-label="Close notification prompt" onClick={dismiss}><X size={18} /></button>
    </div>
    <h2 id="notification-prompt-title" className="mt-4 text-xl font-bold">Allow notifications</h2>
    <p id="notification-prompt-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Turn on notifications for this device to receive job updates, reminders, and payment alerts.</p>
    <div className="mt-5 grid gap-2 sm:grid-cols-2">
      <button type="button" className="primary-button gap-2" onClick={() => { dismiss(); onOpenSettings(); }}><BellRing size={17} />Allow notifications</button>
      <button type="button" className="text-button" onClick={dismiss}>Not now</button>
    </div>
  </dialog>, document.body);
}
