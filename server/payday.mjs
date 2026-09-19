export function previousWeeklyPayPeriod(todayIso) {
  const today = new Date(`${todayIso}T12:00:00Z`);
  const periodEnd = new Date(today);
  periodEnd.setUTCDate(today.getUTCDate() - 2);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodEnd.getUTCDate() - 6);
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    payday: todayIso,
  };
}
