import { BadgeDollarSign, Printer } from "lucide-react";
import { currency } from "../lib/calculations";
import type { PayrollRun } from "../types/business";

export function EmployeePayrollStatements({ statements }: { statements: PayrollRun[] }) {
  if (!statements.length) return null;
  return <div className="space-y-3"><div className="flex items-center gap-2"><BadgeDollarSign className="text-lagoon" size={19} /><h3 className="font-semibold text-ink dark:text-white">Weekly earnings statements</h3></div>{statements.map((statement) => <Statement key={statement.id} statement={statement} />)}</div>;
}

function printStatement(id: string) {
  const statement = document.getElementById(`payroll-statement-${id}`);
  const popup = window.open("", "_blank", "width=900,height=720");
  if (!statement || !popup) return;
  popup.document.write(`<!doctype html><html><head><title>Earnings statement</title><style>body{font-family:Arial,sans-serif;color:#172033;padding:32px}button{display:none}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th:last-child,td:last-child{text-align:right}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}strong{display:block}@media print{body{padding:0}}</style></head><body>${statement.outerHTML}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 200);
}

function Statement({ statement }: { statement: PayrollRun }) {
  const payment = statement.payments[0];
  return <section id={`payroll-statement-${statement.id}`} className="payroll-statement rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase text-lagoon">Internal earnings statement · not a tax pay stub</p><h4 className="font-semibold text-ink dark:text-white">{statement.periodStart} – {statement.periodEnd}</h4><p className="text-xs text-slate-500">Scheduled payday {statement.payday} · {statement.status}</p></div><button className="text-button gap-2 print:hidden" onClick={() => printStatement(statement.id)}><Printer size={15} />Print / download PDF</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th className="py-2">Date</th><th>Type</th><th>Description</th><th className="text-right">Amount</th></tr></thead><tbody>{statement.lines.map((line) => <tr key={line.id} className="border-t dark:border-slate-700"><td className="py-2">{line.workDate}</td><td className="capitalize">{line.lineType.replaceAll("_", " ")}</td><td>{line.customerName} · {line.description}</td><td className="text-right">{currency.format(line.amount)}</td></tr>)}{statement.adjustments.map((item) => <tr key={item.id} className="border-t dark:border-slate-700"><td className="py-2">—</td><td className="capitalize">{item.category}</td><td>{item.description}</td><td className="text-right">{item.adjustmentType === "deduction" ? "−" : "+"}{currency.format(item.amount)}</td></tr>)}</tbody></table></div><div className="mt-4 grid gap-2 border-t pt-3 text-sm dark:border-slate-700 sm:grid-cols-4"><span>Gross <strong className="block">{currency.format(statement.grossEarnings + statement.totalAdditions)}</strong></span><span>Deductions <strong className="block">{currency.format(statement.totalDeductions)}</strong></span><span>Recorded amount <strong className="block">{currency.format(statement.netPay)}</strong></span><span>Status <strong className="block capitalize">{statement.status}</strong></span></div>{payment && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Payment recorded {payment.paidAt.slice(0, 10)} by {payment.paymentMethod}{payment.reference ? ` · ${payment.reference}` : ""}</p>}<p className="mt-3 text-xs text-slate-400">This statement does not calculate withholding, payroll taxes, or legal wage compliance.</p></section>;
}
