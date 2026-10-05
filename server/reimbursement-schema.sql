alter table earning_submissions add column if not exists reimbursement_items jsonb not null default '[]'::jsonb;
create table if not exists reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references user_accounts(id) on delete restrict,
  request_id uuid not null,
  expense_date date not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  amount numeric(12,2) not null check (amount > 0),
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  owner_note text not null default '',
  reviewed_by uuid references user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(employee_id, request_id)
);
create index if not exists reimbursement_employee_idx on reimbursement_requests(employee_id, created_at desc);
alter table reimbursement_requests enable row level security;
revoke all on reimbursement_requests from anon, authenticated;
alter table payroll_run_lines add column if not exists reimbursement_request_id uuid references reimbursement_requests(id) on delete restrict;
alter table payouts add column if not exists reimbursement_ids uuid[] not null default '{}';
alter table payroll_run_lines drop constraint if exists payroll_run_lines_line_type_check;
alter table payroll_run_lines add constraint payroll_run_lines_line_type_check check
  (line_type in ('commission','upsell','contract_bonus','tip','gas_reimbursement','sales_commission','reimbursement'));
