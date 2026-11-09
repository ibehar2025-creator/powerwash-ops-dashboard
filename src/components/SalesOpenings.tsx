import { useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Save, Trash2, X } from 'lucide-react';
import { salesRequest } from '../lib/sales';
import type { OwnerSalesOpening, SalesOpening } from '../lib/sales';
import { centralToday, dateLabel, openingHours, ownerOpeningsPath, shift } from '../lib/salesOpenings';

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

function OpeningRow({ opening, onBook }: { opening: SalesOpening; onBook: (opening: SalesOpening) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-2 py-2">
    <span className="text-sm font-semibold">{openingHours(opening)}</span>
    <button type="button" className="text-button gap-2" onClick={() => onBook(opening)}><CalendarDays size={16} />Book opening</button>
  </div>;
}

export function SalesOpeningCalendar({ openings, today, onBook }: { openings: SalesOpening[]; today: string; onBook: (opening: SalesOpening) => void }) {
  const [start, setStart] = useState(today);
  const days = Array.from({ length: 7 }, (_, index) => shift(start, index));
  return <section aria-label="Bookable calendar">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
      <div><h2 className="text-lg font-bold">{dateLabel(start)} to {dateLabel(days[6])}</h2><p className="text-xs text-slate-500 dark:text-slate-400">Central time</p></div>
      <div className="flex items-center gap-2">
        <button type="button" className="icon-button" aria-label="Previous week" title="Previous week" onClick={() => setStart(shift(start, -7))}><ChevronLeft size={18} /></button>
        <button type="button" className="text-button" onClick={() => setStart(today)}>Today</button>
        <button type="button" className="icon-button" aria-label="Next week" title="Next week" onClick={() => setStart(shift(start, 7))}><ChevronRight size={18} /></button>
      </div>
    </div>
    {days.map(date => {
      const dayOpenings = openings.filter(opening => opening.date === date);
      return <div key={date} className="grid gap-1 border-b border-slate-200 py-3 dark:border-slate-800 sm:grid-cols-[9rem_1fr]">
        <h3 className="pt-2 text-sm font-semibold">{dateLabel(date)}{date === today ? ' · Today' : ''}</h3>
        <div>{dayOpenings.length ? dayOpenings.map(opening => <OpeningRow key={opening.id} opening={opening} onBook={onBook} />) : <p className="py-2 text-sm text-slate-500 dark:text-slate-400">No published openings</p>}</div>
      </div>;
    })}
  </section>;
}

export function NextSalesOpening({ opening, loading, error, onCalendar, onBook }: {
  opening?: SalesOpening; loading: boolean; error: boolean; onCalendar: () => void; onBook: (opening: SalesOpening) => void;
}) {
  return <section className="border-y border-slate-200 py-3 dark:border-slate-700">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Next available</h2>
      <button type="button" className="text-button gap-2" onClick={onCalendar}><CalendarDays size={16} />View calendar</button>
    </div>
    {error ? <p role="status" className="mt-2 text-sm text-amber-700 dark:text-amber-300">Couldn’t check openings. Try Refresh.</p>
      : loading ? <p className="mt-2 text-sm text-slate-500">Checking openings...</p>
      : opening ? <><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{dateLabel(opening.date)} · Central time</p><OpeningRow opening={opening} onBook={onBook} /></>
      : <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No openings published yet.</p>}
  </section>;
}
