import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { pruneMissingImportedJobs } from './imported-job-retention.mjs';

test('job deletion rejects payroll-linked jobs before writing to Google Sheets', async () => {
  const source = await readFile(new URL('./index.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('app.delete("/api/jobs/:id"');
  const end = source.indexOf('app.delete("/api/leads/:id"', start);
  const calls = [];
  const client = {
    query: async (sql, args) => {
      calls.push(sql);
      if (sql.includes('for update')) {
        assert.deepEqual([...args], ['paid-job']);
        return { rows: [{ id: 'paid-job' }] };
      }
      if (sql.startsWith('select 1 from payroll_run_lines')) return { rows: [{ one: 1 }] };
      if (sql === 'begin' || sql === 'rollback') return { rows: [] };
      assert.fail(`Unexpected query: ${sql}`);
    },
    release: () => calls.push('release'),
  };
  let handler;
  vm.runInNewContext(source.slice(start, end), {
    app: { delete: (_path, _database, _owner, route) => { handler = route; } },
    requireDatabase() {},
    requireOwner() {},
    pool: { connect: async () => client },
    runSheetAction: () => assert.fail('Payroll-linked jobs must not be removed from Sheets'),
  });
  const res = { code: 200, status(code) { this.code = code; return this; }, json(result) { this.result = result; } };
  await handler({ params: { id: 'paid-job' } }, res, error => { throw error; });
  assert.equal(res.code, 409);
  assert.match(res.result.error, /linked to payroll/);
  assert.deepEqual(calls.slice(-2), ['rollback', 'release']);
});

test('Postgres sync keeps payroll jobs and payroll amounts when sheet rows disappear', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`create table jobs (id text primary key, source text not null, status text not null, updated_at timestamptz not null, retained_for_payroll boolean not null default false);
      create table payroll_run_lines (job_id text references jobs(id) on delete restrict, amount numeric not null);
      create table sales_credits (job_id text references jobs(id) on delete restrict);
      insert into jobs values
        ('worker-paid','spreadsheet-import','completed','2026-11-01'),
        ('both-paid','spreadsheet-import','completed','2026-11-01'),
        ('sales-only','spreadsheet-import','scheduled','2026-11-01'),
        ('unlinked','spreadsheet-import','scheduled','2026-11-01'),
        ('still-on-sheet','spreadsheet-import','scheduled','2026-11-01'),
        ('recent-edit','spreadsheet-import','scheduled','2026-11-09T16:00:00Z'),
        ('manual','manual','scheduled','2026-11-01');
      insert into payroll_run_lines values ('worker-paid',105.25),('both-paid',55.5);
      insert into sales_credits values ('both-paid'),('sales-only');`);
    await assert.rejects(db.query("delete from jobs where id='worker-paid'"), { constraint: 'payroll_run_lines_job_id_fkey' });
    const snapshotStartedAt = '2026-11-09T15:00:00Z';
    for (let attempt = 0; attempt < 2; attempt++) {
      await db.transaction(async client => pruneMissingImportedJobs(client, ['still-on-sheet'], snapshotStartedAt));
    }
    const jobs = (await db.query('select id,status from jobs order by id')).rows;
    assert.deepEqual(jobs, [
      { id: 'both-paid', status: 'completed' },
      { id: 'manual', status: 'scheduled' },
      { id: 'recent-edit', status: 'scheduled' },
      { id: 'sales-only', status: 'canceled' },
      { id: 'still-on-sheet', status: 'scheduled' },
      { id: 'worker-paid', status: 'completed' },
    ]);
    assert.deepEqual((await db.query('select id from jobs where retained_for_payroll order by id')).rows, [
      { id: 'both-paid' }, { id: 'worker-paid' },
    ]);
    assert.deepEqual((await db.query('select job_id,amount::float8 as amount from payroll_run_lines order by job_id')).rows, [
      { job_id: 'both-paid', amount: 55.5 }, { job_id: 'worker-paid', amount: 105.25 },
    ]);
  } finally { await db.close(); }
});
