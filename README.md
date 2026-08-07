# The Powerwashing Pros Dashboard

A full-stack React, TypeScript, Tailwind CSS, Express, and PostgreSQL dashboard for running a pressure washing business. Google Sheets remains the import source for operational records, while PostgreSQL preserves website-created records and edits.

## Features

- Tabbed SaaS dashboard layout with no marketing landing page
- Dashboard metrics for daily revenue, daily pay, jobs today, past due jobs, monthly revenue, unpaid invoices, tips, upcoming jobs, completed jobs, crew payouts, lead conversion, and customer insights
- Customer profiles with contact info, notes, past/upcoming jobs, spend, payment history, plan status, and insights
- Leads pipeline with source, status, estimated value, follow-up dates, notes, and conversion tracking
- Jobs management with status badges, assignment status, price, paid amount, tips, payment status, notes, before/after placeholders, and completion/past-due actions
- Day/week/month calendar view with clickable job cards and job detail modal
- Finance dashboard with clickable customer money views and editable job price, paid amount, tip, and payment method fields
- Invoices with selectable invoice history, paid/unpaid/partial/past-due tracking, discounts, tips, paid amount, owed amount, payment methods, and copy/print-style preview
- Service plans for monthly, 3-month, and yearly subscriptions
- Reviews dashboard imported from the **Powerwashing reviews** spreadsheet
- Reports with charts for revenue over time, paid vs unpaid invoices, service mix, best customers, average job value, repeat customer rate, lead conversion, tips, and payouts
- Light/dark mode toggle in the app header

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

The calendar week view now matches jobs by exact ISO date. For example, the imported row for **Hillary Ryan, 4132 Southwestern, Sunday June 14 at 9:00 AM** appears under **Sun 14**.

## Reviews Spreadsheet

The app also includes the real Google Drive spreadsheet named **Powerwashing reviews**. Imported review rows are normalized in `src/data/googleSheetData.ts` and displayed in the Reviews tab.

## Google Sheets Sync

The deployed app includes a **Sync sheets** button and a 60-second auto-sync loop. For security, the browser app does not store private Google Drive credentials directly. To make live sync work on Render, add a backend/API or Google Apps Script endpoint that returns JSON in this shape:

```json
{
  "customers": [],
  "jobs": [],
  "invoices": [],
  "servicePlans": [],
  "reviews": []
}
```

Then set this Render environment variable:

```bash
VITE_SHEETS_SYNC_URL=https://your-sync-endpoint.example.com/sheets
```

Until that endpoint exists, the dashboard uses the latest bundled snapshot imported from Google Drive.

## Google Maps And Canvassing

The Map tab combines completed-job coverage with SalesRabbit-style door-knocking records. Completed job addresses are geocoded once and their coordinates are saved in PostgreSQL. Solicitation pins are stored separately, so Google Sheets synchronization cannot remove them.

Enable these Google Maps Platform APIs in a Google Cloud project:

- Maps JavaScript API
- Geocoding API

Create a browser API key restricted to these website referrers:

```text
https://powerwash-ops-dashboard.onrender.com/*
http://localhost:4173/*
http://127.0.0.1:4173/*
```

Restrict the key to the Maps JavaScript API and Geocoding API, then add it to Render:

```bash
VITE_GOOGLE_MAPS_API_KEY=your_browser_restricted_key
```

Redeploy after adding the environment variable because Vite embeds browser environment variables during the production build.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Google Sign-In

Authentication uses Google Identity Services. Google verifies the person, and the server stores the app-specific age and role (`owner` or `employee`) in PostgreSQL. Both roles currently enter the same dashboard; their stored roles provide the base for separate owner and employee experiences later.

1. In Google Cloud, open **Google Auth Platform > Clients** and create an **OAuth 2.0 Client ID** with application type **Web application**.
2. Add `https://powerwash-ops-dashboard.onrender.com` and `http://localhost:4173` as authorized JavaScript origins.
3. Add the client ID to the Render web service:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

4. To prevent unauthorized people from creating accounts, set an optional shared signup code:

```bash
AUTH_SIGNUP_CODE=your-private-invite-code
```

If `AUTH_SIGNUP_CODE` is set, every first-time owner or employee must enter it. Returning users only use Google sign-in. The Google client ID is public by design; never expose `DATABASE_URL` or other server secrets in a `VITE_` variable.

Both roles currently have the same dashboard permissions. The stored role is the base for separate owner and employee views and server permissions later.

## Render Deployment

For a Render Web Service:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

## Database

The app now includes a Render/Postgres-ready backend in `server/`.

1. Create a PostgreSQL database in Render.
2. Copy its internal database URL.
3. Add it to the dashboard web service as:

```bash
DATABASE_URL=postgresql://...
NODE_ENV=production
```

4. Run the migration once:

```bash
npm run db:migrate
```

5. Import the current Google Sheets snapshot once:

```bash
SHEETS_SYNC_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec npm run db:seed:sheets
```

The schema is in `server/schema.sql`. The backend exposes:

- `GET /api/bootstrap`
- `POST /api/leads`
- `DELETE /api/leads/:id`
- `PATCH /api/leads/:id`
- `POST /api/calendar-events`
- `PATCH /api/calendar-events/:id`
- `DELETE /api/calendar-events/:id`
- `PATCH /api/jobs/:id`
- `PATCH /api/invoices/:id`
- `PATCH /api/service-plans/:id`

The browser should never receive the database password. Render keeps `DATABASE_URL` server-side.

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
- Finance, invoice, and service plan edits with API mutations
- Google Sheets sync endpoint with service-account or Apps Script authentication
- Authentication and user roles for owners, admins, and crew members
