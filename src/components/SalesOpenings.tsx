import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, CalendarPlus, Save, Trash2, X } from 'lucide-react';
import { salesRequest } from '../lib/sales';
import type { OwnerSalesOpening, SalesOpening } from '../lib/sales';
import { centralToday, dateLabel, openingHours, ownerOpeningsPath } from '../lib/salesOpenings';

const ownerStatuses = { open: 'Available to sales', busy: 'Job scheduled', booked: 'Booked', pending: 'Booking pending', past: 'Past' };
export function OwnerOpeningButton({ opening, onClick }: { opening: OwnerSalesOpening; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`calendar-opening ${opening.status === 'open' ? 'calendar-opening-available' : ''}`}>
    <span className="text-xs font-semibold">{openingHours(opening)}</span>
    <span className="text-xs">{ownerStatuses[opening.status]}</span>
    {opening.weekendDefault && <span className="text-xs opacity-80">Weekend opening</span>}
  </button>;
}

export function OwnerOpeningEditor({ opening, onClose, onSaved }: {
  opening: OwnerSalesOpening; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(opening);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const editable = !['pending', 'booked'].includes(opening.status) && opening.date >= centralToday();
  const path = opening.id ? `${ownerOpeningsPath}/${opening.id}${opening.weekendDefault ? `?date=${opening.date}` : ''}` : ownerOpeningsPath;
  const title = opening.id ? 'Calendar opening' : 'Add opening';
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editable) return;
    await perform(opening.id ? 'PATCH' : 'POST');
  }
  async function perform(method: 'POST' | 'PATCH' | 'DELETE') {
    setWorking(true); setError('');
    try {
      await salesRequest(path, method, method === 'DELETE' ? undefined : { date: draft.date, startTime: draft.startTime, endTime: draft.endTime });
      await onSaved(); onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save opening.');
    } finally { setWorking(false); }
  }
  return <div className="sales-modal"><form className="sales-dialog !max-w-md" role="dialog" aria-modal="true" aria-label={title} onSubmit={save}
    onKeyDown={event => { if (event.key === 'Escape' && !working) onClose(); }}>
    <div className="flex items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">One job per opening · Central time</p></div>
      <button type="button" className="icon-button shrink-0" title="Close" aria-label="Close opening" onClick={onClose} disabled={working}><X size={17} /></button>
    </div>
    {opening.id && <p className="mt-3 text-sm font-semibold">{opening.weekendDefault ? 'Weekend opening · ' : ''}{ownerStatuses[opening.status]}</p>}
    <fieldset className="settings-grid mt-4" disabled={working || !editable}>
      <label className="block min-w-0 text-sm font-semibold sm:col-span-2">Date<input className="recurring-date" type="date" required readOnly={opening.weekendDefault} min={centralToday()} value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label>
      <label className="block min-w-0 text-sm font-semibold">Start time<input type="time" required value={draft.startTime} onChange={event => setDraft({ ...draft, startTime: event.target.value })} /></label>
      <label className="block min-w-0 text-sm font-semibold">End time<input type="time" required value={draft.endTime} onChange={event => setDraft({ ...draft, endTime: event.target.value })} /></label>
    </fieldset>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {confirmRemove && <div className="mt-4 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700"><p className="text-sm">{opening.weekendDefault ? 'Remove this date’s opening? Other weekends and existing jobs won’t change.' : 'Remove this opening? Existing jobs won’t change.'}</p><button type="button" className="text-button text-rose-600" disabled={working} onClick={() => void perform('DELETE')}>Confirm removal</button></div>}
    <div className="mt-5 flex flex-wrap justify-end gap-2">
      {opening.id && opening.status !== 'pending' && !confirmRemove && <button type="button" className="text-button gap-2" disabled={working} onClick={() => setConfirmRemove(true)}><Trash2 size={15} />Remove opening</button>}
      {editable && <button className="primary-button gap-2" disabled={working}><Save size={16} />{working ? 'Saving...' : opening.id ? 'Save changes' : 'Publish opening'}</button>}
    </div>
  </form></div>;
}

export function NextSalesOpening({ opening, loading, error, onCalendar, onBook }: {
  opening?: SalesOpening; loading: boolean; error: boolean; onCalendar: () => void; onBook: (opening: SalesOpening) => void;
}) {
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/35">
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Next available</h2>
      {error ? <p role="status" className="mt-1 text-sm text-amber-800 dark:text-amber-300">Couldn’t check openings. Try Refresh.</p>
        : loading ? <p className="mt-1 text-sm">Checking openings...</p>
        : opening ? <><p className="mt-1 text-lg font-bold">{dateLabel(opening.date)}</p><p className="text-sm"><span>{openingHours(opening)}</span> <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">· Central time</span></p></>
        : <p className="mt-1 text-sm">No openings published yet.</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {opening && !error && !loading && <button type="button" className="primary-button gap-2" onClick={() => onBook(opening)}><CalendarPlus size={16} />Book opening</button>}
      <button type="button" className="text-button gap-2" onClick={onCalendar}><CalendarDays size={16} />View calendar</button>
    </div>
  </section>;
}
