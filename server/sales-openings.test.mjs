import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { installSalesOpeningRoutes, openingInput, reserveSalesOpening } from './sales-openings.mjs';
import { salesmanOnly } from './sales.mjs';

test('opening requires a real date and an ordered same-day time range', () => {
  assert.deepEqual(openingInput({ date: '2099-06-03', startTime: '09:00', endTime: '11:00' }), ['2099-06-03', '09:00', '11:00']);
  for (const [date, startTime, endTime] of [
    ['2099-02-29', '09:00', '11:00'], ['2099-06-03', '09:00', '09:00'],
    ['2099-06-03', '23:30', '01:00'], ['2099-06-03', '9:00', '11:00'], ['2099-06-03', '22:00', '24:00'],
  ]) assert.throws(() => openingInput({ date, startTime, endTime }), { status: 400 });
});

test('only owners can manage openings and only salesmen can read the sales projection', () => {
  const handlers = [];
  const app = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (path, ...route) => handlers.push({ path, route })]));
  const requireOwner = () => {};
  installSalesOpeningRoutes(app, { requireOwner, salesmanOnly });
  assert.equal(handlers.length, 5);
  for (const { path, route } of handlers) assert.equal(route[1], path.startsWith('/api/owner/') ? requireOwner : salesmanOnly);
});

test('Postgres persists openings, blocks conflicts, and keeps retries tied to one booking', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table user_accounts(id uuid primary key);
      create table jobs(date date not null,time text not null,status text not null,retained_for_payroll boolean not null default false);`);
    const schema = await readFile(new URL('./sales-schema.sql', import.meta.url), 'utf8');
    await db.exec(schema.slice(schema.indexOf('create table if not exists sales_bookings'), schema.indexOf('create table if not exists sales_credits')));
    const dbQuery = db.query.bind(db);
    const pool = { query: dbQuery, connect: async () => ({ query: dbQuery, release() {} }) };
    const routes = new Map();
    const app = Object.fromEntries(['get', 'post', 'patch', 'delete'].map(method => [method, (path, ...route) => routes.set(`${method} ${path}`, route.at(-1))]));
    installSalesOpeningRoutes(app, { pool, salesmanOnly });
    const path = '/api/owner/sales-openings';
    const call = async (method, path, body = {}, id, query = {}) => {
      const res = { code: 200, status(code) { this.code = code; return this; }, json(result) { this.result = result; } };
      await routes.get(`${method} ${path}`)({ body, params: { id }, query }, res, error => { throw error; });
      return res;
    };
    const hours = { date: '2099-06-03', startTime: '09:00', endTime: '11:00' };
    const { code, result: first } = await call('post', path, hours);
    assert.equal(code, 201);
    assert.equal(first.status, 'open');
    assert.equal((await call('post', path, { ...hours, startTime: '10:00' })).code, 409);
    const { result: second } = await call('post', path, { ...hours, startTime: '11:00', endTime: '13:00' });
    assert.equal((await call('post', path, { ...hours, date: '2000-06-03' })).code, 400);
    await db.query("insert into jobs values($1,'11:30','scheduled')", [hours.date]);
    const salesOpenings = async () => (await call('get', '/api/salesman/openings')).result.openings;
    const ownerOpenings = async () => (await call('get', path)).result.openings;
    const manualDay = async () => (await salesOpenings()).filter(item => item.date === hours.date);
    assert.deepEqual(await manualDay(), [{ id: first.id, ...hours }]);
    await db.query("update jobs set status='canceled'");
    assert.equal((await manualDay()).length, 2);
    const salesmanId = '11111111-1111-4111-8111-111111111111';
    await db.query('insert into user_accounts values($1)', [salesmanId]);
    const claim = { requestId: '22222222-2222-4222-8222-222222222222', salesmanId, jobId: 'job-one', customerId: 'customer-one',
      data: { openingId: first.id, date: hours.date, time: hours.startTime } };
    await assert.rejects(reserveSalesOpening(pool, { ...claim, data: { ...claim.data, time: '10:00' } }), { code: 'OPENING_UNAVAILABLE' });
    await reserveSalesOpening(pool, claim);
    await reserveSalesOpening(pool, claim);
    await assert.rejects(reserveSalesOpening(pool, { ...claim, requestId: '33333333-3333-4333-8333-333333333333' }), { code: 'OPENING_UNAVAILABLE' });
    assert.equal((await call('delete', `${path}/:id`, {}, first.id)).code, 409);
    assert.equal((await call('patch', `${path}/:id`, hours, first.id)).code, 409);
    await db.query('update sales_bookings set saved=true where request_id=$1', [claim.requestId]);
    assert.equal((await ownerOpenings()).find(item => item.id === first.id).status, 'booked');
    assert.equal((await call('delete', `${path}/:id`, {}, first.id)).code, 200);
    assert.equal((await db.query('select opening_id from sales_bookings')).rows[0].opening_id, null);
    const { result: updated } = await call('patch', `${path}/:id`, { ...hours, startTime: '12:00', endTime: '14:00' }, second.id);
    assert.equal(updated.startTime, '12:00');

    const { rows: [weekend] } = await db.query(`select day::text as saturday,(day+1)::text as sunday,
      (day+7)::text as "nextSaturday",(day+8)::text as "nextSunday"
      from (select today + 7 + ((13-extract(isodow from today)::int)%7) as day
        from (select (now() at time zone 'America/Chicago')::date as today) current_day) weekend`);
    const defaults = (await salesOpenings()).filter(item => [weekend.saturday, weekend.sunday].includes(item.date));
    assert.equal(defaults.length, 2);
    for (const day of defaults) assert.deepEqual(Object.keys(day).sort(), ['date','endTime','id','startTime']);
    assert.ok(defaults.every(day => day.startTime === '11:30' && day.endTime === '18:30'));
    assert.equal((await db.query('select count(*)::int as count from sales_openings')).rows[0].count, 1);
    assert.deepEqual((await salesOpenings()).filter(item => [weekend.saturday, weekend.sunday].includes(item.date)), defaults);
    const [saturday, sunday] = defaults;
    assert.equal((await call('post', path, { date: saturday.date, startTime: '13:00', endTime: '14:00' })).code, 409);
    assert.equal((await call('patch', `${path}/:id`, { date: sunday.date, startTime: '12:00', endTime: '15:00' }, saturday.id, { date: saturday.date })).code, 400);
    const { result: adjusted } = await call('patch', `${path}/:id`, { date: saturday.date, startTime: '12:00', endTime: '15:00' }, saturday.id, { date: saturday.date });
    assert.equal(adjusted.weekendDefault, true);
    assert.equal(adjusted.startTime, '12:00');
    assert.equal((await call('delete', `${path}/:id`, {}, sunday.id, { date: sunday.date })).code, 200);
    assert.equal((await salesOpenings()).some(item => item.date === sunday.date), false);
    assert.equal((await salesOpenings()).find(item => item.date === weekend.nextSaturday).startTime, '11:30');
    assert.equal((await salesOpenings()).find(item => item.date === weekend.nextSunday).endTime, '18:30');
    assert.equal((await call('post', path, { date: sunday.date, startTime: '14:00', endTime: '16:00' })).code, 201);
    assert.equal((await salesOpenings()).find(item => item.date === sunday.date).startTime, '14:00');
    await db.query("insert into sales_openings(date,start_time,end_time) values($1,'14:00','17:00')", [weekend.nextSunday]);
    assert.deepEqual((await salesOpenings()).filter(item => item.date === weekend.nextSunday).map(item => item.startTime), ['14:00']);

    const virtual = (await salesOpenings()).find(item => item.date === weekend.nextSaturday);
    const weekendClaim = { ...claim, requestId: '44444444-4444-4444-8444-444444444444', jobId: 'weekend-job',
      data: { openingId: virtual.id, date: virtual.date, time: virtual.startTime } };
    await reserveSalesOpening(pool, weekendClaim);
    await reserveSalesOpening(pool, weekendClaim);
    assert.equal((await ownerOpenings()).find(item => item.id === virtual.id).status, 'pending');
    assert.equal((await salesOpenings()).some(item => item.id === virtual.id), false);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from sales_openings'), /permission denied/);
  } finally { await db.close(); }
});
