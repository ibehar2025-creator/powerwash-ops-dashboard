# Salesman Accounts

## Deployment

This feature is for the Powerwashing Pros dashboard only. It reuses the existing
Google sign-in, Maps key, Sheets endpoint, PostgreSQL/Supabase database, push
notifications, and contractor payments.

1. Apply `server/sales-schema.sql` to the existing database. The server migration
   runner and startup schema initializer also include it. Existing accounts and
   jobs do not receive sales credit.
2. Configure a separate private `AUTH_SALESMAN_CODE` on the dashboard's Render
   service, not the marketing service. Do not put it in a `VITE_` variable or Git.
3. Deploy and create a new Google account profile with role **Salesman** and that
   code. Existing profiles keep their current role.

## Access

Salesmen have Dashboard, Map, My Jobs, Leads, and My Earnings. Server-side checks
block owner and employee APIs. Inactive accounts cannot sign in or use existing
sessions. Owners manage activation from Team.

The map includes past and future property history, but other jobs return only
customer name, address, service, date, time, status, and coordinates. Prices,
contacts, private notes, and company financial data are not returned for other
customers. Personal payroll statements contain only that salesman's lines,
adjustments, payments, and recalculated totals.

The browser build no longer includes the old historical spreadsheet snapshot or
a direct Sheets-fetch fallback. Business data loads only through authenticated,
role-checked server endpoints.

## Booking And Follow-Ups

Map property selection prefills the address and coordinates. The salesman can
create a new customer and booking. Bookings write to Sheets and Supabase and
appear in the normal owner calendar. Owners receive booking and edit notices.

Each booking reserves stable customer/job/request IDs before writing to Sheets.
After an uncertain response or database failure, retry the same booking. The
server checks the sheet's stable IDs before appending. A pending browser draft
survives refresh and cannot be changed while confirmation is uncertain. Deleted
saved bookings cannot be recreated by replaying their old request.

Salesmen can edit only their own future scheduled jobs. Started, completed,
past, or canceled jobs require an owner. Changing a typed address clears stale
coordinates. Map follow-ups become private leads visible to owners and can be
converted once into a booking. Reminders include overdue, today, and the next
seven days. Opening the inbox marks items seen; explicit checks mark them read,
independently for each account.

## Commission And Payments

- Sales credit belongs to the authenticated creator, independently of the worker.
- Commission is 20% of the corrected service price: $450 earns $90.
- Applied worker upsells, tips, and gas reimbursements are excluded.
- Owner-created jobs and automatically generated recurring visits earn no sales
  commission. No historical jobs are backfilled with sales credit.
- Completion creates a review item. Owners review worker earnings first so the
  sales basis excludes applied upsells.
- Approval freezes the amount. A later correction requires a reason, return to
  review, and another approval. Payroll-linked or paid commissions stay locked;
  use an explicit Contractor Pay adjustment instead.
- Worker approval preserves the latest service price and tracks applied upsells.
  Existing employee commission percentages are unchanged.
- A spreadsheet read cannot overwrite job edits made after that read began.
- Payroll uses `sales_commission` with a unique source key, so worker and salesman
  earnings coexist without duplicate lines. Correction weeks are selectable and
  contractor totals include additions and deductions.

The existing 14-minute sync interval remains unchanged. Payroll records track
payments made outside the app; recording payment does not transfer money.

## Verification

Run TypeScript, ESLint, the sales/security and existing worker/payroll tests, and
`tests/sales-ui.mjs` against a production build. The browser test uses synthetic
data at 360px, 390px, and 1440px, with simulated iPhone safe-area insets.
`server/sales-verification.sql` validates the real database commission lifecycle,
then rolls back every test record. A real new-user Google login and live Google
Maps key must still be checked during rollout.
