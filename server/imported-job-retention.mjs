export async function pruneMissingImportedJobs(client, jobIds, snapshotStartedAt) {
  const params = [jobIds, snapshotStartedAt];
  const missing = `source = 'spreadsheet-import' and not (id = any($1::text[]))
    and updated_at <= $2::timestamptz`;
  const payrollLink = "exists (select 1 from payroll_run_lines where job_id = jobs.id)";
  const eligible = `${missing} and not ${payrollLink}`;

  // Lock candidates before rechecking payroll links in the surrounding sync transaction.
  await client.query(`select id from jobs where ${missing} and not retained_for_payroll order by id for update`, params);
  await client.query(`update jobs set retained_for_payroll = true
    where ${missing} and not retained_for_payroll and ${payrollLink}`, params);
  await client.query(`update jobs set status = 'canceled', updated_at = clock_timestamp()
    where ${eligible} and status <> 'canceled'
    and exists (select 1 from sales_credits where job_id = jobs.id)`, params);
  await client.query(`delete from jobs where ${eligible}
    and not exists (select 1 from sales_credits where job_id = jobs.id)`, params);
}
