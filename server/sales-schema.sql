alter table user_accounts drop constraint if exists user_accounts_role_check;
alter table user_accounts add constraint user_accounts_role_check check (role in ('owner','employee','salesman'));
alter table leads add column if not exists created_by uuid references user_accounts(id);
alter table leads add column if not exists converted_job_id text;
alter table earning_submissions add column if not exists applied_upsell_amount numeric(12,2) not null default 0;
update earning_submissions set applied_upsell_amount = upsell_amount where status in ('approved','paid') and applied_upsell_amount = 0;

create table if not exists sales_bookings (
  request_id uuid primary key,
  salesman_id uuid not null references user_accounts(id),
  job_id text not null unique,
  customer_id text not null,
  payload jsonb not null,
  customer_synced boolean not null default false,
  job_synced boolean not null default false,
  saved boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists sales_credits (
  id uuid primary key default gen_random_uuid(),
  job_id text not null unique references jobs(id) on delete restrict,
  salesman_id uuid not null references user_accounts(id),
  rate numeric(5,4) not null default 0.20 check (rate = 0.20),
  service_price numeric(12,2) not null default 0 check (service_price >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'estimated' check (status in ('estimated','pending','approved','rejected','paid','canceled')),
  owner_note text not null default '',
  reviewed_by uuid references user_accounts(id),
  reviewed_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists sales_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_accounts(id),
  job_id text,
  title text not null,
  detail text not null,
  created_at timestamptz not null default now()
);
create index if not exists sales_credits_person_idx on sales_credits(salesman_id,status);
create index if not exists sales_credits_reviewer_idx on sales_credits(reviewed_by);
create index if not exists sales_bookings_person_idx on sales_bookings(salesman_id);
create index if not exists sales_leads_person_idx on leads(created_by,follow_up_date);
create index if not exists sales_notifications_person_idx on sales_notifications(user_id,created_at desc);
alter table payroll_run_lines add column if not exists sales_credit_id uuid references sales_credits(id) on delete restrict;
create unique index if not exists payroll_sales_credit_idx on payroll_run_lines(sales_credit_id) where sales_credit_id is not null;
alter table payroll_run_lines drop constraint if exists payroll_run_lines_line_type_check;
alter table payroll_run_lines add constraint payroll_run_lines_line_type_check check (line_type in ('commission','upsell','contract_bonus','tip','gas_reimbursement','sales_commission','reimbursement'));
alter table sales_bookings enable row level security;
alter table sales_credits enable row level security;
alter table sales_notifications enable row level security;
revoke all on sales_bookings,sales_credits,sales_notifications from anon,authenticated;
drop policy if exists deny_browser_access on sales_bookings;
create policy deny_browser_access on sales_bookings for all to anon,authenticated using(false) with check(false);
drop policy if exists deny_browser_access on sales_credits;
create policy deny_browser_access on sales_credits for all to anon,authenticated using(false) with check(false);
drop policy if exists deny_browser_access on sales_notifications;
create policy deny_browser_access on sales_notifications for all to anon,authenticated using(false) with check(false);

create or replace function refresh_sales_credit(p_job_id text) returns void
language plpgsql set search_path = public as $$
declare j jobs; credit sales_credits; basis numeric;
begin
  select * into j from jobs where id = p_job_id;
  select greatest(0,j.price-coalesce(sum(applied_upsell_amount),0)) into basis from earning_submissions where job_id = p_job_id;
  update job_assignments ja set original_job_price=basis where ja.job_id=p_job_id
    and not exists(select 1 from earning_submissions where job_id=p_job_id and status in ('approved','paid'))
    and not exists(select 1 from payroll_run_lines where job_id=p_job_id and line_type<>'sales_commission');
  select * into credit from sales_credits where job_id = p_job_id for update;
  if not found then return; end if;
  if credit.status in ('approved','paid','rejected') then return; end if;
  update sales_credits set service_price = basis,
    amount = case when j.status = 'canceled' then 0 else round(basis*rate,2) end,
    status = case when j.status = 'canceled' then 'canceled' when j.status = 'completed' then 'pending' else 'estimated' end,
    updated_at = now()
  where id = credit.id and (service_price,amount,status) is distinct from
    (basis,case when j.status = 'canceled' then 0 else round(basis*rate,2) end,
     case when j.status = 'canceled' then 'canceled' when j.status = 'completed' then 'pending' else 'estimated' end);
end $$;
create or replace function sales_job_changed() returns trigger
language plpgsql set search_path = public as $$
declare recipient uuid;
begin
  perform refresh_sales_credit(new.id);
  select salesman_id into recipient from sales_credits where job_id = new.id;
  if recipient is not null and (new.status,new.price,new.date,new.time,new.address,new.service_type,new.employee_instructions) is distinct from
    (old.status,old.price,old.date,old.time,old.address,old.service_type,old.employee_instructions) then
    insert into sales_notifications(user_id,job_id,title,detail) values
      (recipient,new.id,'Job updated',new.address||' - '||new.status||' - '||new.date||' at '||new.time);
  end if;
  return new;
end $$;
drop trigger if exists sales_job_changed on jobs;
create trigger sales_job_changed after update on jobs for each row execute function sales_job_changed();
create or replace function sales_upsell_changed() returns trigger
language plpgsql set search_path = public as $$
begin perform refresh_sales_credit(new.job_id); return new; end $$;
drop trigger if exists sales_upsell_changed on earning_submissions;
create trigger sales_upsell_changed after insert or update of applied_upsell_amount on earning_submissions for each row execute function sales_upsell_changed();
revoke execute on function refresh_sales_credit(text),sales_job_changed(),sales_upsell_changed() from public,anon,authenticated;
