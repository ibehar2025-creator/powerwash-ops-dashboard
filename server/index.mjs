import express from "express";
import cors from "cors";
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

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

app.use(cors());
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
  renewalDate: row.renewal_date?.toISOString?.().slice(0, 10) ?? row.renewal_date,
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

async function tableRows(table, orderBy = "created_at asc") {
  const result = await pool.query(`select * from ${table} order by ${orderBy}`);
  return result.rows;
}

async function loadSnapshot() {
  const [customers, leads, jobs, invoices, servicePlans, reviews, expenses] = await Promise.all([
    tableRows("customers", "name asc"),
    tableRows("leads", "follow_up_date asc nulls last, created_at asc"),
    tableRows("jobs", "date asc, time asc"),
    tableRows("invoices", "issued_date desc nulls last, created_at desc"),
    tableRows("service_plans", "renewal_date asc nulls last"),
    tableRows("reviews", "submitted_at desc"),
    tableRows("expenses", "date desc"),
  ]);

  return {
    customers: customers.map(toCustomer),
    leads: leads.map(toLead),
    jobs: jobs.map(toJob),
    invoices: invoices.map(toInvoice),
    servicePlans: servicePlans.map(toServicePlan),
    reviews: reviews.map(toReview),
    expenses,
  };
}

async function upsertCustomers(client, customers = []) {
  for (const customer of customers) {
    await client.query(
      `insert into customers (id, name, phone, email, address, notes, subscribed_plan_id, insights)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set
         name = excluded.name,
         phone = excluded.phone,
         email = excluded.email,
         address = excluded.address,
         notes = excluded.notes,
         subscribed_plan_id = excluded.subscribed_plan_id,
         insights = excluded.insights`,
      [customer.id, customer.name, customer.phone ?? "", customer.email ?? "", customer.address ?? "", customer.notes ?? "", customer.subscribedPlanId ?? null, customer.insights ?? []],
    );
  }
}

async function upsertLeads(client, leads = []) {
  for (const lead of leads) {
    await client.query(
      `insert into leads (id, name, contact, address, source, status, estimated_value, follow_up_date, notes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (id) do update set
         name = excluded.name,
         contact = excluded.contact,
         address = excluded.address,
         source = excluded.source,
         status = excluded.status,
         estimated_value = excluded.estimated_value,
         follow_up_date = excluded.follow_up_date,
         notes = excluded.notes`,
      [lead.id, lead.name, lead.contact ?? "", lead.address ?? "", lead.source ?? "", lead.status ?? "new", lead.estimatedValue ?? 0, lead.followUpDate || null, lead.notes ?? ""],
    );
  }
}

async function upsertJobs(client, jobs = []) {
  for (const job of jobs) {
    await client.query(
      `insert into jobs (
         id, date, time, customer_id, address, service_type, status, crew_ids,
         price, amount_paid, tip_amount, payment_status, payment_method, notes,
         before_photo, after_photo, source
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
         source = excluded.source`,
      [
        job.id,
        job.date,
        job.time,
        job.customerId,
        job.address ?? "",
        job.serviceType ?? "",
        job.status ?? "scheduled",
        job.crewIds ?? [],
        job.price ?? 0,
        job.amountPaid ?? 0,
        job.tipAmount ?? 0,
        job.paymentStatus ?? "unpaid",
        job.paymentMethod ?? null,
        job.notes ?? "",
        job.beforePhoto ?? null,
        job.afterPhoto ?? null,
        job.source ?? "spreadsheet-import",
      ],
    );
  }
}

async function upsertInvoices(client, invoices = []) {
  for (const invoice of invoices) {
    await client.query(
      `insert into invoices (
         id, customer_id, job_id, service_description, price, discount, tip,
         payment_method, status, amount_paid, due_date, issued_date
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      [invoice.id, invoice.customerId, invoice.jobId, invoice.serviceDescription ?? "", invoice.price ?? 0, invoice.discount ?? 0, invoice.tip ?? 0, invoice.paymentMethod ?? null, invoice.status ?? "unpaid", invoice.amountPaid ?? 0, invoice.dueDate || null, invoice.issuedDate || null],
    );
  }
}

async function upsertReviews(client, reviews = []) {
  for (const review of reviews) {
    await client.query(
      `insert into reviews (id, submitted_at, name, rating, review, source)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set
         submitted_at = excluded.submitted_at,
         name = excluded.name,
         rating = excluded.rating,
         review = excluded.review,
         source = excluded.source`,
      [review.id, review.submittedAt, review.name ?? "", review.rating ?? 5, review.review ?? "", review.source ?? "spreadsheet-import"],
    );
  }
}

async function syncSheetsIntoDatabase(payload) {
  const client = await pool.connect();
  const customerIds = (payload.customers ?? []).map((customer) => customer.id);
  const jobIds = (payload.jobs ?? []).map((job) => job.id);
  const invoiceIds = (payload.invoices ?? []).map((invoice) => invoice.id);
  const reviewIds = (payload.reviews ?? []).map((review) => review.id);

  try {
    await client.query("begin");
    await upsertCustomers(client, payload.customers);
    await upsertLeads(client, payload.leads);
    await upsertJobs(client, payload.jobs);
    await upsertInvoices(client, payload.invoices);
    await upsertReviews(client, payload.reviews);
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

app.get("/api/bootstrap", requireDatabase, async (_req, res, next) => {
  try {
    res.json(await loadSnapshot());
  } catch (error) {
    next(error);
  }
});

app.post("/api/sync-sheets", requireDatabase, async (_req, res, next) => {
  try {
    if (!syncUrl) {
      res.status(503).json({ error: "SHEETS_SYNC_URL is not configured." });
      return;
    }

    const response = await fetch(syncUrl);
    if (!response.ok) throw new Error(`Sheet sync endpoint failed with ${response.status}`);

    const payload = await response.json();
    await syncSheetsIntoDatabase(payload);
    res.json(await loadSnapshot());
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
    const { status, paymentStatus, amountPaid, tipAmount, price, paymentMethod, notes } = req.body;
    const result = await pool.query(
      `update jobs
       set status = coalesce($2, status),
           payment_status = coalesce($3, payment_status),
           amount_paid = coalesce($4, amount_paid),
           tip_amount = coalesce($5, tip_amount),
           price = coalesce($6, price),
           payment_method = coalesce($7, payment_method),
           notes = coalesce($8, notes)
       where id = $1
       returning *`,
      [req.params.id, status, paymentStatus, amountPaid, tipAmount, price, paymentMethod, notes],
    );
    res.json(toJob(result.rows[0]));
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

app.listen(port, "0.0.0.0", () => {
  console.log(`The Powerwashing Pros dashboard listening on ${port}`);
});
