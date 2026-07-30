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
  before_photo text,
  after_photo text,
  source text not null default 'spreadsheet-import',
  latitude double precision,
  longitude double precision,
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
  type text not null check (type in ('monthly', '3-month', '6-month', 'yearly')),
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
  outcome text not null default 'visited' check (outcome in ('visited', 'no answer', 'interested', 'follow up', 'not interested')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
$$ language plpgsql;

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
    'business_settings'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on %I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;
