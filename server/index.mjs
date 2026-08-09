import express from "express";
import cors from "cors";
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 4173);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distPath = path.join(projectRoot, "dist");
const syncUrl = process.env.SHEETS_SYNC_URL || process.env.VITE_SHEETS_SYNC_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const signupAccessCode = process.env.AUTH_SIGNUP_CODE || "";
const employeeAccessCode = process.env.AUTH_EMPLOYEE_CODE || signupAccessCode;
const ownerAccessCode = process.env.AUTH_OWNER_CODE || signupAccessCode;
const sessionCookieName = "powerwash_session";
const authStateCookieName = "powerwash_auth_state";
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
let activeSheetSync = null;
let googleCertCache = { expiresAt: 0, keys: [] };

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

async function ensureMapSchema() {
  if (!pool) return;
  await pool.query(`
    alter table jobs add column if not exists latitude double precision;
    alter table jobs add column if not exists longitude double precision;
    alter table jobs add column if not exists geocoded_address text;
    alter table jobs add column if not exists website_overrides jsonb not null default '{}'::jsonb;
    alter table leads add column if not exists website_overrides jsonb not null default '{}'::jsonb;
    alter table customers add column if not exists website_overrides jsonb not null default '{}'::jsonb;

    alter table service_plans drop constraint if exists service_plans_type_check;
    alter table service_plans add constraint service_plans_type_check
      check (type in ('monthly', '3-month', '4-month', '6-month', 'yearly'));

    update jobs
    set latitude = null, longitude = null
    where geocoded_address is null and (latitude is not null or longitude is not null);

    delete from jobs where id = 'manual-job-919ceff4-f534-422a-9d7b-d2eadcbeb2b5';
    delete from customers where id = 'manual-customer-eed7d291-ad25-4d10-a330-a918df033120';

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

    alter table solicitations add column if not exists follow_up_date date;
    alter table solicitations alter column outcome set default 'no answer';

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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_login_at timestamptz not null default now()
    );

    create table if not exists auth_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references user_accounts(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create index if not exists auth_sessions_expires_at_idx on auth_sessions(expires_at);

    create table if not exists notification_reads (
      user_id uuid not null references user_accounts(id) on delete cascade,
      notification_key text not null,
      read_at timestamptz not null default now(),
      primary key (user_id, notification_key)
    );

    alter table user_accounts add column if not exists active boolean not null default true;
    alter table user_accounts add column if not exists base_commission_pct numeric(6,4) not null default 0.20;
    alter table user_accounts add column if not exists upsell_commission_pct numeric(6,4) not null default 0.30;
    alter table user_accounts add column if not exists contract_bonus_pct numeric(6,4) not null default 0.10;
    alter table user_accounts add column if not exists tip_share_pct numeric(6,4) not null default 1.00;
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
      frequency text not null,
      price numeric(12,2) not null check (price >= 0),
      notes text not null default '',
      status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
      owner_note text not null default '',
      reviewed_by uuid references user_accounts(id) on delete set null,
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table contract_submissions drop constraint if exists contract_submissions_frequency_check;
    alter table contract_submissions add column if not exists customer_phone text not null default '';
    alter table contract_submissions add column if not exists customer_email text not null default '';
    alter table contract_submissions add column if not exists service_address text not null default '';
    alter table contract_submissions add column if not exists service_description text not null default '';
    alter table contract_submissions add column if not exists related_job text not null default '';
    alter table contract_submissions add column if not exists agreement_text text not null default '';
    alter table contract_submissions add column if not exists signer_name text not null default '';
    alter table contract_submissions add column if not exists signature_data text not null default '';
    alter table contract_submissions add column if not exists electronic_consent boolean not null default false;
    alter table contract_submissions add column if not exists signed_at timestamptz;

    create table if not exists earning_submissions (
      id uuid primary key default gen_random_uuid(),
      job_id text not null references jobs(id) on delete cascade,
      employee_id uuid not null references user_accounts(id) on delete cascade,
      tip_amount numeric(12,2) not null default 0 check (tip_amount >= 0),
      upsell_amount numeric(12,2) not null default 0 check (upsell_amount >= 0),
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

    insert into leads (id, name, contact, address, source, status, estimated_value, follow_up_date, notes)
    select
      'solicitation-' || id::text,
      'Map follow-up',
      'Contact info pending',
      address,
      'Map solicitation',
      'new',
      0,
      follow_up_date,
      notes
    from solicitations
    where outcome = 'follow up'
    on conflict (id) do nothing;
  `);
}

app.use(cors());
app.use((_request, response, next) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "2mb" }));

function requireDatabase(_req, res, next) {
  if (!pool) {
    res.status(503).json({ error: "DATABASE_URL is not configured." });
    return;
  }
  next();
}

const toCustomer = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  address: row.address,
  notes: row.notes,
  subscribedPlanId: row.subscribed_plan_id ?? undefined,
  insights: row.insights ?? [],
  websiteEditedFields: Object.keys(row.website_overrides ?? {}),
});

const toLead = (row) => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  address: row.address,
  source: row.source,
  status: row.status,
  estimatedValue: Number(row.estimated_value),
  followUpDate: row.follow_up_date?.toISOString?.().slice(0, 10) ?? row.follow_up_date ?? "",
  notes: row.notes,
  websiteEditedFields: Object.keys(row.website_overrides ?? {}),
});

const toJob = (row) => ({
  id: row.id,
  date: row.date?.toISOString?.().slice(0, 10) ?? row.date,
  time: row.time,
  customerId: row.customer_id,
  address: row.address,
  serviceType: row.service_type,
  status: row.status,
  crewIds: row.crew_ids ?? [],
  price: Number(row.price),
  amountPaid: Number(row.amount_paid),
  tipAmount: Number(row.tip_amount),
  paymentStatus: row.payment_status,
  paymentMethod: row.payment_method ?? undefined,
  notes: row.notes,
  beforePhoto: row.before_photo ?? undefined,
  afterPhoto: row.after_photo ?? undefined,
  source: row.source,
  latitude: row.latitude == null ? undefined : Number(row.latitude),
  longitude: row.longitude == null ? undefined : Number(row.longitude),
  websiteEditedFields: Object.keys(row.website_overrides ?? {}),
});

const toInvoice = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  jobId: row.job_id,
  serviceDescription: row.service_description,
  price: Number(row.price),
  discount: Number(row.discount),
  tip: Number(row.tip),
  paymentMethod: row.payment_method ?? undefined,
  status: row.status,
  amountPaid: Number(row.amount_paid),
  dueDate: row.due_date?.toISOString?.().slice(0, 10) ?? row.due_date,
  issuedDate: row.issued_date?.toISOString?.().slice(0, 10) ?? row.issued_date,
});

const toServicePlan = (row) => ({
  id: row.id,
  type: row.type,
  customerId: row.customer_id,
  discountPct: Number(row.discount_pct),
  renewalDate: row.renewal_date?.toISOString?.().slice(0, 10) ?? row.renewal_date ?? "Not listed",
  servicesIncluded: row.services_included ?? [],
  price: Number(row.price),
  paymentStatus: row.payment_status,
  notes: row.notes,
});

const toReview = (row) => ({
  id: row.id,
  submittedAt: row.submitted_at?.toISOString?.() ?? row.submitted_at,
  name: row.name,
  rating: Number(row.rating),
  review: row.review,
  source: row.source,
});

const toSolicitation = (row) => ({
  id: row.id,
  address: row.address,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  solicitedDate: row.solicited_date?.toISOString?.().slice(0, 10) ?? row.solicited_date,
  outcome: row.outcome,
  followUpDate: row.follow_up_date?.toISOString?.().slice(0, 10) ?? row.follow_up_date ?? "",
  notes: row.notes,
  createdBy: row.created_by ?? undefined,
});

const toEmployeeProfile = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  pictureUrl: row.picture_url,
  active: row.active,
  baseCommissionPct: Number(row.base_commission_pct),
  upsellCommissionPct: Number(row.upsell_commission_pct),
  contractBonusPct: Number(row.contract_bonus_pct),
  tipSharePct: Number(row.tip_share_pct),
});

const toAssignment = (row) => ({
  jobId: row.job_id,
  employeeId: row.employee_id,
  employeeName: row.employee_name ?? "Employee",
  originalJobPrice: Number(row.original_job_price),
  baseCommissionPct: Number(row.base_commission_pct),
  upsellCommissionPct: Number(row.upsell_commission_pct),
  contractBonusPct: Number(row.contract_bonus_pct),
  tipSharePct: Number(row.tip_share_pct),
  assignedAt: row.assigned_at?.toISOString?.() ?? row.assigned_at,
});

function earningAmounts(row) {
  const original = Number(row.original_job_price || 0);
  const tip = Number(row.tip_amount || 0);
  const upsell = Number(row.upsell_amount || 0);
  const baseEarnings = original * Number(row.base_commission_pct || 0);
  const upsellEarnings = upsell * Number(row.upsell_commission_pct || 0);
  const contractEarnings = row.contract_submission_id ? original * Number(row.contract_bonus_pct || 0) : 0;
  const tipEarnings = tip * Number(row.tip_share_pct || 0);
  return { baseEarnings, upsellEarnings, contractEarnings, tipEarnings, totalEarnings: baseEarnings + upsellEarnings + contractEarnings + tipEarnings };
}

const toEarning = (row) => ({
  id: row.id,
  jobId: row.job_id,
  employeeId: row.employee_id,
  employeeName: row.employee_name ?? "Employee",
  customerName: row.customer_name ?? "Customer",
  jobDate: row.job_date?.toISOString?.().slice(0, 10) ?? row.job_date,
  originalJobPrice: Number(row.original_job_price || 0),
  tipAmount: Number(row.tip_amount),
  upsellAmount: Number(row.upsell_amount),
  contractSold: Boolean(row.contract_submission_id),
  status: row.status,
  ownerNote: row.owner_note,
  ...earningAmounts(row),
  submittedAt: row.created_at?.toISOString?.() ?? row.created_at,
  reviewedAt: row.reviewed_at?.toISOString?.() ?? row.reviewed_at ?? undefined,
  paidAt: row.paid_at?.toISOString?.() ?? row.paid_at ?? undefined,
});

const toContract = (row) => ({
  id: row.id,
  employeeId: row.employee_id,
  employeeName: row.employee_name ?? "Employee",
  jobId: row.job_id ?? undefined,
  customerName: row.customer_name,
  customerPhone: row.customer_phone ?? "",
  customerEmail: row.customer_email ?? "",
  serviceAddress: row.service_address ?? "",
  serviceDescription: row.service_description ?? "",
  frequency: row.frequency,
  relatedJob: row.related_job ?? "",
  price: Number(row.price),
  notes: row.notes,
  agreementText: row.agreement_text ?? "",
  signerName: row.signer_name ?? "",
  signatureData: row.signature_data ?? "",
  electronicConsent: Boolean(row.electronic_consent),
  signedAt: row.signed_at?.toISOString?.() ?? row.signed_at ?? "",
  status: row.status,
  ownerNote: row.owner_note,
  createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  reviewedAt: row.reviewed_at?.toISOString?.() ?? row.reviewed_at ?? undefined,
});

const toCalendarEvent = (row) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  date: row.date?.toISOString?.().slice(0, 10) ?? row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  location: row.location,
  notes: row.notes,
});

const solicitationLeadId = (solicitationId) => `solicitation-${solicitationId}`;

async function syncSolicitationLead(client, solicitation) {
  const leadId = solicitationLeadId(solicitation.id);
  if (solicitation.outcome !== "follow up") {
    await client.query("delete from leads where id = $1 and source = 'Map solicitation'", [leadId]);
    return null;
  }

  const result = await client.query(
    `insert into leads (id, name, contact, address, source, status, estimated_value, follow_up_date, notes)
     values ($1, 'Map follow-up', 'Contact info pending', $2, 'Map solicitation', 'new', 0, $3, $4)
     on conflict (id) do update set
       address = case when leads.website_overrides ? 'address' then leads.address else excluded.address end,
       source = excluded.source,
       follow_up_date = case when leads.website_overrides ? 'followUpDate' then leads.follow_up_date else excluded.follow_up_date end,
       notes = case when leads.website_overrides ? 'notes' then leads.notes else excluded.notes end,
       updated_at = now()
     returning *`,
    [leadId, solicitation.address, solicitation.follow_up_date, solicitation.notes || ""],
  );
  return toLead(result.rows[0]);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));
}

function cookie(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  if (typeof maxAge === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`);
  return parts.join("; ");
}

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const encodeBase64Url = (value) => Buffer.from(value, "base64url");

async function googleSigningKeys() {
  if (googleCertCache.expiresAt > Date.now() && googleCertCache.keys.length) return googleCertCache.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Unable to verify Google sign-in right now.");
  const payload = await response.json();
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] || 3600);
  googleCertCache = { keys: payload.keys || [], expiresAt: Date.now() + maxAge * 1000 };
  return googleCertCache.keys;
}

async function verifyGoogleCredential(credential) {
  if (!googleClientId) throw new Error("Google sign-in is not configured.");
  const parts = String(credential || "").split(".");
  if (parts.length !== 3) throw new Error("Google sign-in did not return a valid credential.");
  const header = JSON.parse(encodeBase64Url(parts[0]).toString("utf8"));
  const claims = JSON.parse(encodeBase64Url(parts[1]).toString("utf8"));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Google credential.");
  const key = (await googleSigningKeys()).find((item) => item.kid === header.kid);
  if (!key) {
    googleCertCache.expiresAt = 0;
    throw new Error("Google's signing key could not be verified. Please try again.");
  }
  const validSignature = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: "jwk" }), encodeBase64Url(parts[2]));
  const now = Math.floor(Date.now() / 1000);
  const validIssuer = claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com";
  const validAudience = Array.isArray(claims.aud) ? claims.aud.includes(googleClientId) : claims.aud === googleClientId;
  if (!validSignature || !validIssuer || !validAudience || Number(claims.exp) <= now || !claims.sub || !claims.email || claims.email_verified !== true) {
    throw new Error("Google could not verify this account.");
  }
  return { googleSub: claims.sub, email: claims.email.toLowerCase(), name: claims.name || claims.email, pictureUrl: claims.picture || "" };
}

const toAuthUser = (row) => ({ id: row.id, email: row.email, name: row.name, pictureUrl: row.picture_url, age: row.age, role: row.role });

async function createSession(res, userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDurationMs);
  await pool.query("delete from auth_sessions where expires_at <= now()");
  await pool.query("insert into auth_sessions (user_id, token_hash, expires_at) values ($1, $2, $3)", [userId, hashToken(token), expiresAt]);
  res.setHeader("Set-Cookie", cookie(sessionCookieName, token, { maxAge: sessionDurationMs }));
}

async function sessionUser(req) {
  const token = parseCookies(req)[sessionCookieName];
  if (!token || !pool) return null;
  const result = await pool.query(
    `select user_accounts.* from auth_sessions
     join user_accounts on user_accounts.id = auth_sessions.user_id
     where auth_sessions.token_hash = $1 and auth_sessions.expires_at > now() and user_accounts.active = true`,
    [hashToken(token)],
  );
  return result.rows[0] || null;
}

function requireOwner(req, res, next) {
  if (req.authUser.role !== "owner") return res.status(403).json({ error: "Owner access is required." });
  next();
}

function allowEmployeeOrOwner(req, res, next) {
  if (req.authUser.role !== "owner" && req.authUser.role !== "employee") return res.status(403).json({ error: "Team access is required." });
  next();
}

async function requireAuth(req, res, next) {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: "Sign in is required." });
    req.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function tableRows(table, orderBy = "created_at asc") {
  const result = await pool.query(`select * from ${table} order by ${orderBy}`);
  return result.rows;
}

async function loadSnapshot() {
  const [customers, leads, jobs, invoices, servicePlans, reviews, expenses, solicitations, calendarEvents] = await Promise.all([
    tableRows("customers", "name asc"),
    tableRows("leads", "follow_up_date asc nulls last, created_at asc"),
    tableRows("jobs", "date asc, time asc"),
    tableRows("invoices", "issued_date desc nulls last, created_at desc"),
    tableRows("service_plans", "renewal_date asc nulls last"),
    tableRows("reviews", "submitted_at desc"),
    tableRows("expenses", "date desc"),
    tableRows("solicitations", "solicited_date desc, created_at desc"),
    tableRows("calendar_events", "date asc, start_time asc, created_at asc"),
  ]);

  return {
    customers: customers.map(toCustomer),
    leads: leads.map(toLead),
    jobs: jobs.map(toJob),
    invoices: invoices.map(toInvoice),
    servicePlans: servicePlans.map(toServicePlan),
    reviews: reviews.map(toReview),
    expenses,
    solicitations: solicitations.map(toSolicitation),
    calendarEvents: calendarEvents.map(toCalendarEvent),
  };
}

async function upsertCustomers(client, customers = []) {
  if (customers.length === 0) return;
  const rows = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? "",
    subscribed_plan_id: customer.subscribedPlanId ?? null,
    insights: customer.insights ?? [],
  }));
  await client.query(
      `insert into customers (id, name, phone, email, address, notes, subscribed_plan_id, insights)
       select id, name, phone, email, address, notes, subscribed_plan_id, insights
       from jsonb_to_recordset($1::jsonb) as row(
         id text, name text, phone text, email text, address text, notes text,
         subscribed_plan_id text, insights text[]
       )
       on conflict (id) do update set
         name = case when customers.website_overrides ? 'name' then customers.name else excluded.name end,
         phone = case when customers.website_overrides ? 'phone' then customers.phone else excluded.phone end,
         email = case when customers.website_overrides ? 'email' then customers.email else excluded.email end,
         address = case when customers.website_overrides ? 'address' then customers.address else excluded.address end,
         notes = case when customers.website_overrides ? 'notes' then customers.notes else excluded.notes end,
         subscribed_plan_id = excluded.subscribed_plan_id,
         insights = excluded.insights`,
      [JSON.stringify(rows)],
    );
}

async function upsertLeads(client, leads = []) {
  if (leads.length === 0) return;
  const rows = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    contact: lead.contact ?? "",
    address: lead.address ?? "",
    source: lead.source ?? "",
    status: lead.status ?? "new",
    estimated_value: lead.estimatedValue ?? 0,
    follow_up_date: lead.followUpDate || null,
    notes: lead.notes ?? "",
  }));
  await client.query(
      `insert into leads (id, name, contact, address, source, status, estimated_value, follow_up_date, notes)
       select id, name, contact, address, source, status, estimated_value, follow_up_date, notes
       from jsonb_to_recordset($1::jsonb) as row(
         id text, name text, contact text, address text, source text, status text,
         estimated_value numeric, follow_up_date date, notes text
       )
       on conflict (id) do update set
         name = case when leads.website_overrides ? 'name' then leads.name else excluded.name end,
         contact = case when leads.website_overrides ? 'contact' then leads.contact else excluded.contact end,
         address = case when leads.website_overrides ? 'address' then leads.address else excluded.address end,
         source = excluded.source,
         status = case when leads.website_overrides ? 'status' then leads.status else excluded.status end,
         estimated_value = case when leads.website_overrides ? 'estimatedValue' then leads.estimated_value else excluded.estimated_value end,
         follow_up_date = case when leads.website_overrides ? 'followUpDate' then leads.follow_up_date else excluded.follow_up_date end,
         notes = case when leads.website_overrides ? 'notes' then leads.notes else excluded.notes end`,
      [JSON.stringify(rows)],
    );
}

async function upsertJobs(client, jobs = []) {
  if (jobs.length === 0) return;
  const rows = jobs.map((job) => ({
    id: job.id,
    date: job.date,
    time: job.time,
    customer_id: job.customerId,
    address: job.address ?? "",
    service_type: job.serviceType ?? "",
    status: job.status ?? "scheduled",
    crew_ids: job.crewIds ?? [],
    price: job.price ?? 0,
    amount_paid: job.amountPaid ?? 0,
    tip_amount: job.tipAmount ?? 0,
    payment_status: job.paymentStatus ?? "unpaid",
    payment_method: job.paymentMethod ?? null,
    notes: job.notes ?? "",
    before_photo: job.beforePhoto ?? null,
    after_photo: job.afterPhoto ?? null,
    source: job.source ?? "spreadsheet-import",
  }));
  await client.query(
      `insert into jobs (
         id, date, time, customer_id, address, service_type, status, crew_ids,
         price, amount_paid, tip_amount, payment_status, payment_method, notes,
         before_photo, after_photo, source
       )
       select id, date, time, customer_id, address, service_type, status, crew_ids,
         price, amount_paid, tip_amount, payment_status, payment_method, notes,
         before_photo, after_photo, source
       from jsonb_to_recordset($1::jsonb) as row(
         id text, date date, time text, customer_id text, address text, service_type text,
         status text, crew_ids text[], price numeric, amount_paid numeric, tip_amount numeric,
         payment_status text, payment_method text, notes text, before_photo text,
         after_photo text, source text
       )
       on conflict (id) do update set
         date = excluded.date,
         time = excluded.time,
         customer_id = excluded.customer_id,
         address = excluded.address,
         service_type = excluded.service_type,
         status = excluded.status,
         crew_ids = excluded.crew_ids,
         price = excluded.price,
         amount_paid = excluded.amount_paid,
         tip_amount = excluded.tip_amount,
         payment_status = excluded.payment_status,
         payment_method = excluded.payment_method,
         notes = excluded.notes,
         before_photo = excluded.before_photo,
         after_photo = excluded.after_photo,
         source = excluded.source,
         latitude = case when jobs.address is distinct from excluded.address then null else jobs.latitude end,
         longitude = case when jobs.address is distinct from excluded.address then null else jobs.longitude end,
         geocoded_address = case when jobs.address is distinct from excluded.address then null else jobs.geocoded_address end,
         website_overrides = '{}'::jsonb,
         updated_at = now()`,
      [JSON.stringify(rows)],
    );
}

async function upsertInvoices(client, invoices = []) {
  if (invoices.length === 0) return;
  const rows = invoices.map((invoice) => ({
    id: invoice.id,
    customer_id: invoice.customerId,
    job_id: invoice.jobId,
    service_description: invoice.serviceDescription ?? "",
    price: invoice.price ?? 0,
    discount: invoice.discount ?? 0,
    tip: invoice.tip ?? 0,
    payment_method: invoice.paymentMethod ?? null,
    status: invoice.status ?? "unpaid",
    amount_paid: invoice.amountPaid ?? 0,
    due_date: invoice.dueDate || null,
    issued_date: invoice.issuedDate || null,
  }));
  await client.query(
      `insert into invoices (
         id, customer_id, job_id, service_description, price, discount, tip,
         payment_method, status, amount_paid, due_date, issued_date
       )
       select id, customer_id, job_id, service_description, price, discount, tip,
         payment_method, status, amount_paid, due_date, issued_date
       from jsonb_to_recordset($1::jsonb) as row(
         id text, customer_id text, job_id text, service_description text,
         price numeric, discount numeric, tip numeric, payment_method text,
         status text, amount_paid numeric, due_date date, issued_date date
       )
       on conflict (id) do update set
         customer_id = excluded.customer_id,
         job_id = excluded.job_id,
         service_description = excluded.service_description,
         price = excluded.price,
         discount = excluded.discount,
         tip = excluded.tip,
         payment_method = excluded.payment_method,
         status = excluded.status,
         amount_paid = excluded.amount_paid,
         due_date = excluded.due_date,
         issued_date = excluded.issued_date`,
      [JSON.stringify(rows)],
    );
}

async function upsertReviews(client, reviews = []) {
  if (reviews.length === 0) return;
  const rows = reviews.map((review) => ({
    id: review.id,
    submitted_at: review.submittedAt,
    name: review.name ?? "",
    rating: review.rating ?? 5,
    review: review.review ?? "",
    source: review.source ?? "spreadsheet-import",
  }));
  await client.query(
      `insert into reviews (id, submitted_at, name, rating, review, source)
       select id, submitted_at, name, rating, review, source
       from jsonb_to_recordset($1::jsonb) as row(
         id text, submitted_at timestamptz, name text, rating integer, review text, source text
       )
       on conflict (id) do update set
         submitted_at = excluded.submitted_at,
         name = excluded.name,
         rating = excluded.rating,
         review = excluded.review,
         source = excluded.source`,
      [JSON.stringify(rows)],
    );
}

function databaseDate(value) {
  if (!value || value === "Not listed") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function upsertServicePlans(client, plans = []) {
  if (plans.length === 0) return;
  const rows = plans.map((plan) => ({
    id: plan.id,
    type: plan.type,
    customer_id: plan.customerId,
    discount_pct: plan.discountPct ?? 0,
    renewal_date: databaseDate(plan.renewalDate),
    services_included: plan.servicesIncluded ?? [],
    price: plan.price ?? 0,
    payment_status: plan.paymentStatus ?? "unpaid",
    notes: plan.notes ?? "",
  }));
  await client.query(
    `insert into service_plans (
       id, type, customer_id, discount_pct, renewal_date, services_included,
       price, payment_status, notes
     )
     select id, type, customer_id, discount_pct, renewal_date, services_included,
       price, payment_status, notes
     from jsonb_to_recordset($1::jsonb) as row(
       id text, type text, customer_id text, discount_pct numeric, renewal_date date,
       services_included text[], price numeric, payment_status text, notes text
     )
     on conflict (id) do update set
       type = excluded.type,
       customer_id = excluded.customer_id,
       discount_pct = excluded.discount_pct,
       renewal_date = excluded.renewal_date,
       services_included = excluded.services_included,
       price = excluded.price,
       payment_status = excluded.payment_status,
       notes = excluded.notes`,
    [JSON.stringify(rows)],
  );
}

async function syncSheetsIntoDatabase(payload) {
  const client = await pool.connect();
  const customerIds = (payload.customers ?? []).map((customer) => customer.id);
  const jobIds = (payload.jobs ?? []).map((job) => job.id);
  const invoiceIds = (payload.invoices ?? []).map((invoice) => invoice.id);
  const reviewIds = (payload.reviews ?? []).map((review) => review.id);
  const servicePlanIds = (payload.servicePlans ?? []).map((plan) => plan.id);

  try {
    await client.query("begin");
    await upsertCustomers(client, payload.customers);
    await upsertLeads(client, payload.leads);
    await upsertJobs(client, payload.jobs);
    await upsertInvoices(client, payload.invoices);
    await upsertReviews(client, payload.reviews);
    await upsertServicePlans(client, payload.servicePlans);
    await client.query("delete from service_plans where id like 'sp-%' and not (id = any($1::text[]))", [servicePlanIds]);
    await client.query("delete from invoices where id like 'sheet-invoice-%' and not (id = any($1::text[]))", [invoiceIds]);
    await client.query("delete from jobs where source = 'spreadsheet-import' and not (id = any($1::text[]))", [jobIds]);
    await client.query("delete from reviews where source = 'spreadsheet-import' and not (id = any($1::text[]))", [reviewIds]);
    await client.query("delete from customers where id like 'sheet-customer-%' and not (id = any($1::text[]))", [customerIds]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: Boolean(pool) });
});

app.get("/api/auth/config", (_req, res) => {
  const state = randomBytes(24).toString("base64url");
  res.setHeader("Set-Cookie", cookie(authStateCookieName, state, { maxAge: 10 * 60 * 1000 }));
  res.json({ enabled: Boolean(googleClientId && pool), clientId: googleClientId, state, signupCodeRequired: Boolean(employeeAccessCode || ownerAccessCode) });
});

app.get("/api/auth/session", async (req, res, next) => {
  try {
    const user = await sessionUser(req);
    res.json({ user: user ? toAuthUser(user) : null });
  } catch (error) {
    next(error);
  }
});

function validAuthState(req) {
  const cookieState = parseCookies(req)[authStateCookieName];
  return Boolean(cookieState && req.body?.state && cookieState === req.body.state);
}

app.post("/api/auth/google", requireDatabase, async (req, res, next) => {
  try {
    if (!validAuthState(req)) return res.status(403).json({ error: "The sign-in page expired. Refresh and try again." });
    const profile = await verifyGoogleCredential(req.body.credential);
    const result = await pool.query("select * from user_accounts where google_sub = $1", [profile.googleSub]);
    const user = result.rows[0];
    if (!user) return res.json({ needsProfile: true, profile: { email: profile.email, name: profile.name, pictureUrl: profile.pictureUrl } });
    if (!user.active) return res.status(403).json({ error: "This account has been deactivated by an owner." });
    await pool.query(
      "update user_accounts set email = $2, name = $3, picture_url = $4, last_login_at = now(), updated_at = now() where id = $1",
      [user.id, profile.email, profile.name, profile.pictureUrl],
    );
    await createSession(res, user.id);
    res.json({ user: { ...toAuthUser(user), email: profile.email, name: profile.name, pictureUrl: profile.pictureUrl } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", requireDatabase, async (req, res, next) => {
  try {
    if (!validAuthState(req)) return res.status(403).json({ error: "The signup page expired. Refresh and try again." });
    const age = Number(req.body.age);
    const role = req.body.role;
    if (!Number.isInteger(age) || age < 13 || age > 120) return res.status(400).json({ error: "Enter an age between 13 and 120." });
    if (role !== "owner" && role !== "employee") return res.status(400).json({ error: "Choose owner or employee." });
    const requiredCode = role === "employee" ? employeeAccessCode : ownerAccessCode;
    if (requiredCode && req.body.accessCode !== requiredCode) return res.status(403).json({ error: `The ${role} access code is incorrect.` });
    const profile = await verifyGoogleCredential(req.body.credential);
    const result = await pool.query(
      `insert into user_accounts (google_sub, email, name, picture_url, age, role)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (google_sub) do update set email = excluded.email, name = excluded.name,
         picture_url = excluded.picture_url, age = excluded.age, role = excluded.role,
         last_login_at = now(), updated_at = now()
       returning *`,
      [profile.googleSub, profile.email, profile.name, profile.pictureUrl, age, role],
    );
    await createSession(res, result.rows[0].id);
    res.status(201).json({ user: toAuthUser(result.rows[0]) });
  } catch (error) {
    if (error?.code === "23505") return res.status(409).json({ error: "That Google email is already connected to another account." });
    next(error);
  }
});

app.post("/api/auth/logout", async (req, res, next) => {
  try {
    const token = parseCookies(req)[sessionCookieName];
    if (token && pool) await pool.query("delete from auth_sessions where token_hash = $1", [hashToken(token)]);
    res.setHeader("Set-Cookie", cookie(sessionCookieName, "", { maxAge: 0 }));
    res.json({ signedOut: true });
  } catch (error) {
    next(error);
  }
});

app.use("/api", requireAuth);

app.get("/api/notifications/read", requireDatabase, async (req, res, next) => {
  try {
    const result = await pool.query(
      "select notification_key from notification_reads where user_id = $1 order by read_at desc",
      [req.authUser.id],
    );
    res.json({ readKeys: result.rows.map((row) => row.notification_key) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/notifications/read", requireDatabase, async (req, res, next) => {
  try {
    const submittedKeys = Array.isArray(req.body?.keys) ? req.body.keys : [];
    const readKeys = [...new Set(submittedKeys.filter((key) => typeof key === "string" && key.length > 0 && key.length <= 1000))];
    if (submittedKeys.length > 500 || readKeys.length !== submittedKeys.length) {
      return res.status(400).json({ error: "Notification keys are invalid." });
    }
    if (readKeys.length) {
      await pool.query(
        `insert into notification_reads (user_id, notification_key)
         select $1, unnest($2::text[])
         on conflict (user_id, notification_key) do update set read_at = now()`,
        [req.authUser.id, readKeys],
      );
    }
    res.json({ readKeys });
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", requireDatabase, requireOwner, async (_req, res, next) => {
  try {
    res.json(await loadSnapshot());
  } catch (error) {
    next(error);
  }
});

async function runSheetSync() {
  const response = await fetch(syncUrl, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Sheet sync endpoint failed with ${response.status}`);
  const payload = await response.json();
  const customersById = new Map((payload.customers ?? []).map((customer) => [customer.id, customer]));
  for (const plan of payload.servicePlans ?? []) {
    if (plan.customer?.id) customersById.set(plan.customer.id, plan.customer);
  }
  payload.customers = [...customersById.values()];
  await syncSheetsIntoDatabase(payload);
  return loadSnapshot();
}

async function runSheetAction(action, row) {
  if (!syncUrl) throw new Error("SHEETS_SYNC_URL is not configured.");
  const response = await fetch(syncUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, row }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Sheet write endpoint failed with ${response.status}`);
  const payload = await response.json();
  if (payload?.ok === false) throw new Error(payload.error || "Google Sheets rejected the update.");
  return payload;
}

app.post("/api/sync-sheets", requireDatabase, requireOwner, async (_req, res, next) => {
  try {
    if (!syncUrl) {
      res.status(503).json({ error: "SHEETS_SYNC_URL is not configured." });
      return;
    }
    if (!activeSheetSync) {
      activeSheetSync = runSheetSync().finally(() => {
        activeSheetSync = null;
      });
    }
    res.json(await activeSheetSync);
  } catch (error) {
    next(error);
  }
});

app.post("/api/customers", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { name, phone = "", email = "", address = "", notes = "" } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Customer name is required." });
    const customerId = `manual-customer-${randomUUID()}`;
    await runSheetAction("addCustomer", { customerId, name: name.trim(), phone, email, address, notes });
    const overrides = { name: true, phone: true, email: true, address: true, notes: true };
    const result = await pool.query(
      `insert into customers (id, name, phone, email, address, notes, insights, website_overrides)
       values ($1, $2, $3, $4, $5, $6, '{}', $7::jsonb)
       returning *`,
      [customerId, name.trim(), phone, email, address, notes, JSON.stringify(overrides)],
    );
    res.status(201).json(toCustomer(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/customers/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { name, phone, email, address, notes } = req.body;
    const editableFields = ["name", "phone", "email", "address", "notes"];
    const overrides = Object.fromEntries(editableFields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, true]));
    const result = await pool.query(
      `update customers
       set name = coalesce($2, name), phone = coalesce($3, phone), email = coalesce($4, email),
           address = coalesce($5, address), notes = coalesce($6, notes),
           website_overrides = website_overrides || $7::jsonb, updated_at = now()
       where id = $1 returning *`,
      [req.params.id, name, phone, email, address, notes, JSON.stringify(overrides)],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Customer not found." });
    res.json(toCustomer(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/leads", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { name, contact = "", address = "", status = "new", estimatedValue = 0, followUpDate, notes = "" } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Lead name is required." });
    const leadId = `manual-lead-${randomUUID()}`;
    await runSheetAction("addLead", { leadId, name: name.trim(), contact, address, status, estimatedValue, followUpDate, notes });
    const overrides = { name: true, contact: true, address: true, status: true, estimatedValue: true, followUpDate: true, notes: true };
    const result = await pool.query(
      `insert into leads (id, name, contact, address, source, status, estimated_value, follow_up_date, notes, website_overrides)
       values ($1, $2, $3, $4, 'Manual entry', $5, $6, $7, $8, $9::jsonb) returning *`,
      [leadId, name.trim(), contact, address, status, estimatedValue, followUpDate || null, notes, JSON.stringify(overrides)],
    );
    res.status(201).json(toLead(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/jobs", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { date, time = "09:00", customerId, address, serviceType, status = "scheduled", price = 0, notes = "" } = req.body;
    if (!date || !customerId || !address?.trim() || !serviceType?.trim()) {
      return res.status(400).json({ error: "Date, customer, address, and service are required." });
    }
    const customerResult = await pool.query("select name, phone from customers where id = $1", [customerId]);
    if (!customerResult.rows[0]) return res.status(400).json({ error: "Customer was not found." });
    const jobId = `manual-job-${randomUUID()}`;
    await runSheetAction("addUpcomingJob", {
      jobId,
      customerId,
      name: customerResult.rows[0].name,
      phone: customerResult.rows[0].phone,
      date,
      time,
      address: address.trim(),
      serviceType: serviceType.trim(),
      status,
      price,
      notes,
    });
    const overrides = { date: true, time: true, customerId: true, address: true, serviceType: true, status: true, price: true, notes: true };
    const result = await pool.query(
      `insert into jobs (id, date, time, customer_id, address, service_type, status, price, payment_status, notes, source, website_overrides)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'unpaid', $9, 'manual', $10::jsonb) returning *`,
      [jobId, date, time, customerId, address.trim(), serviceType.trim(), status, price, notes, JSON.stringify(overrides)],
    );
    res.status(201).json(toJob(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/jobs/:id", requireDatabase, requireOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const existing = await client.query("select id from jobs where id = $1", [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Job not found." });
    await runSheetAction("deleteJob", { jobId: req.params.id });
    await client.query("begin");
    await client.query("delete from invoices where job_id = $1", [req.params.id]);
    await client.query("delete from jobs where id = $1", [req.params.id]);
    await client.query("commit");
    res.json({ deleted: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

app.delete("/api/leads/:id", requireDatabase, requireOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const existing = await client.query("select id, source from leads where id = $1", [req.params.id]);
    const lead = existing.rows[0];
    if (!lead) return res.status(404).json({ error: "Lead not found." });

    if (lead.source === "Check-Ups sheet" || lead.source === "Manual entry") {
      await runSheetAction("deleteLead", { leadId: lead.id });
    }

    await client.query("begin");
    if (lead.source === "Map solicitation" && lead.id.startsWith("solicitation-")) {
      const solicitationId = lead.id.slice("solicitation-".length);
      await client.query(
        `update solicitations set outcome = 'no answer', follow_up_date = null, updated_at = now() where id = $1`,
        [solicitationId],
      );
    }
    await client.query("delete from leads where id = $1", [lead.id]);
    await client.query("commit");
    res.json({ deleted: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/api/leads/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { name, contact, address, status, estimatedValue, notes, followUpDate } = req.body;
    const editableFields = ["name", "contact", "address", "status", "estimatedValue", "followUpDate", "notes"];
    const overrides = Object.fromEntries(editableFields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, true]));
    const result = await pool.query(
      `update leads
       set name = coalesce($2, name),
           contact = coalesce($3, contact),
           address = coalesce($4, address),
           status = coalesce($5, status),
           estimated_value = coalesce($6, estimated_value),
           follow_up_date = case when $9::jsonb ? 'followUpDate' then $7::date else follow_up_date end,
           notes = coalesce($8, notes),
           website_overrides = website_overrides || $9::jsonb,
           updated_at = now()
       where id = $1
       returning *`,
      [req.params.id, name, contact, address, status, estimatedValue, followUpDate || null, notes, JSON.stringify(overrides)],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    res.json(toLead(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/jobs/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { date, time, customerId, address, serviceType, status, paymentStatus, amountPaid, tipAmount, price, paymentMethod, notes, latitude, longitude } = req.body;
    const editableFields = ["date", "time", "customerId", "address", "serviceType", "status", "paymentStatus", "amountPaid", "tipAmount", "price", "paymentMethod", "notes"];
    const overrides = Object.fromEntries(editableFields.filter((field) => Object.hasOwn(req.body, field)).map((field) => [field, true]));
    const existingResult = await pool.query(
      `select jobs.*, customers.name as customer_name, customers.phone as customer_phone
       from jobs
       left join customers on customers.id = jobs.customer_id
       where jobs.id = $1`,
      [req.params.id],
    );
    const existing = existingResult.rows[0];
    if (!existing) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    if (Object.keys(overrides).length > 0) {
      let customerName = existing.customer_name ?? "Customer";
      let customerPhone = existing.customer_phone ?? "";
      if (customerId && customerId !== existing.customer_id) {
        const customerResult = await pool.query("select name, phone from customers where id = $1", [customerId]);
        if (!customerResult.rows[0]) {
          res.status(400).json({ error: "Customer was not found." });
          return;
        }
        customerName = customerResult.rows[0].name;
        customerPhone = customerResult.rows[0].phone;
      }

      const sheetRow = { jobId: req.params.id };
      if (Object.hasOwn(req.body, "customerId")) Object.assign(sheetRow, { customerId, name: customerName, phone: customerPhone });
      if (Object.hasOwn(req.body, "date") || Object.hasOwn(req.body, "time")) {
        Object.assign(sheetRow, { date: date ?? databaseDate(existing.date), time: time ?? existing.time });
      }
      for (const field of ["address", "serviceType", "status", "paymentStatus", "amountPaid", "tipAmount", "price", "paymentMethod", "notes"]) {
        if (Object.hasOwn(req.body, field)) sheetRow[field] = req.body[field];
      }
      await runSheetAction("updateJob", sheetRow);
    }

    const result = await pool.query(
      `update jobs
       set date = coalesce($2, date),
           time = coalesce($3, time),
           customer_id = coalesce($4, customer_id),
           address = coalesce($5, address),
           service_type = coalesce($6, service_type),
           status = coalesce($7, status),
           payment_status = coalesce($8, payment_status),
           amount_paid = coalesce($9, amount_paid),
           tip_amount = coalesce($10, tip_amount),
           price = coalesce($11, price),
           payment_method = coalesce($12, payment_method),
           notes = coalesce($13, notes),
           latitude = case when $5::text is not null and $5::text is distinct from address then null else coalesce($14, latitude) end,
           longitude = case when $5::text is not null and $5::text is distinct from address then null else coalesce($15, longitude) end,
           geocoded_address = case
             when $5::text is not null and $5::text is distinct from address then null
             when $14::double precision is not null and $15::double precision is not null then address
             else geocoded_address
           end,
           website_overrides = website_overrides || $16::jsonb,
           updated_at = now()
       where id = $1
       returning *`,
      [req.params.id, date, time, customerId, address, serviceType, status, paymentStatus, amountPaid, tipAmount, price, paymentMethod, notes, latitude, longitude, JSON.stringify(overrides)],
    );
    res.json(toJob(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/solicitations", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { address, latitude, longitude, solicitedDate, outcome, followUpDate, notes } = req.body;
    if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: "Address and valid coordinates are required." });
      return;
    }
    const subject = await employeeSubject(req);
    await client.query("begin");
    const result = await client.query(
      `insert into solicitations (address, latitude, longitude, solicited_date, outcome, follow_up_date, notes, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning *`,
      [address, latitude, longitude, solicitedDate || new Date().toISOString().slice(0, 10), outcome || "no answer", followUpDate || null, notes || "", subject.id],
    );
    const solicitation = toSolicitation(result.rows[0]);
    const lead = await syncSolicitationLead(client, result.rows[0]);
    await client.query("commit");
    res.status(201).json({ solicitation, lead, removedLeadId: lead ? undefined : solicitationLeadId(solicitation.id) });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.patch("/api/solicitations/:id", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { address, latitude, longitude, solicitedDate, outcome, followUpDate, notes } = req.body;
    const hasFollowUpDate = Object.hasOwn(req.body, "followUpDate");
    await client.query("begin");
    const result = await client.query(
      `update solicitations
       set address = coalesce($2, address),
           latitude = coalesce($3, latitude),
           longitude = coalesce($4, longitude),
           solicited_date = coalesce($5, solicited_date),
           outcome = coalesce($6, outcome),
           follow_up_date = case when $8::boolean then nullif($7, '')::date else follow_up_date end,
           notes = coalesce($9, notes)
       where id = $1 and ($10::boolean or created_by = $11)
       returning *`,
      [req.params.id, address, latitude, longitude, solicitedDate, outcome, followUpDate, hasFollowUpDate, notes, req.authUser.role === "owner", req.authUser.id],
    );
    if (!result.rows[0]) {
      await client.query("rollback");
      res.status(404).json({ error: "Solicitation not found." });
      return;
    }
    const solicitation = toSolicitation(result.rows[0]);
    const lead = await syncSolicitationLead(client, result.rows[0]);
    await client.query("commit");
    res.json({ solicitation, lead, removedLeadId: lead ? undefined : solicitationLeadId(solicitation.id) });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.delete("/api/solicitations/:id", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const removedLeadId = solicitationLeadId(req.params.id);
    await client.query("delete from leads where id = $1 and source = 'Map solicitation'", [removedLeadId]);
    const result = await client.query(
      "delete from solicitations where id = $1 and ($2::boolean or created_by = $3) returning id",
      [req.params.id, req.authUser.role === "owner", req.authUser.id],
    );
    await client.query("commit");
    res.json({ deleted: Boolean(result.rows[0]), removedLeadId });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/calendar-events", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { title, type = "other", date, startTime = "09:00", endTime = "", location = "", notes = "" } = req.body;
    if (!title?.trim() || !date) return res.status(400).json({ error: "Event title and date are required." });
    const result = await pool.query(
      `insert into calendar_events (title, type, date, start_time, end_time, location, notes)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [title.trim(), type, date, startTime || "09:00", endTime || "", location.trim(), notes],
    );
    res.status(201).json(toCalendarEvent(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/calendar-events/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { title, type, date, startTime, endTime, location, notes } = req.body;
    const result = await pool.query(
      `update calendar_events
       set title = coalesce($2, title), type = coalesce($3, type), date = coalesce($4, date),
           start_time = coalesce($5, start_time), end_time = coalesce($6, end_time),
           location = coalesce($7, location), notes = coalesce($8, notes), updated_at = now()
       where id = $1 returning *`,
      [req.params.id, title?.trim(), type, date, startTime, endTime, location?.trim(), notes],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Calendar event not found." });
    res.json(toCalendarEvent(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/calendar-events/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const result = await pool.query("delete from calendar_events where id = $1 returning id", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Calendar event not found." });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/invoices/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { status, amountPaid, paymentMethod, price, discount, tip, serviceDescription } = req.body;
    const result = await pool.query(
      `update invoices
       set status = coalesce($2, status),
           amount_paid = coalesce($3, amount_paid),
           payment_method = coalesce($4, payment_method),
           price = coalesce($5, price),
           discount = coalesce($6, discount),
           tip = coalesce($7, tip),
           service_description = coalesce($8, service_description)
       where id = $1
       returning *`,
      [req.params.id, status, amountPaid, paymentMethod, price, discount, tip, serviceDescription],
    );
    res.json(toInvoice(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/service-plans/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { type, customerId, discountPct, renewalDate, servicesIncluded, price, paymentStatus, notes } = req.body;
    const result = await pool.query(
      `update service_plans
       set type = coalesce($2, type),
           customer_id = coalesce($3, customer_id),
           discount_pct = coalesce($4, discount_pct),
           renewal_date = coalesce($5, renewal_date),
           services_included = coalesce($6, services_included),
           price = coalesce($7, price),
           payment_status = coalesce($8, payment_status),
           notes = coalesce($9, notes)
       where id = $1
       returning *`,
      [req.params.id, type, customerId, discountPct, renewalDate, servicesIncluded, price, paymentStatus, notes],
    );
    res.json(toServicePlan(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

async function audit(actorId, action, entityType, entityId, details = {}) {
  await pool.query(
    "insert into activity_log (actor_id, action, entity_type, entity_id, details) values ($1, $2, $3, $4, $5::jsonb)",
    [actorId, action, entityType, String(entityId), JSON.stringify(details)],
  );
}

async function employeeSubject(req) {
  if (req.authUser.role === "employee") return req.authUser;
  const requestedId = req.query.employeeId || req.body?.employeeId;
  if (requestedId) {
    const requested = await pool.query("select * from user_accounts where id = $1 and role = 'employee' and active = true", [requestedId]);
    if (requested.rows[0]) return requested.rows[0];
  }
  const firstEmployee = await pool.query("select * from user_accounts where role = 'employee' and active = true order by created_at asc limit 1");
  return firstEmployee.rows[0] || req.authUser;
}

const earningSelect = `
  select es.*, ja.original_job_price, ja.base_commission_pct, ja.upsell_commission_pct,
    ja.contract_bonus_pct, ja.tip_share_pct, ua.name as employee_name,
    customers.name as customer_name, jobs.date as job_date, jobs.status as job_status,
    contract_submissions.status as contract_status
  from earning_submissions es
  join job_assignments ja on ja.job_id = es.job_id and ja.employee_id = es.employee_id
  join user_accounts ua on ua.id = es.employee_id
  join jobs on jobs.id = es.job_id
  join customers on customers.id = jobs.customer_id
  left join contract_submissions on contract_submissions.id = es.contract_submission_id`;

app.get("/api/employee/bootstrap", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  try {
    const subject = await employeeSubject(req);
    const jobsResult = await pool.query(
      `select jobs.* from jobs
       where jobs.date between current_date - 7 and current_date + 7
       order by jobs.date asc, jobs.time asc`,
    );
    const customerIds = [...new Set(jobsResult.rows.map((row) => row.customer_id))];
    const [customersResult, assignmentsResult, earningsResult, solicitationsResult, payoutsResult] = await Promise.all([
      customerIds.length
        ? pool.query("select id, name, phone, address, notes from customers where id = any($1::text[]) order by name", [customerIds])
        : Promise.resolve({ rows: [] }),
      pool.query(
        `select ja.*, ua.name as employee_name from job_assignments ja
         join user_accounts ua on ua.id = ja.employee_id
         join jobs on jobs.id = ja.job_id
         where ja.employee_id = $1 and jobs.date between current_date - 7 and current_date + 7`,
        [subject.id],
      ),
      pool.query(`${earningSelect} where es.employee_id = $1 order by jobs.date desc`, [subject.id]),
      pool.query("select * from solicitations where created_by = $1 order by solicited_date desc, created_at desc", [subject.id]),
      pool.query("select payouts.*, ua.name as employee_name from payouts join user_accounts ua on ua.id = payouts.employee_id where payouts.employee_id = $1 order by paid_at desc", [subject.id]),
    ]);
    const customers = customersResult.rows.map((row) => ({
      id: row.id, name: row.name, phone: row.phone, email: "", address: row.address,
      notes: row.notes, insights: [],
    }));
    const jobs = jobsResult.rows.map((row) => ({
      ...toJob(row), amountPaid: 0, tipAmount: 0, paymentStatus: "unpaid", paymentMethod: undefined,
    }));
    res.json({
      employee: toEmployeeProfile(subject),
      preview: req.authUser.role === "owner",
      customers,
      jobs,
      assignments: assignmentsResult.rows.map(toAssignment),
      earnings: earningsResult.rows.map(toEarning),
      solicitations: solicitationsResult.rows.map(toSolicitation),
      payouts: payoutsResult.rows.map((row) => ({
        id: row.id, employeeId: row.employee_id, employeeName: row.employee_name,
        amount: Number(row.amount), paidAt: row.paid_at?.toISOString?.() ?? row.paid_at,
        earningIds: row.earning_ids ?? [],
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/employee/jobs/:id", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  try {
    const subject = await employeeSubject(req);
    const assignment = await pool.query("select 1 from job_assignments where job_id = $1 and employee_id = $2", [req.params.id, subject.id]);
    if (!assignment.rows[0] && req.authUser.role !== "owner") return res.status(403).json({ error: "This job is not assigned to you." });
    const allowedStatuses = ["scheduled", "in progress", "completed", "canceled", "past due"];
    const status = Object.hasOwn(req.body, "status") ? req.body.status : undefined;
    const notes = Object.hasOwn(req.body, "notes") ? String(req.body.notes ?? "") : undefined;
    if (status !== undefined && !allowedStatuses.includes(status)) return res.status(400).json({ error: "Job status is invalid." });
    if (status === undefined && notes === undefined) return res.status(400).json({ error: "Status or notes are required." });
    const sheetRow = { jobId: req.params.id };
    if (status !== undefined) sheetRow.status = status;
    if (notes !== undefined) sheetRow.notes = notes;
    await runSheetAction("updateJob", sheetRow);
    const result = await pool.query(
      `update jobs set status = coalesce($2, status), notes = coalesce($3, notes),
       website_overrides = website_overrides || $4::jsonb, updated_at = now()
       where id = $1 and date between current_date - 7 and current_date + 7 returning *`,
      [req.params.id, status, notes, JSON.stringify({ ...(status !== undefined ? { status: true } : {}), ...(notes !== undefined ? { notes: true } : {}) })],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Job is outside the employee schedule window." });
    await audit(req.authUser.id, "employee_job_update", "job", req.params.id, { status, notesChanged: notes !== undefined });
    res.json({ ...toJob(result.rows[0]), amountPaid: 0, tipAmount: 0, paymentStatus: "unpaid", paymentMethod: undefined });
  } catch (error) {
    next(error);
  }
});

app.post("/api/employee/earnings", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  try {
    const subject = await employeeSubject(req);
    const { jobId, tipAmount = 0, upsellAmount = 0, contractSubmissionId = null } = req.body;
    const tip = Number(tipAmount);
    const upsell = Number(upsellAmount);
    if (!jobId || !Number.isFinite(tip) || tip < 0 || !Number.isFinite(upsell) || upsell < 0) return res.status(400).json({ error: "Enter valid tip and upsell amounts." });
    const assignment = await pool.query("select * from job_assignments where job_id = $1 and employee_id = $2", [jobId, subject.id]);
    if (!assignment.rows[0]) return res.status(403).json({ error: "This job is not assigned to this employee." });
    if (contractSubmissionId) {
      const contract = await pool.query("select 1 from contract_submissions where id = $1 and employee_id = $2", [contractSubmissionId, subject.id]);
      if (!contract.rows[0]) return res.status(400).json({ error: "The contract submission was not found." });
    }
    const result = await pool.query(
      `insert into earning_submissions (job_id, employee_id, tip_amount, upsell_amount, contract_submission_id, status, owner_note)
       values ($1, $2, $3, $4, $5, 'pending', '')
       on conflict (job_id, employee_id) do update set tip_amount = excluded.tip_amount,
         upsell_amount = excluded.upsell_amount, contract_submission_id = excluded.contract_submission_id,
         status = 'pending', owner_note = '', reviewed_by = null, reviewed_at = null, updated_at = now()
       returning id`,
      [jobId, subject.id, tip, upsell, contractSubmissionId],
    );
    const full = await pool.query(`${earningSelect} where es.id = $1`, [result.rows[0].id]);
    await audit(req.authUser.id, "submit_earnings", "earning", result.rows[0].id, { jobId, tip, upsell });
    res.status(201).json(toEarning(full.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/employee/contracts", requireDatabase, allowEmployeeOrOwner, async (req, res, next) => {
  try {
    const subject = await employeeSubject(req);
    const {
      customerName, customerPhone = "", customerEmail = "", serviceAddress,
      serviceDescription, frequency, relatedJob, price, notes = "", agreementText,
      signerName, signatureData, electronicConsent, jobId = null,
    } = req.body;
    const numericPrice = Number(price);
    const requiredText = [customerName, serviceAddress, serviceDescription, frequency, relatedJob, signerName, agreementText];
    if (requiredText.some((value) => typeof value !== "string" || !value.trim()) || !Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: "Complete the customer, service, frequency, related job, price, and signature details." });
    }
    if (customerEmail && (typeof customerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim()))) {
      return res.status(400).json({ error: "Enter a valid customer email address or leave it blank." });
    }
    if (agreementText.length > 12_000 || notes.length > 5_000 || signatureData?.length > 750_000) {
      return res.status(400).json({ error: "The contract submission is too large." });
    }
    if (electronicConsent !== true || typeof signatureData !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureData)) {
      return res.status(400).json({ error: "The homeowner must consent and provide an electronic signature." });
    }
    if (jobId) {
      const assignment = await pool.query("select 1 from job_assignments where job_id = $1 and employee_id = $2", [jobId, subject.id]);
      if (!assignment.rows[0] && req.authUser.role !== "owner") return res.status(403).json({ error: "The related job is not assigned to you." });
    }
    const result = await pool.query(
      `insert into contract_submissions (
         employee_id, job_id, customer_name, customer_phone, customer_email, service_address,
         service_description, frequency, related_job, price, notes, agreement_text, signer_name,
         signature_data, electronic_consent, signed_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, now()) returning *`,
      [
        subject.id, jobId || null, customerName.trim(), String(customerPhone).trim(), String(customerEmail).trim(),
        serviceAddress.trim(), serviceDescription.trim(), frequency.trim(), relatedJob.trim(), numericPrice,
        String(notes).trim(), agreementText.trim(), signerName.trim(), signatureData,
      ],
    );
    if (jobId) {
      await pool.query(
        `insert into earning_submissions (job_id, employee_id, contract_submission_id, status)
         values ($1, $2, $3, 'pending')
         on conflict (job_id, employee_id) do update set contract_submission_id = excluded.contract_submission_id,
           status = 'pending', owner_note = '', reviewed_by = null, reviewed_at = null, updated_at = now()`,
        [jobId, subject.id, result.rows[0].id],
      );
    }
    await audit(req.authUser.id, "submit_signed_contract", "contract", result.rows[0].id, {
      customerName: customerName.trim(), frequency: frequency.trim(), relatedJob: relatedJob.trim(), price: numericPrice,
    });
    res.status(201).json(toContract({ ...result.rows[0], employee_name: subject.name }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/owner/operations", requireDatabase, requireOwner, async (_req, res, next) => {
  try {
    const [employees, assignments, earnings, contracts, payouts] = await Promise.all([
      pool.query("select * from user_accounts where role = 'employee' order by active desc, name asc"),
      pool.query(`select ja.*, ua.name as employee_name from job_assignments ja join user_accounts ua on ua.id = ja.employee_id order by assigned_at desc`),
      pool.query(`${earningSelect} order by es.created_at desc`),
      pool.query(`select cs.*, ua.name as employee_name from contract_submissions cs join user_accounts ua on ua.id = cs.employee_id order by cs.created_at desc`),
      pool.query(`select payouts.*, ua.name as employee_name from payouts join user_accounts ua on ua.id = payouts.employee_id order by paid_at desc`),
    ]);
    res.json({
      employees: employees.rows.map(toEmployeeProfile),
      assignments: assignments.rows.map(toAssignment),
      earnings: earnings.rows.map(toEarning),
      contracts: contracts.rows.map(toContract),
      payouts: payouts.rows.map((row) => ({ id: row.id, employeeId: row.employee_id, employeeName: row.employee_name, amount: Number(row.amount), paidAt: row.paid_at?.toISOString?.() ?? row.paid_at, earningIds: row.earning_ids ?? [] })),
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/owner/employees/:id", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const fields = ["active", "baseCommissionPct", "upsellCommissionPct", "contractBonusPct", "tipSharePct"];
    if (!fields.some((field) => Object.hasOwn(req.body, field))) return res.status(400).json({ error: "No employee settings were provided." });
    for (const field of fields.slice(1)) {
      if (Object.hasOwn(req.body, field) && (!Number.isFinite(Number(req.body[field])) || Number(req.body[field]) < 0 || Number(req.body[field]) > 1)) {
        return res.status(400).json({ error: "Commission percentages must be between 0% and 100%." });
      }
    }
    const result = await pool.query(
      `update user_accounts set active = coalesce($2, active), base_commission_pct = coalesce($3, base_commission_pct),
       upsell_commission_pct = coalesce($4, upsell_commission_pct), contract_bonus_pct = coalesce($5, contract_bonus_pct),
       tip_share_pct = coalesce($6, tip_share_pct), updated_at = now()
       where id = $1 and role = 'employee' returning *`,
      [req.params.id, req.body.active, req.body.baseCommissionPct, req.body.upsellCommissionPct, req.body.contractBonusPct, req.body.tipSharePct],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Employee was not found." });
    if (req.body.active === false) await pool.query("delete from auth_sessions where user_id = $1", [req.params.id]);
    await audit(req.authUser.id, "update_employee", "employee", req.params.id, req.body);
    res.json(toEmployeeProfile(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/owner/assignments", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const { jobId, employeeId } = req.body;
    const employee = await pool.query("select * from user_accounts where id = $1 and role = 'employee' and active = true", [employeeId]);
    const job = await pool.query("select * from jobs where id = $1", [jobId]);
    if (!employee.rows[0] || !job.rows[0]) return res.status(400).json({ error: "Choose an active employee and valid job." });
    const profile = employee.rows[0];
    const result = await pool.query(
      `insert into job_assignments (job_id, employee_id, assigned_by, original_job_price, base_commission_pct, upsell_commission_pct, contract_bonus_pct, tip_share_pct)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (job_id) do update set employee_id = excluded.employee_id, assigned_by = excluded.assigned_by,
         original_job_price = excluded.original_job_price, base_commission_pct = excluded.base_commission_pct,
         upsell_commission_pct = excluded.upsell_commission_pct, contract_bonus_pct = excluded.contract_bonus_pct,
         tip_share_pct = excluded.tip_share_pct, assigned_at = now() returning *`,
      [jobId, employeeId, req.authUser.id, job.rows[0].price, profile.base_commission_pct, profile.upsell_commission_pct, profile.contract_bonus_pct, profile.tip_share_pct],
    );
    await audit(req.authUser.id, "assign_job", "job", jobId, { employeeId });
    res.status(201).json(toAssignment({ ...result.rows[0], employee_name: profile.name }));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/owner/assignments/:jobId", requireDatabase, requireOwner, async (req, res, next) => {
  try {
    const approved = await pool.query("select 1 from earning_submissions where job_id = $1 and status in ('approved', 'paid')", [req.params.jobId]);
    if (approved.rows[0]) return res.status(409).json({ error: "A paid or approved earning record prevents reassignment." });
    await pool.query("delete from earning_submissions where job_id = $1", [req.params.jobId]);
    const result = await pool.query("delete from job_assignments where job_id = $1 returning job_id", [req.params.jobId]);
    await audit(req.authUser.id, "unassign_job", "job", req.params.jobId);
    res.json({ deleted: Boolean(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/owner/earnings/:id/review", requireDatabase, requireOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { decision, ownerNote = "" } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: "Choose approved or rejected." });
    const current = await client.query(`${earningSelect} where es.id = $1`, [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: "Earnings submission was not found." });
    if (decision === "approved" && current.rows[0].job_date && current.rows[0].status === "paid") return res.status(409).json({ error: "Paid earnings cannot be reviewed again." });
    if (decision === "approved") {
      if (current.rows[0].job_status !== "completed") return res.status(409).json({ error: "Complete the job before approving its earnings." });
      if (current.rows[0].contract_submission_id && current.rows[0].contract_status !== "approved") return res.status(409).json({ error: "Approve the related contract before approving its bonus." });
      const finalPrice = Number(current.rows[0].original_job_price) + Number(current.rows[0].upsell_amount);
      await runSheetAction("updateJob", { jobId: current.rows[0].job_id, price: finalPrice, tipAmount: Number(current.rows[0].tip_amount) });
      await client.query("update jobs set price = $2, tip_amount = $3, updated_at = now() where id = $1", [current.rows[0].job_id, finalPrice, current.rows[0].tip_amount]);
    }
    await client.query(
      "update earning_submissions set status = $2, owner_note = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now() where id = $1",
      [req.params.id, decision, ownerNote, req.authUser.id],
    );
    await audit(req.authUser.id, `earning_${decision}`, "earning", req.params.id, { ownerNote });
    const result = await client.query(`${earningSelect} where es.id = $1`, [req.params.id]);
    res.json(toEarning(result.rows[0]));
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
});

function servicePlanFromContractFrequency(value) {
  const text = String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(monthly|every month|one month|1 month)\b/.test(text)) return { type: "monthly", months: 1 };
  if (/\b(quarterly|seasonal|seasonally|three months?|3 months?)\b/.test(text)) return { type: "3-month", months: 3 };
  if (/\b(four months?|4 months?)\b/.test(text)) return { type: "4-month", months: 4 };
  if (/\b(biannual|bi annual|semiannual|semi annual|six months?|6 months?)\b/.test(text)) return { type: "6-month", months: 6 };
  if (/\b(yearly|annual|annually|one year|1 year|twelve months?|12 months?)\b/.test(text)) return { type: "yearly", months: 12 };
  return null;
}

app.post("/api/owner/contracts/:id/review", requireDatabase, requireOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { decision, ownerNote = "" } = req.body;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: "Choose approved or rejected." });
    await client.query("begin");
    const current = await client.query("select * from contract_submissions where id = $1 for update", [req.params.id]);
    if (!current.rows[0]) { await client.query("rollback"); return res.status(404).json({ error: "Contract was not found." }); }
    if (decision === "approved") {
      let customer = await client.query("select * from customers where lower(name) = lower($1) order by created_at asc limit 1", [current.rows[0].customer_name]);
      if (!customer.rows[0]) {
        const customerId = `contract-customer-${randomUUID()}`;
        customer = await client.query("insert into customers (id, name) values ($1, $2) returning *", [customerId, current.rows[0].customer_name]);
      }
      const planFrequency = servicePlanFromContractFrequency(current.rows[0].frequency);
      if (planFrequency) {
        const renewal = new Date();
        renewal.setMonth(renewal.getMonth() + planFrequency.months);
        const planId = `employee-contract-${current.rows[0].id}`;
        await client.query(
          `insert into service_plans (id, type, customer_id, renewal_date, price, payment_status, notes)
           values ($1, $2, $3, $4, $5, 'unpaid', $6)
           on conflict (id) do update set type = excluded.type, customer_id = excluded.customer_id,
             renewal_date = excluded.renewal_date, price = excluded.price, notes = excluded.notes, updated_at = now()`,
          [planId, planFrequency.type, customer.rows[0].id, renewal.toISOString().slice(0, 10), current.rows[0].price, current.rows[0].notes],
        );
      }
    }
    const updated = await client.query(
      `update contract_submissions set status = $2, owner_note = $3, reviewed_by = $4,
       reviewed_at = now(), updated_at = now() where id = $1 returning *`,
      [req.params.id, decision, ownerNote, req.authUser.id],
    );
    await client.query("commit");
    await audit(req.authUser.id, `contract_${decision}`, "contract", req.params.id, { ownerNote });
    const employee = await pool.query("select name from user_accounts where id = $1", [updated.rows[0].employee_id]);
    res.json(toContract({ ...updated.rows[0], employee_name: employee.rows[0]?.name }));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/owner/payouts", requireDatabase, requireOwner, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const earningIds = [...new Set(Array.isArray(req.body.earningIds) ? req.body.earningIds : [])];
    if (!earningIds.length) return res.status(400).json({ error: "Select approved earnings to pay." });
    const rows = await client.query(`${earningSelect} where es.id = any($1::uuid[]) and es.status = 'approved'`, [earningIds]);
    if (rows.rows.length !== earningIds.length) return res.status(400).json({ error: "Every selected earning must be approved and unpaid." });
    const employeeIds = new Set(rows.rows.map((row) => row.employee_id));
    if (employeeIds.size !== 1) return res.status(400).json({ error: "Create one payout per employee." });
    const amount = rows.rows.reduce((sum, row) => sum + earningAmounts(row).totalEarnings, 0);
    await client.query("begin");
    const payout = await client.query(
      "insert into payouts (employee_id, amount, earning_ids, paid_by) values ($1, $2, $3, $4) returning *",
      [rows.rows[0].employee_id, amount, earningIds, req.authUser.id],
    );
    await client.query("update earning_submissions set status = 'paid', paid_at = now(), updated_at = now() where id = any($1::uuid[])", [earningIds]);
    await client.query("commit");
    await audit(req.authUser.id, "create_payout", "payout", payout.rows[0].id, { earningIds, amount });
    res.status(201).json({ id: payout.rows[0].id, employeeId: payout.rows[0].employee_id, employeeName: rows.rows[0].employee_name, amount, paidAt: payout.rows[0].paid_at.toISOString(), earningIds });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

app.use(express.static(distPath));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Server error", detail: error.message });
});

async function startServer() {
  await ensureMapSchema();
  app.listen(port, "0.0.0.0", () => {
    console.log(`The Powerwashing Pros dashboard listening on ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to initialize the dashboard database", error);
  process.exit(1);
});
