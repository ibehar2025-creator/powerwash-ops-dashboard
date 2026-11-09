const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const openingIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const chicagoNow = "(now() at time zone 'America/Chicago')";
const weekendStart = "time '11:30'";
const weekendEnd = "time '18:30'";
const weekendId = date => `md5('powerwash-weekend:' || to_char(${date}, 'YYYY-MM-DD'))::uuid`;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

function validDate(date) {
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  return parsed && Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date && !date.startsWith('0000');
}

export function openingInput({ date, startTime, endTime }) {
  if (!validDate(date) || !timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
    throw fail(400, 'Choose a valid date and an end time after the start.');
  }
  return [date, startTime, endTime];
}

// Defaults are read-only until edited, removed, or reserved. Their IDs stay stable across refreshes.
const weekendRows = days => `select ${weekendId('days.date')} as id, days.date,
  ${weekendStart} as start_time, ${weekendEnd} as end_time
  from (${days}) days
  where days.date >= ${chicagoNow}::date and extract(isodow from days.date) in (6,7)
    and not exists (select 1 from sales_openings saved where saved.date=days.date and
      (saved.id=${weekendId('days.date')} or (not saved.closed and saved.start_time<${weekendEnd} and saved.end_time>${weekendStart})))`;
const singleWeekend = weekendRows('select $1::date as date');
const listedOpenings = `(select id,date,start_time,end_time from sales_openings where not closed
  union all ${weekendRows(`select ${chicagoNow}::date + n as date from generate_series(0,365) as offset_day(n)`)})`;

const openingQuery = source => `select o.id, o.date::text as date, left(o.start_time::text,5) as "startTime",
  left(o.end_time::text,5) as "endTime", o.id=${weekendId('o.date')} as "weekendDefault",
  case when b.saved then 'booked'
    when b.request_id is not null then 'pending'
    when o.date + o.start_time <= ${chicagoNow} then 'past'
    when exists (select 1 from jobs j where j.date=o.date and j.status <> 'canceled'
      and left(j.time,5) >= left(o.start_time::text,5) and left(j.time,5) < left(o.end_time::text,5)) then 'busy'
    else 'open' end as status
  from ${source} o left join sales_bookings b on b.opening_id=o.id`;

async function loadOpening(db, id, date) {
  const existing = await db.query(`${openingQuery('(select * from sales_openings where not closed)')} where o.id=$1`, [id]);
  if (existing.rows[0] || !validDate(date)) return existing.rows[0];
  await db.query(`insert into sales_openings (id,date,start_time,end_time)
    select id,date,start_time,end_time from (${singleWeekend}) weekend where id=$2 on conflict(id) do nothing`, [date, id]);
  return (await db.query(`${openingQuery('(select * from sales_openings where not closed)')} where o.id=$1`, [id])).rows[0];
}

async function withOpeningLock(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    // Serialize only publication and reservation, not external spreadsheet writes.
    await client.query('select pg_advisory_xact_lock(46079, 106)');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function reserveSalesOpening(pool, { requestId, salesmanId, jobId, customerId, data }) {
  return withOpeningLock(pool, async client => {
    const previous = await client.query('select request_id from sales_bookings where request_id=$1', [requestId]);
    if (previous.rows.length) return;
    const opening = await loadOpening(client, data.openingId, data.date);
    if (!opening || opening.status !== 'open' || opening.date !== data.date || opening.startTime !== data.time) {
      throw fail(409, 'This opening is no longer available. Close this form and choose another time.', 'OPENING_UNAVAILABLE');
    }
    await client.query(`insert into sales_bookings(request_id,salesman_id,job_id,customer_id,payload,opening_id)
      values($1,$2,$3,$4,$5,$6) on conflict(request_id) do nothing`,
    [requestId, salesmanId, jobId, customerId, JSON.stringify(data), data.openingId]);
  });
}

export function installSalesOpeningRoutes(app, { pool, requireDatabase, requireOwner, salesmanOnly }) {
  const route = fn => async (req, res, next) => {
    try { await fn(req, res); } catch (error) {
      if (error.status) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  };
  const ownerPath = '/api/owner/sales-openings';
  const byDate = 'order by date, "startTime", id';
  app.get(ownerPath, requireDatabase, requireOwner, route(async (_req, res) => {
    const { rows } = await pool.query(`${openingQuery(listedOpenings)} ${byDate}`);
    res.json({ openings: rows });
  }));
  app.get('/api/salesman/openings', requireDatabase, salesmanOnly, route(async (_req, res) => {
    const { rows } = await pool.query(`select id,date,"startTime","endTime" from (
      ${openingQuery(listedOpenings)} where o.date >= ${chicagoNow}::date
    ) openings where status='open' ${byDate}`);
    res.json({ openings: rows });
  }));
  const save = (edit) => route(async (req, res) => {
    const values = openingInput(req.body);
    const id = edit ? req.params.id : null;
    if (edit && !openingIdPattern.test(id)) throw fail(404, 'Opening not found.');
    const opening = await withOpeningLock(pool, async client => {
      if (edit) {
        const existing = await loadOpening(client, id, req.query?.date ?? values[0]);
        if (!existing) throw fail(404, 'Opening not found.');
        if (['pending', 'booked'].includes(existing.status)) throw fail(409, 'This opening already has a booking.');
        if (existing.weekendDefault && existing.date !== values[0]) throw fail(400, 'Change the hours for this date, or add an opening on another day.');
      }
      const { rows: [check] } = await client.query(`select ($1::date + $2::time) > ${chicagoNow} as future,
        exists(select 1 from sales_openings where date=$1 and not closed and start_time<$3::time and end_time>$2::time
          and id is distinct from $4::uuid) as overlaps,
        exists(select 1 from (${singleWeekend}) weekend where start_time<$3::time and end_time>$2::time) as "overlapsDefault"`, [...values, id]);
      if (!check.future) throw fail(400, 'Choose a start time in the future (Central time).');
      if (check.overlaps) throw fail(409, 'This overlaps another opening. Edit it or choose a different time.');
      if (check.overlapsDefault) throw fail(409, 'Edit or remove the weekend opening before adding overlapping hours.');
      const { rows: [saved] } = edit
        ? await client.query('update sales_openings set date=$1,start_time=$2,end_time=$3 where id=$4 returning id', [...values, id])
        : await client.query('insert into sales_openings(date,start_time,end_time) values($1,$2,$3) returning id', values);
      return (await client.query(`${openingQuery('sales_openings')} where o.id=$1`, [saved.id])).rows[0];
    });
    res.status(edit ? 200 : 201).json(opening);
  });
  app.post(ownerPath, requireDatabase, requireOwner, save(false));
  app.patch(`${ownerPath}/:id`, requireDatabase, requireOwner, save(true));
  app.delete(`${ownerPath}/:id`, requireDatabase, requireOwner, route(async (req, res) => {
    if (!openingIdPattern.test(req.params.id)) throw fail(404, 'Opening not found.');
    await withOpeningLock(pool, async client => {
      const opening = await loadOpening(client, req.params.id, req.query?.date);
      if (!opening) throw fail(404, 'Opening not found.');
      if (opening.status === 'pending') throw fail(409, 'A booking is awaiting confirmation for this opening.');
      if (opening.weekendDefault) await client.query('update sales_openings set closed=true where id=$1', [req.params.id]);
      else await client.query('delete from sales_openings where id=$1', [req.params.id]);
    });
    res.json({ deleted: true });
  }));
}
