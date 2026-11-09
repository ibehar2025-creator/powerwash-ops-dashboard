import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { calendarDays, calendarLabel, dateFromIso, moveCalendarDate } from '../lib/calendar';
import type { CalendarMode } from '../lib/calendar';
import type { MapJob, SalesOpening } from '../lib/sales';
import { openingHours } from '../lib/salesOpenings';
import type { Job } from '../types/business';
import { CalendarNavigation } from './CalendarNavigation';

type BusyJob = Pick<MapJob, 'id' | 'date' | 'time' | 'status'>;
type CalendarEntry =
  | { kind: 'opening'; time: string; opening: SalesOpening }
  | { kind: 'own'; time: string; job: Job }
  | { kind: 'busy'; time: string; id: string };

export function SalesCalendar({ openings, ownJobs, busyJobs, customerName, today, initialDate, onBook, onOpenJob }: {
  openings: SalesOpening[];
  ownJobs: Job[];
  busyJobs: BusyJob[];
  customerName: (job: Job) => string;
  today: string;
  initialDate: string;
  onBook: (opening: SalesOpening) => void;
  onOpenJob: (job: Job) => void;
}) {
  const [anchor, setAnchor] = useState(initialDate);
  const [mode, setMode] = useState<CalendarMode>('week');
  const anchorDate = dateFromIso(anchor);
  const days = calendarDays(anchorDate, mode);
  const entriesByDate = useMemo(() => {
    const byDate = new Map<string, CalendarEntry[]>();
    const append = (date: string, entry: CalendarEntry) => {
      const items = byDate.get(date);
      if (items) items.push(entry);
      else byDate.set(date, [entry]);
    };
    const ownIds = new Set(ownJobs.map(job => job.id));
    for (const job of busyJobs) {
      if (!ownIds.has(job.id) && job.status !== 'canceled') append(job.date, { kind: 'busy', time: job.time, id: job.id });
    }
    for (const job of ownJobs) append(job.date, { kind: 'own', time: job.time, job });
    for (const opening of openings) append(opening.date, { kind: 'opening', time: opening.startTime, opening });
    for (const items of byDate.values()) items.sort((a, b) => a.time.localeCompare(b.time));
    return byDate;
  }, [openings, ownJobs, busyJobs]);

  return <section aria-label="Bookable calendar" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-lagoon dark:text-cyan-300">Central time</p>
        <h2 className="mt-1 text-xl font-semibold">{calendarLabel(anchorDate, mode)}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarNavigation mode={mode} onMode={setMode} onMove={direction => setAnchor(date => moveCalendarDate(date, mode, direction))} onToday={() => setAnchor(today)} />
      </div>
    </div>
    <div className={`calendar-grid ${mode}-mode`}>
      {days.map(day => {
        const items = entriesByDate.get(day.date) ?? [];
        return <div key={day.date} className="calendar-day">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
            <h3 className="font-semibold">{day.label}</h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">{day.date === today ? 'Today' : day.date.slice(5)}</span>
          </div>
          {!items.length && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Nothing scheduled</p>}
          {items.map(item => item.kind === 'opening'
            ? <button key={`open-${item.opening.id}`} type="button" className="calendar-opening calendar-opening-available" onClick={() => onBook(item.opening)}>
                <span className="text-xs font-semibold">{openingHours(item.opening)}</span>
                <span className="flex items-center gap-1 text-xs"><CalendarPlus size={13} className="shrink-0" />Book opening</span>
              </button>
            : item.kind === 'own'
              ? <button key={`own-${item.job.id}`} type="button" className="calendar-job min-w-0 break-words" onClick={() => onOpenJob(item.job)}>
                  {item.time && <span className="text-xs font-semibold">{item.time}</span>}
                  <span className="max-w-full break-words font-semibold">{customerName(item.job)}</span>
                  <span className="text-xs capitalize">{item.job.status}</span>
                </button>
              : <div key={`busy-${item.id}`} className="calendar-opening">
                  {item.time && <span className="text-xs">{item.time}</span>}
                  <span className="text-xs font-semibold">Busy</span>
                </div>)}
        </div>;
      })}
    </div>
  </section>;
}
