import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const syncUrl = process.env.SHEETS_SYNC_URL || process.env.VITE_SHEETS_SYNC_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (!syncUrl) {
  console.error("SHEETS_SYNC_URL or VITE_SHEETS_SYNC_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

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
      [
        customer.id,
        customer.name,
        customer.phone ?? "",
        customer.email ?? "",
        customer.address ?? "",
        customer.notes ?? "",
        customer.subscribedPlanId ?? null,
        customer.insights ?? [],
      ],
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
      [
        lead.id,
        lead.name,
        lead.contact ?? "",
        lead.address ?? "",
        lead.source ?? "",
        lead.status ?? "new",
        lead.estimatedValue ?? 0,
        lead.followUpDate || null,
        lead.notes ?? "",
      ],
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
      [
        invoice.id,
        invoice.customerId,
        invoice.jobId,
        invoice.serviceDescription ?? "",
        invoice.price ?? 0,
        invoice.discount ?? 0,
        invoice.tip ?? 0,
        invoice.paymentMethod ?? null,
        invoice.status ?? "unpaid",
        invoice.amountPaid ?? 0,
        invoice.dueDate || null,
        invoice.issuedDate || null,
      ],
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
      [
        review.id,
        review.submittedAt,
        review.name ?? "",
        review.rating ?? 5,
        review.review ?? "",
        review.source ?? "spreadsheet-import",
      ],
    );
  }
}

const response = await fetch(syncUrl);

if (!response.ok) {
  throw new Error(`Sheet sync endpoint failed with ${response.status}`);
}

const payload = await response.json();
const client = await pool.connect();

try {
  await client.query("begin");
  await upsertCustomers(client, payload.customers);
  await upsertLeads(client, payload.leads);
  await upsertJobs(client, payload.jobs);
  await upsertInvoices(client, payload.invoices);
  await upsertReviews(client, payload.reviews);
  await client.query("commit");
  console.log("Imported spreadsheet data into Postgres.");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}
