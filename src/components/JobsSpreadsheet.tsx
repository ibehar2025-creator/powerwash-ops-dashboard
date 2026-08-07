import { ExternalLink, Pencil, Plus } from "lucide-react";
import { currency } from "../lib/calculations";
import type { Customer, Job } from "../types/business";

const upcomingJobsSheetUrl = "https://docs.google.com/spreadsheets/d/19LNiR-1HTfT8wwdAZtGnqXlCJh6y-HbxeuqZuo95p2Q/edit#gid=0";

function importedRowNumber(job: Job) {
  const match = job.id.match(/^sheet-job-(\d+)$/);
  return match ? Number(match[1]) + 1 : null;
}

function originalDate(job: Job) {
  const marker = "Original date: ";
  const start = job.notes.indexOf(marker);
  if (start >= 0 && !job.websiteEditedFields?.some((field) => field === "date" || field === "time")) {
    return job.notes.slice(start + marker.length).replace(/\.$/, "");
  }
  return `${job.date}${job.time ? ` ${job.time}` : ""}`;
}

function spreadsheetStatus(job: Job) {
  if (!job.websiteEditedFields?.includes("status")) {
    const match = job.notes.match(/Spreadsheet status:\s*([^.]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  if (job.status === "completed") return "Complete";
  if (job.status === "scheduled") return "Incomplete";
  return job.status.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "complete" || normalized === "completed") return "sheet-status complete";
  if (normalized === "canceled") return "sheet-status canceled";
  return "sheet-status incomplete";
}

function customerName(job: Job, customers: Customer[]) {
  const customer = customers.find((item) => item.id === job.customerId);
  if (job.source === "spreadsheet-import" && customer?.name === "Customer" && !job.address) return "";
  return customer?.name ?? "";
}

function websiteNotes(job: Job) {
  if (job.source === "spreadsheet-import" && !job.websiteEditedFields?.includes("notes") && job.notes.startsWith("Spreadsheet status:")) return "";
  return job.notes;
}

export function JobsSpreadsheet({ customers, jobs, onAddJob, onEditJob }: {
  customers: Customer[];
  jobs: Job[];
  onAddJob: () => void;
  onEditJob: (job: Job) => void;
}) {
  const importedJobs = jobs
    .filter((job) => job.source === "spreadsheet-import")
    .sort((a, b) => (importedRowNumber(a) ?? 0) - (importedRowNumber(b) ?? 0));
  const websiteJobs = jobs
    .filter((job) => job.source !== "spreadsheet-import")
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const rows = [...importedJobs, ...websiteJobs];

  function rowNumber(job: Job, index: number) {
    return importedRowNumber(job) ?? importedJobs.length + (index - importedJobs.length) + 2;
  }

  return (
    <section className="mx-auto w-full max-w-[1500px] rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold uppercase text-lagoon dark:text-cyan-300">Upcoming Jobs spreadsheet</p>
          <h2 className="text-xl font-semibold text-ink dark:text-white">Jobs</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{importedJobs.length} spreadsheet rows{websiteJobs.length ? ` and ${websiteJobs.length} website jobs` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="text-button gap-2" href={upcomingJobsSheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open sheet</a>
          <button type="button" className="primary-button gap-2" onClick={onAddJob}><Plus size={16} />Add job</button>
        </div>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="jobs-sheet-table">
          <thead><tr><th className="row-number">1</th><th>Column 1</th><th>Address</th><th>Date</th><th>Price</th><th>Status</th><th>Notes</th><th>Website Notes</th><th className="edit-column"><span className="sr-only">Edit</span></th></tr></thead>
          <tbody>{rows.map((job, index) => { const sheetRow = rowNumber(job, index); const status = spreadsheetStatus(job); return <tr key={job.id}><th className="row-number" scope="row">{sheetRow}</th><td>{customerName(job, customers)}</td><td>{job.address}</td><td>{originalDate(job)}</td><td>{job.price ? currency.format(job.price) : ""}</td><td><span className={statusClass(status)}>{status}</span></td><td>{job.serviceType}</td><td>{websiteNotes(job)}</td><td className="edit-column"><button type="button" className="icon-button" aria-label={`Edit spreadsheet row ${sheetRow}`} title="Edit job" onClick={() => onEditJob(job)}><Pencil size={15} /></button></td></tr>; })}</tbody>
        </table>
      </div>

      <div className="jobs-sheet-mobile divide-y divide-slate-200 md:hidden dark:divide-slate-800">
        {rows.map((job, index) => { const sheetRow = rowNumber(job, index); const status = spreadsheetStatus(job); const notes = websiteNotes(job); return <button key={job.id} type="button" className="block w-full p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60" onClick={() => onEditJob(job)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-400">Row {sheetRow}</p>{customerName(job, customers) && <p className="truncate font-semibold text-ink dark:text-white">{customerName(job, customers)}</p>}{job.address && <p className="mt-1 text-sm text-slate-500">{job.address}</p>}</div><Pencil className="shrink-0 text-slate-400" size={16} /></div><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><div><dt>Date</dt><dd>{originalDate(job)}</dd></div><div><dt>Price</dt><dd>{job.price ? currency.format(job.price) : ""}</dd></div><div><dt>Status</dt><dd><span className={statusClass(status)}>{status}</span></dd></div><div><dt>Service</dt><dd>{job.serviceType}</dd></div>{notes && <div className="col-span-2"><dt>Website notes</dt><dd>{notes}</dd></div>}</dl></button>; })}
      </div>
    </section>
  );
}
