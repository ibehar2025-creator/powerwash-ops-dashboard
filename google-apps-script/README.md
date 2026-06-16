# Google Apps Script Sheet Endpoint

Merge `Code.gs` into the existing Apps Script project that powers `VITE_SHEETS_SYNC_URL`.

Keep the existing `doGet` sync code. Add the `doPost`, `appendUpcomingJob`, and `formatJobDate` functions so the dashboard can save new clients/jobs into the `Upcoming Jobs` tab.

After saving the script, deploy a new web app version with access set to anyone with the link.
