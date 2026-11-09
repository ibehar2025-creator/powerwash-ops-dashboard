import { useCallback, useEffect, useState } from 'react';
import { salesRequest } from './sales';
import type { SalesOpening } from './sales';

export const ownerOpeningsPath = '/api/owner/sales-openings';
const central = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
const time = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
export const dateLabel = (date: string) => weekday.format(new Date(`${date}T12:00:00Z`));
export function centralToday() {
  const parts = Object.fromEntries(central.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function shift(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function openingHours({ startTime, endTime }: SalesOpening) {
  return [startTime, endTime].map(value => time.format(new Date(`2000-01-01T${value}:00Z`))).join(' - ');
}

export function useSalesOpenings<T extends SalesOpening>(path: string | null) {
  const [openings, setOpenings] = useState<T[]>([]);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!path) return;
    try {
      const result = await salesRequest<{ openings: T[] }>(path);
      if (!signal?.aborted) { setOpenings(result.openings ?? []); setError(false); }
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    if (!path) return;
    const lifetime = new AbortController();
    const reload = () => { if (!document.hidden) void refresh(lifetime.signal); };
    void refresh(lifetime.signal);
    const timer = window.setInterval(reload, 60_000);
    window.addEventListener('focus', reload);
    return () => { lifetime.abort(); window.clearInterval(timer); window.removeEventListener('focus', reload); };
  }, [path, refresh]);
  return { openings, loading, error, refresh };
}

export function sampleOpenings(today: string): SalesOpening[] {
  return [
    { id: 'sample-opening-1', date: shift(today, 1), startTime: '09:00', endTime: '11:00' },
    { id: 'sample-opening-2', date: shift(today, 3), startTime: '13:00', endTime: '16:00' },
  ];
}
