import { useEffect, useState } from "react";
import { BellRing, BellOff, Send } from "lucide-react";
import { loadPushConfig, removePushSubscription, savePushSubscription, sendTestPush } from "../lib/api";

function applicationServerKey(value: string) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function PushNotificationSettings() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadPushConfig().then(async (config) => {
      if (!active || !config) return;
      const registration = supported ? await navigator.serviceWorker.ready : null;
      const localSubscription = registration ? await registration.pushManager.getSubscription() : null;
      setConfigured(config.enabled);
      setPublicKey(config.publicKey);
      setSubscribed(Boolean(localSubscription));
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : "Unable to check notification settings.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supported]);

  async function enable() {
    setWorking(true); setMessage("");
    try {
      if (!supported) throw new Error("This browser does not support web notifications. On iPhone, add the dashboard to your Home Screen and open it there.");
      if (!configured || !publicKey) throw new Error("Phone notifications are not configured on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted. Allow notifications in your phone settings and try again.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      await savePushSubscription(subscription.toJSON());
      setSubscribed(true);
      setMessage("Notifications are enabled on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to enable notifications."); }
    finally { setWorking(false); }
  }

  async function disable() {
    setWorking(true); setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Notifications are off on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to disable notifications."); }
    finally { setWorking(false); }
  }

  async function test() {
    setWorking(true); setMessage("");
    try {
      await sendTestPush();
      setMessage("Test sent. It should appear on this device shortly.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send a test notification."); }
    finally { setWorking(false); }
  }

  if (loading) return <p className="text-sm text-slate-500">Checking this device…</p>;
  return <div className="space-y-4">
    <div className={`rounded-xl border p-4 ${subscribed ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="flex items-start gap-3">{subscribed ? <BellRing className="mt-0.5 text-emerald-600" size={20} /> : <BellOff className="mt-0.5 text-slate-400" size={20} />}<div><strong className="text-ink dark:text-white">{subscribed ? "Enabled on this device" : "Not enabled on this device"}</strong><p className="mt-1 text-sm text-slate-500">Alerts are private to your signed-in account and each phone must be enabled separately.</p></div></div>
    </div>
    {!supported && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">On iPhone, open Safari, tap Share → Add to Home Screen, then open the installed dashboard and return here.</p>}
    {!configured && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">The server notification keys still need to be configured.</p>}
    <div className="grid gap-2 sm:grid-cols-2">{subscribed ? <button type="button" className="text-button gap-2" disabled={working} onClick={() => void disable()}><BellOff size={16} />Turn off</button> : <button type="button" className="primary-button gap-2" disabled={working || !configured} onClick={() => void enable()}><BellRing size={16} />Enable notifications</button>}{subscribed && <button type="button" className="primary-button gap-2" disabled={working} onClick={() => void test()}><Send size={16} />Send test</button>}</div>
    {message && <p className="rounded-lg bg-mist p-3 text-sm font-medium text-lagoon dark:bg-cyan-500/10 dark:text-cyan-200">{message}</p>}
  </div>;
}
