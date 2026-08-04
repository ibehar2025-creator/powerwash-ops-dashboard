import express from "express";
import cors from "cors";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const app = express();
const port = Number(process.env.PORT || 4173);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distPath = path.join(projectRoot, "dist");
const syncUrl = process.env.SHEETS_SYNC_URL || process.env.VITE_SHEETS_SYNC_URL;
const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
let activeSheetSync = null;
const assistantRequestWindows = new Map();

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

    alter table service_plans drop constraint if exists service_plans_type_check;
    alter table service_plans add constraint service_plans_type_check
      check (type in ('monthly', '3-month', '4-month', '6-month', 'yearly'));

    update jobs
    set latitude = null, longitude = null
    where geocoded_address is null and (latitude is not null or longitude is not null);

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
  `);
}

app.use(cors());
app.use(express.json({ limit: "8mb" }));

const assistantInstructions = `You are the website assistant for The Powerwashing Pros, a professional pressure-washing business serving Houston and nearby neighborhoods.
Be friendly, concise, and practical. Answer ordinary questions about pressure washing, exterior cleaning, preparing for service, scheduling, and quote requests.
Services can include driveways, sidewalks, walkways, patios, pool areas, exterior walls, roofs, and full-property cleaning. Never claim a service, guarantee, policy, availability, phone number, or discount that was not provided by the visitor or these instructions.
For quote requests, ask for the property address, surfaces to clean, approximate size, condition, and contact information. A photo can help identify visible surfaces and staining, but cannot prove exact square footage, material condition, or final price.
Use these broad historical starting ranges only when useful: driveway $100-$180; sidewalks or walkway $100-$175; patio $125-$225; driveway plus sidewalks $175-$300; driveway plus patio and sidewalks $250-$375; full property $250-$500. Clearly label every price as a preliminary range subject to confirmation.
When an image is provided, describe only what is visibly relevant to cleaning, note uncertainty, and recommend an appropriate service. Do not identify people, infer sensitive traits, or make claims about structural safety.
Encourage the visitor to submit the quote form when they want follow-up. Keep replies under 120 words.`;

function assistantRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const recent = (assistantRequestWindows.get(key) || []).filter((time) => now - time < 10 * 60_000);
  if (recent.length >= 30) {
    res.status(429).json({ error: "Please wait a few minutes before sending another message." });
    return;
  }
  recent.push(now);
  assistantRequestWindows.set(key, recent);
  next();
}

function fallbackAssistantReply(message, hasImage) {
  const text = message.toLowerCase();
  if (hasImage) return "I received your photo. Photo analysis is being connected now. You can still submit your address and service details, and The Powerwashing Pros will review the request.";
  if (/price|cost|estimate|quote/.test(text)) return "Most jobs depend on the surfaces, size, and staining. Driveways often start around $100-$180, while combined or full-property work is usually higher. Open Get estimate and send the address and a photo for a preliminary range.";
  if (/how long|time|duration/.test(text)) return "Timing depends on the property and services requested. A driveway is generally faster than a full-property cleaning. Send the address and surfaces you want cleaned for a more useful estimate.";
  if (/prepare|before|move/.test(text)) return "Before service, move vehicles, furniture, toys, and fragile items away from the cleaning area. Please also close windows and make sure an outdoor water source is accessible.";
  if (/roof/.test(text)) return "Roof cleaning requires a method appropriate for the roofing material and condition. Send a clear photo and address so the team can review it before confirming a service or price.";
  if (/service|clean|wash/.test(text)) return "The Powerwashing Pros handles common exterior-cleaning projects such as driveways, sidewalks, walkways, patios, pool areas, exterior walls, roofs, and full-property cleaning. What would you like cleaned?";
  return "I can answer questions about pressure washing or help request an estimate. Tell me what you want cleaned, or choose Get estimate to send an address and photo.";
}

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
});

const toLead = (row) => ({
  id: row.id,
  name: row.name,
  contact: row.contact,
  address: row.address,
  source: row.source,
  status: row.status,
  estimatedValue: Number(row.estimated_value),
  followUpDate: row.follow_up_date?.toISOString?.().slice(0, 10) ?? row.follow_up_date,
  notes: row.notes,
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
  notes: row.notes,
});

async function tableRows(table, orderBy = "created_at asc") {
  const result = await pool.query(`select * from ${table} order by ${orderBy}`);
  return result.rows;
}

async function loadSnapshot() {
  const [customers, leads, jobs, invoices, servicePlans, reviews, expenses, solicitations] = await Promise.all([
    tableRows("customers", "name asc"),
    tableRows("leads", "follow_up_date asc nulls last, created_at asc"),
    tableRows("jobs", "date asc, time asc"),
    tableRows("invoices", "issued_date desc nulls last, created_at desc"),
    tableRows("service_plans", "renewal_date asc nulls last"),
    tableRows("reviews", "submitted_at desc"),
    tableRows("expenses", "date desc"),
    tableRows("solicitations", "solicited_date desc, created_at desc"),
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
         name = excluded.name,
         phone = excluded.phone,
         email = excluded.email,
         address = excluded.address,
         notes = excluded.notes,
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
         name = excluded.name,
         contact = excluded.contact,
         address = excluded.address,
         source = excluded.source,
         status = excluded.status,
         estimated_value = excluded.estimated_value,
         follow_up_date = excluded.follow_up_date,
         notes = excluded.notes`,
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
         geocoded_address = case when jobs.address is distinct from excluded.address then null else jobs.geocoded_address end`,
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
  res.json({ ok: true, database: Boolean(pool), assistant: Boolean(geminiApiKey) });
});

app.post("/api/assistant", assistantRateLimit, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 2_000) : "";
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-10).flatMap((item) => {
        const role = item?.role === "model" ? "model" : item?.role === "user" ? "user" : null;
        const text = typeof item?.text === "string" ? item.text.trim().slice(0, 2_000) : "";
        return role && text ? [{ role, parts: [{ text }] }] : [];
      })
    : [];
  const image = req.body?.image;
  const validImage = image
    && ["image/jpeg", "image/png", "image/webp"].includes(image.mimeType)
    && typeof image.data === "string"
    && image.data.length <= 5_500_000
    && /^[a-zA-Z0-9+/=]+$/.test(image.data);

  if (!message && !validImage) {
    res.status(400).json({ error: "Enter a question or attach a photo." });
    return;
  }

  if (!geminiApiKey) {
    res.json({ reply: fallbackAssistantReply(message, Boolean(validImage)), ai: false });
    return;
  }

  const parts = [];
  if (validImage) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  parts.push({ text: message || "Review this property photo for a preliminary pressure-washing estimate." });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: assistantInstructions }] },
        contents: [...history, { role: "user", parts }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 300 },
      }),
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const errorStatus = errorPayload?.error?.status || "unknown";
      throw new Error(`Gemini request failed with ${response.status} (${errorStatus})`);
    }
    const payload = await response.json();
    const reply = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!reply) throw new Error("Gemini returned an empty response");
    res.json({ reply, ai: true });
  } catch (error) {
    console.error("Assistant request failed:", error instanceof Error ? error.message : error);
    res.json({ reply: fallbackAssistantReply(message, Boolean(validImage)), ai: false });
  }
});

app.post("/api/public-leads", assistantRateLimit, requireDatabase, async (req, res, next) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 120) : "";
    const contact = typeof req.body?.contact === "string" ? req.body.contact.trim().slice(0, 180) : "";
    const address = typeof req.body?.address === "string" ? req.body.address.trim().slice(0, 300) : "";
    const service = typeof req.body?.service === "string" ? req.body.service.trim().slice(0, 120) : "General exterior cleaning";
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 4_000) : "";
    const estimatedValue = Number.isFinite(Number(req.body?.estimatedValue))
      ? Math.max(0, Math.min(100_000, Number(req.body.estimatedValue)))
      : 0;
    if (!name || !contact || !address) {
      res.status(400).json({ error: "Name, contact information, and address are required." });
      return;
    }
    const result = await pool.query(
      `insert into leads (id, name, contact, address, source, status, estimated_value, follow_up_date, notes)
       values ($1, $2, $3, $4, 'website quote assistant', 'new', $5, current_date, $6)
       returning *`,
      [`web-${randomUUID()}`, name, contact, address, estimatedValue, `Requested service: ${service}\n${notes}`.trim()],
    );
    res.status(201).json(toLead(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.get("/api/bootstrap", requireDatabase, async (_req, res, next) => {
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

app.post("/api/sync-sheets", requireDatabase, async (_req, res, next) => {
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

app.patch("/api/leads/:id", requireDatabase, async (req, res, next) => {
  try {
    const { status, notes, followUpDate } = req.body;
    const result = await pool.query(
      `update leads
       set status = coalesce($2, status),
           notes = coalesce($3, notes),
           follow_up_date = coalesce($4, follow_up_date)
       where id = $1
       returning *`,
      [req.params.id, status, notes, followUpDate],
    );
    res.json(toLead(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/jobs/:id", requireDatabase, async (req, res, next) => {
  try {
    const { status, paymentStatus, amountPaid, tipAmount, price, paymentMethod, notes, latitude, longitude } = req.body;
    const result = await pool.query(
      `update jobs
       set status = coalesce($2, status),
           payment_status = coalesce($3, payment_status),
           amount_paid = coalesce($4, amount_paid),
           tip_amount = coalesce($5, tip_amount),
           price = coalesce($6, price),
           payment_method = coalesce($7, payment_method),
           notes = coalesce($8, notes),
           latitude = coalesce($9, latitude),
           longitude = coalesce($10, longitude),
           geocoded_address = case
             when $9::double precision is not null and $10::double precision is not null then address
             else geocoded_address
           end
       where id = $1
       returning *`,
      [req.params.id, status, paymentStatus, amountPaid, tipAmount, price, paymentMethod, notes, latitude, longitude],
    );
    res.json(toJob(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.post("/api/solicitations", requireDatabase, async (req, res, next) => {
  try {
    const { address, latitude, longitude, solicitedDate, outcome, notes } = req.body;
    if (!address || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      res.status(400).json({ error: "Address and valid coordinates are required." });
      return;
    }
    const result = await pool.query(
      `insert into solicitations (address, latitude, longitude, solicited_date, outcome, notes)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [address, latitude, longitude, solicitedDate || new Date().toISOString().slice(0, 10), outcome || "no answer", notes || ""],
    );
    res.status(201).json(toSolicitation(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.patch("/api/solicitations/:id", requireDatabase, async (req, res, next) => {
  try {
    const { address, latitude, longitude, solicitedDate, outcome, notes } = req.body;
    const result = await pool.query(
      `update solicitations
       set address = coalesce($2, address),
           latitude = coalesce($3, latitude),
           longitude = coalesce($4, longitude),
           solicited_date = coalesce($5, solicited_date),
           outcome = coalesce($6, outcome),
           notes = coalesce($7, notes)
       where id = $1
       returning *`,
      [req.params.id, address, latitude, longitude, solicitedDate, outcome, notes],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Solicitation not found." });
      return;
    }
    res.json(toSolicitation(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.delete("/api/solicitations/:id", requireDatabase, async (req, res, next) => {
  try {
    const result = await pool.query("delete from solicitations where id = $1 returning id", [req.params.id]);
    res.json({ deleted: Boolean(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/invoices/:id", requireDatabase, async (req, res, next) => {
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

app.patch("/api/service-plans/:id", requireDatabase, async (req, res, next) => {
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
