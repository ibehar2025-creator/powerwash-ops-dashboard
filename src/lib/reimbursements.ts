import type { ReimbursementItem } from "../types/business";
export type ReimbursementDraft = { name: string; cost: string };
export function reimbursementDraft(items: ReimbursementItem[] = []): ReimbursementDraft[] {
  return items.map(item => ({ name: item.name, cost: String(item.cost) }));
}
export function reimbursementPayload(items: ReimbursementDraft[]): ReimbursementItem[] {
  if (items.length > 30) throw new Error("Add no more than 30 reimbursement items.");
  let cents = 0;
  const result = items.map(item => {
    const cost = Number(item.cost);
    if (!item.name.trim() || !item.cost.trim() || !Number.isFinite(cost) || cost <= 0 || cost > 999999.99 || Math.abs(cost * 100 - Math.round(cost * 100)) > 0.000001) throw new Error("Enter an item name and a positive cost with up to two decimal places.");
    cents += Math.round(cost * 100);
    return { name: item.name.trim(), cost };
  });
  if (cents > 99999999) throw new Error("The reimbursement total is too large.");
  return result;
}
