export type CalendarMode = "day" | "week" | "month";
type CalendarDay = { label: string; date: string };

const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
export const fullDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function dateFromIso(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isoFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
}

function startOfWeek(date: Date) {
  const dayIndex = date.getDay();
  return addDays(date, dayIndex === 0 ? -6 : 1 - dayIndex);
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function calendarLabel(date: Date, mode: CalendarMode) {
  if (mode === "day") return fullDateFormatter.format(date);
  if (mode === "month") return monthFormatter.format(date);
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  return `${fullDateFormatter.format(weekStart)} - ${fullDateFormatter.format(weekEnd)}`;
}

export function calendarDays(anchorDate: Date, mode: CalendarMode): CalendarDay[] {
  if (mode === "day") return [{ label: dayFormatter.format(anchorDate), date: isoFromDate(anchorDate) }];
  if (mode === "week") {
    const weekStart = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return { label: `${dayFormatter.format(date)} ${date.getDate()}`, date: isoFromDate(date) };
    });
  }
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  return Array.from({ length: daysInMonth(monthStart) }, (_, index) => {
    const date = addDays(monthStart, index);
    return { label: `${dayFormatter.format(date)} ${date.getDate()}`, date: isoFromDate(date) };
  });
}

export function moveCalendarDate(anchor: string, mode: CalendarMode, direction: -1 | 1) {
  const date = dateFromIso(anchor);
  return isoFromDate(mode === "month" ? addMonths(date, direction) : addDays(date, direction * (mode === "week" ? 7 : 1)));
}
