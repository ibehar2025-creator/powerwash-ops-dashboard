export type FollowUpTiming = "overdue" | "today" | "upcoming" | "later" | "unscheduled";

export function followUpTiming(followUpDate: string, currentDate: string): FollowUpTiming {
  if (!followUpDate) return "unscheduled";
  if (followUpDate < currentDate) return "overdue";
  if (followUpDate === currentDate) return "today";
  const current = new Date(`${currentDate}T12:00:00`);
  const followUp = new Date(`${followUpDate}T12:00:00`);
  const daysAway = Math.round((followUp.getTime() - current.getTime()) / 86_400_000);
  return daysAway <= 7 ? "upcoming" : "later";
}

export function followUpLabel(timing: FollowUpTiming) {
  if (timing === "unscheduled") return "No date";
  if (timing === "later") return "Later";
  return timing[0].toUpperCase() + timing.slice(1);
}
