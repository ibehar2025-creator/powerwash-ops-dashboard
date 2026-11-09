export function LeadViewSwitch({ closed, outstandingCount, closedCount, onChange }: {
  closed: boolean;
  outstandingCount: number;
  closedCount: number;
  onChange: (closed: boolean) => void;
}) {
  return <div role="group" aria-label="Lead view" className="segmented max-w-full">
    <button type="button" className={!closed ? "active" : ""} aria-pressed={!closed} onClick={() => onChange(false)}>
      Outstanding <span aria-hidden="true" className="text-xs tabular-nums opacity-80">{outstandingCount}</span>
    </button>
    <button type="button" className={closed ? "active" : ""} aria-pressed={closed} onClick={() => onChange(true)}>
      Closed <span aria-hidden="true" className="text-xs tabular-nums opacity-80">{closedCount}</span>
    </button>
  </div>;
}
