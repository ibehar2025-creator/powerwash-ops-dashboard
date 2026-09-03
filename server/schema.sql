create extension if not exists pgcrypto;

create table if not exists customers (
  id text primary key,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  subscribed_plan_id text,
  insights text[] not null default '{}',
  website_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  id text primary key,
  name text not null,
  contact text not null default '',
  address text not null default '',
  source text not null default '',
  status text not null check (status in ('new', 'contacted', 'quoted', 'scheduled', 'won', 'lost')),
  estimated_value numeric(12,2) not null default 0,
  follow_up_date date,
  notes text not null default '',
  website_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists jobs (
  id text primary key,
  date date not null,
  time text not null default '09:00',
  customer_id text not null references customers(id) on delete cascade,
  address text not null default '',
  service_type text not null default '',
  status text not null check (status in ('scheduled', 'in progress', 'completed', 'canceled', 'past due')),
  crew_ids text[] not null default '{}',
  price numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  tip_amount numeric(12,2) not null default 0,
  payment_status text not null check (payment_status in ('paid', 'unpaid', 'partially paid', 'past due')),
  payment_method text check (payment_method in ('Zelle', 'cash', 'card', 'check', 'other')),
  notes text not null default '',
  employee_instructions text not null default '',
  before_photo text,
  after_photo text,
  source text not null default 'spreadsheet-import',
  latitude double precision,
  longitude double precision,
  geocoded_address text,
  website_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists invoices (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  job_id text not null references jobs(id) on delete cascade,
  service_description text not null default '',
  price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tip numeric(12,2) not null default 0,
  payment_method text check (payment_method in ('Zelle', 'cash', 'card', 'check', 'other')),
  status text not null check (status in ('paid', 'unpaid', 'partially paid', 'past due')),
  amount_paid numeric(12,2) not null default 0,
  due_date date,
  issued_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id text primary key,
  invoice_id text not null references invoices(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  method text not null check (method in ('Zelle', 'cash', 'card', 'check', 'other')),
  date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists service_plans (
  id text primary key,
  type text not null check (type in ('monthly', '3-month', '4-month', '6-month', 'yearly')),
  customer_id text not null references customers(id) on delete cascade,
  discount_pct numeric(6,2) not null default 0,
  renewal_date date,
  services_included text[] not null default '{}',
  price numeric(12,2) not null default 0,
  payment_status text not null check (payment_status in ('paid', 'unpaid', 'partially paid', 'past due')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expenses (
  id text primary key,
  date date not null,
  category text not null default '',
  vendor text not null default '',
  amount numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reviews (
  id text primary key,
  submitted_at timestamptz not null,
  name text not null default '',
  rating integer not null default 5 check (rating between 1 and 5),
  review text not null default '',
  source text not null default 'spreadsheet-import',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists solicitations (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  solicited_date date not null default current_date,
  outcome text not null default 'no answer' check (outcome in ('visited', 'no answer', 'interested', 'follow up', 'not interested')),
  follow_up_date date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'other' check (type in ('meeting', 'soliciting', 'estimate', 'reminder', 'other')),
  date date not null,
  start_time text not null default '09:00',
  end_time text not null default '',
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_accounts (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null unique,
  name text not null,
  picture_url text not null default '',
  age integer not null check (age between 13 and 120),
  role text not null check (role in ('owner', 'employee')),
  active boolean not null default true,
  base_commission_pct numeric(6,4) not null default 0.20,
  upsell_commission_pct numeric(6,4) not null default 0.30,
  contract_bonus_pct numeric(6,4) not null default 0.10,
  tip_share_pct numeric(6,4) not null default 1.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table solicitations add column if not exists created_by uuid references user_accounts(id) on delete set null;

create table if not exists job_assignments (
  job_id text primary key references jobs(id) on delete cascade,
  employee_id uuid not null references user_accounts(id) on delete cascade,
  assigned_by uuid references user_accounts(id) on delete set null,
  original_job_price numeric(12,2) not null,
  base_commission_pct numeric(6,4) not null,
  upsell_commission_pct numeric(6,4) not null,
  contract_bonus_pct numeric(6,4) not null,
  tip_share_pct numeric(6,4) not null,
  assigned_at timestamptz not null default now()
);


create table if not exists contract_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references user_accounts(id) on delete cascade,
  job_id text references jobs(id) on delete set null,
  customer_name text not null,
  customer_phone text not null default '',
  customer_email text not null default '',
  service_address text not null default '',
  service_description text not null default '',
  frequency text not null,
  related_job text not null default '',
  price numeric(12,2) not null check (price >= 0),
  notes text not null default '',
  agreement_text text not null default '',
  signer_name text not null default '',
  signature_data text not null default '',
  electronic_consent boolean not null default false,
  signed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  owner_note text not null default '',
  reviewed_by uuid references user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists earning_submissions (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references jobs(id) on delete cascade,
  employee_id uuid not null references user_accounts(id) on delete cascade,
  tip_amount numeric(12,2) not null default 0 check (tip_amount >= 0),
  upsell_amount numeric(12,2) not null default 0 check (upsell_amount >= 0),
  upsell_description text not null default '',
  upsell_outcome text not null default '' check (upsell_outcome in ('', 'accepted', 'declined', 'follow-up')),
  upsell_quoted_amount numeric(12,2) not null default 0 check (upsell_quoted_amount >= 0),
  upsell_notes text not null default '',
  contract_submission_id uuid references contract_submissions(id) on delete set null,
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected', 'paid')),
  owner_note text not null default '',
  reviewed_by uuid references user_accounts(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, employee_id)
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references user_accounts(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  earning_ids uuid[] not null default '{}',
  paid_by uuid references user_accounts(id) on delete set null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  payday date not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'paid')),
  created_by uuid references user_accounts(id) on delete set null,
  finalized_by uuid references user_accounts(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_start, period_end)
);

create table if not exists payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references user_accounts(id) on delete restrict,
  job_id text references jobs(id) on delete restrict,
  earning_submission_id uuid references earning_submissions(id) on delete set null,
  source_key text not null unique,
  line_type text not null check (line_type in ('commission', 'upsell', 'contract_bonus', 'tip')),
  description text not null,
  customer_name text not null default '',
  work_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references user_accounts(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('addition', 'deduction')),
  category text not null check (category in ('bonus', 'reimbursement', 'deduction', 'correction', 'other')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid references user_accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists payroll_payments (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete restrict,
  employee_id uuid not null references user_accounts(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method text not null check (payment_method in ('bank', 'check')),
  reference text not null default '',
  note text not null default '',
  paid_at timestamptz not null,
  recorded_by uuid references user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

create index if not exists payroll_runs_status_idx on payroll_runs(status, period_start desc);
create index if not exists payroll_lines_run_employee_idx on payroll_run_lines(payroll_run_id, employee_id);
create index if not exists payroll_adjustments_run_employee_idx on payroll_adjustments(payroll_run_id, employee_id);
create index if not exists payroll_payments_run_employee_idx on payroll_payments(payroll_run_id, employee_id);

update user_accounts set upsell_commission_pct = 0.30
where role = 'employee' and upsell_commission_pct is distinct from 0.30;

update job_assignments ja set upsell_commission_pct = 0.30
where ja.upsell_commission_pct is distinct from 0.30
  and not exists (select 1 from payroll_run_lines prl where prl.source_key = ja.job_id || ':upsell');

alter table payroll_runs enable row level security;
alter table payroll_run_lines enable row level security;
alter table payroll_adjustments enable row level security;
alter table payroll_payments enable row level security;

create table if not exists activity_log (
  id bigserial primary key,
  actor_id uuid references user_accounts(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists job_assignments_employee_idx on job_assignments(employee_id);
create index if not exists contract_submissions_status_idx on contract_submissions(status, created_at desc);
create index if not exists earning_submissions_employee_idx on earning_submissions(employee_id, status);
create index if not exists jobs_customer_idx on jobs(customer_id);
create index if not exists invoices_customer_idx on invoices(customer_id);
create index if not exists invoices_job_idx on invoices(job_id);
create index if not exists service_plans_customer_idx on service_plans(customer_id);
create index if not exists activity_log_actor_idx on activity_log(actor_id);
create index if not exists contract_submissions_employee_idx on contract_submissions(employee_id);
create index if not exists contract_submissions_job_idx on contract_submissions(job_id);
create index if not exists solicitations_created_by_idx on solicitations(created_by);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_expires_at_idx on auth_sessions(expires_at);
create index if not exists auth_sessions_user_idx on auth_sessions(user_id);

create table if not exists notification_reads (
  user_id uuid not null references user_accounts(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create table if not exists manager_issues (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references user_accounts(id) on delete cascade,
  message text not null,
  page_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists manager_issues_created_at_idx on manager_issues(created_at desc);
alter table manager_issues enable row level security;

create table if not exists business_settings (
  id text primary key default 'default',
  business_name text not null default 'The Powerwashing Pros',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  default_invoice_message text not null default '',
  default_tax_rate numeric(8,4) not null default 0,
  default_discount_pct numeric(8,4) not null default 0,
  default_commission_pct numeric(8,4) not null default 0,
  payment_methods text[] not null default '{}',
  service_types text[] not null default '{}',
  theme text not null default 'light',
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers',
    'leads',
    'jobs',
    'invoices',
    'payments',
    'service_plans',
    'expenses',
    'reviews',
    'solicitations',
    'calendar_events',
    'user_accounts',
    'contract_submissions',
    'earning_submissions',
    'payroll_runs',
    'business_settings'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on %I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;
