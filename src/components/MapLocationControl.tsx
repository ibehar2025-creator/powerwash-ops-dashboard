import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LocateFixed, RefreshCw, Settings, X } from 'lucide-react';
import { locationPermissionHelp } from '../lib/locationPermissionHelp';

export function MapLocationControl({ hasLocation, onLocate }: { hasLocation: boolean; onLocate: (position: GeolocationPosition) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [denied, setDenied] = useState(false);
  const [settings, setSettings] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const help = locationPermissionHelp(navigator.userAgent, standalone, navigator.maxTouchPoints);

  useEffect(() => {
    if (!settings) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [settings]);

  function locate() {
    if (busy) return;
    if (!navigator.geolocation) { setStatus('Location is not supported by this browser.'); return; }
    setBusy(true);
    setStatus('Finding your location...');
    navigator.geolocation.getCurrentPosition(position => {
      setBusy(false); setDenied(false); setStatus(''); setSettings(false);
      onLocate(position);
    }, error => {
      setBusy(false);
      const blocked = error.code === 1;
      setDenied(blocked);
      setStatus(blocked ? 'Location access is blocked.' : error.code === 3 ? 'Location timed out. Please try again.' : 'Your location is unavailable. Check that device Location is on.');
    }, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 });
  }

  return <>
    <button type="button" className="absolute bottom-10 right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-soft transition hover:border-blue-500 hover:text-blue-600 disabled:cursor-wait disabled:opacity-70 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" aria-label="Show my location" title="Show my location" disabled={busy} onClick={locate}><LocateFixed size={20} className={busy ? 'animate-pulse text-blue-600' : hasLocation ? 'text-blue-600' : ''} /></button>
    {status && <div role="status" className="absolute bottom-10 left-3 z-10 max-w-[calc(100%-76px)] rounded-lg border border-slate-200 bg-white/95 p-3 text-sm text-slate-700 shadow dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"><p className="break-words">{status}</p>{denied && <button type="button" className="text-button mt-2 gap-2" onClick={() => setSettings(true)}><Settings size={16} />Location settings</button>}</div>}
    {settings && <div className="sales-modal" onClick={event => { if (event.target === event.currentTarget) setSettings(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="map-location-settings-title" className="sales-dialog" onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); setSettings(false); }
        if (event.key === 'Tab') {
          const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
          if (!controls?.length) return;
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 id="map-location-settings-title" className="text-xl font-bold">Allow location access</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{help.device}</p></div><button type="button" className="icon-button shrink-0" aria-label="Close location settings" title="Close" onClick={() => setSettings(false)}><X size={18} /></button></div>
        <p className="mt-4 break-words text-sm font-semibold">{window.location.hostname}</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Your browser does not let this website open device settings automatically.</p>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6">{help.steps.map(step => <li key={step} className="break-words pl-1">{step}</li>)}</ol>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><a className="inline-flex items-center gap-2 text-sm font-semibold text-lagoon dark:text-cyan-300" href={help.helpUrl} target="_blank" rel="noopener noreferrer">Official instructions<ExternalLink size={15} /></a><button type="button" className="primary-button gap-2" disabled={busy} onClick={locate}><RefreshCw size={16} />{busy ? 'Checking...' : 'Try again'}</button></div>
      </div>
    </div>}
  </>;
}
