import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarMode } from '../lib/calendar';

export function CalendarNavigation({ mode, onMode, onMove, onToday }: {
  mode: CalendarMode;
  onMode: (mode: CalendarMode) => void;
  onMove: (direction: -1 | 1) => void;
  onToday: () => void;
}) {
  return <>
    <button type="button" className="icon-button" onClick={() => onMove(-1)} title={`Previous ${mode}`} aria-label={`Previous ${mode}`}><ChevronLeft size={18} /></button>
    <button type="button" className="text-button" onClick={onToday}>Today</button>
    <button type="button" className="icon-button" onClick={() => onMove(1)} title={`Next ${mode}`} aria-label={`Next ${mode}`}><ChevronRight size={18} /></button>
    <div className="segmented" role="group" aria-label="Calendar view">
      {(['day', 'week', 'month'] as const).map(item => <button type="button" key={item} onClick={() => onMode(item)} className={mode === item ? 'active' : ''} aria-pressed={mode === item}>{item}</button>)}
    </div>
  </>;
}
