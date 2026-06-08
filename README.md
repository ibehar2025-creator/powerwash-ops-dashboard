# PowerWash Ops Dashboard

A clean full-stack-ready React, TypeScript, and Tailwind CSS dashboard for running a pressure washing business. The current version uses local mock data, with data boundaries and comments in place so jobs, customers, invoices, payments, and settings can later move to a database/API.

## Features

- Tabbed SaaS dashboard layout with no marketing landing page
- Dashboard metrics for daily revenue, daily pay, jobs today, past due jobs, monthly revenue, unpaid invoices, tips, upcoming jobs, completed jobs, crew payouts, lead conversion, and customer insights
- Customer profiles with contact info, notes, past/upcoming jobs, spend, payment history, plan status, and insights
- Leads pipeline with source, status, estimated value, follow-up dates, notes, and conversion tracking
- Jobs management with status badges, crews, price, paid amount, tips, payment status, notes, before/after placeholders, and completion/past-due actions
- Day/week/month calendar view with clickable job cards and job detail modal
- Crew management with assigned/completed jobs, daily pay, weekly pay, commissions, payout status, performance notes, and missed-work notes
- Finance dashboard for revenue, paid/unpaid amounts, tips, expenses, profit, crew payouts, owed worker pay, past due payments, payment methods, and daily pay
- Invoices with paid/unpaid/partial/past-due tracking, discounts, tips, paid amount, owed amount, payment methods, payment history, and copy/print-style preview
- Service plans for monthly, 6-month, and yearly subscriptions
- Reports with charts for revenue over time, paid vs unpaid invoices, service mix, best customers, average job value, repeat customer rate, lead conversion, tips, and payouts
- Admin settings for business profile, invoice message, tax/discount/commission defaults, payment methods, service types, and light/dark mode

## Upcoming Jobs Spreadsheet

The app is wired to the real Google Drive spreadsheet named **Upcoming Jobs**. Imported data is normalized in `src/data/googleSheetData.ts` from these tabs:

- `Sheet1`: main job list
- `Check-Ups`: prospect/check-up follow-ups
- `Recurring Jobs`: recurring service plan data

Some spreadsheet date cells used informal text such as "Wednesday anytime morning 11th June"; those rows were normalized into ISO dates for dashboard calculations while preserving the original text in job notes.

To connect the real spreadsheet later:

1. Keep the Google Sheet as the operational source of truth or export it as CSV/XLSX.
2. Parse rows on the backend or during a one-time import.
3. Map those rows through `src/data/spreadsheetImport.ts`.
4. Store normalized customers, jobs, crew assignments, invoices, and payments in your database.
5. Replace the local imports in `src/data/googleSheetData.ts` with API/database calls.

The imported upcoming job data appears in the Dashboard, Jobs, Calendar, Customers, Finance, and Reports sections.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

The app was developed with:

- React
- TypeScript
- Tailwind CSS
- Vite
- Lucide icons
- Recharts

## Backend Integration Notes

The current app is frontend-first with local typed data. Future backend/database/API integration should replace:

- `src/data/mockData.ts` with data fetchers
- `src/data/spreadsheetImport.ts` with real CSV/XLSX parsing and validation
- Invoice creation buttons with API mutations
- Job status buttons with API mutations
- Admin settings inputs with persisted settings
- Authentication and user roles for owners, admins, and crew members
