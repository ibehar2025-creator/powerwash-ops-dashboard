import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CalendarMode } from '../lib/calendar';

export function CalendarNavigation({ mode, onMode, onMove, onToday, phoneRange }: {
  mode: CalendarMode;
  onMode: (mode: CalendarMode) => void;
  onMove: (direction: -1 | 1) => void;
  onToday: () => void;
  phoneRange?: string;
}) {
  return <div className={phoneRange ? 'calendar-owner-navigation' : 'flex flex-wrap items-center gap-2'}>
    <div className={phoneRange ? 'calendar-owner-date-nav' : 'flex items-center gap-2'}>
      <button type="button" className="icon-button" onClick={() => onMove(-1)} title={`Previous ${mode}`} aria-label={`Previous ${mode}`}><ChevronLeft size={18} /></button>
      <button type="button" className={phoneRange ? 'text-button !hidden sm:!inline-flex' : 'text-button'} onClick={onToday}>Today</button>
      {phoneRange && <p aria-live="polite" className="calendar-owner-phone-range">{phoneRange}</p>}
      <button type="button" className="icon-button" onClick={() => onMove(1)} title={`Next ${mode}`} aria-label={`Next ${mode}`}><ChevronRight size={18} /></button>
    </div>
    <div className={phoneRange ? 'calendar-owner-view-nav' : undefined}>
      <div className="segmented" role="group" aria-label="Calendar view">
        {(['day', 'week', 'month'] as const).map(item => <button type="button" key={item} onClick={() => onMode(item)} className={mode === item ? 'active' : ''} aria-pressed={mode === item}>{item}</button>)}
      </div>
      {phoneRange && <button type="button" className="text-button sm:!hidden" onClick={onToday}>Today</button>}
    </div>
  </div>;
}

export function CalendarCreateActions({ onAddEvent, onAddOpening }: { onAddEvent: () => void; onAddOpening: () => void }) {
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !popup.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return <>
    <div className="hidden items-center gap-2 sm:flex">
      <button type="button" className="primary-button gap-2" onClick={onAddEvent}><Plus size={16} />Add event</button>
      <button type="button" className="text-button gap-2" onClick={onAddOpening}><Plus size={16} />Add opening</button>
    </div>
    <div ref={popup} className="calendar-owner-create relative sm:hidden">
      <button ref={trigger} type="button" className="primary-button !h-10 !w-10 !p-0" onClick={() => setOpen(value => !value)} aria-label="Add to calendar" aria-expanded={open} title="Add to calendar"><Plus size={20} /></button>
      {open && <div className="absolute right-0 top-full z-20 mt-2 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-700 dark:bg-slate-900">
        <button type="button" className="nav-item" onClick={() => { setOpen(false); onAddEvent(); }}><CalendarDays size={16} />Add event</button>
        <button type="button" className="nav-item" onClick={() => { setOpen(false); onAddOpening(); }}><CalendarPlus size={16} />Add opening</button>
      </div>}
    </div>
  </>;
}
