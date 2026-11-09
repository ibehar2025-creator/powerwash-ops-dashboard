const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const openingIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const chicagoNow = "(now() at time zone 'America/Chicago')";
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

export function openingInput({ date, startTime, endTime }) {
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date || date.startsWith('0000') ||
      !timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
    throw fail(400, 'Choose a valid date and an end time after the start.');
  }
  return [date, startTime, endTime];
}

const openingQuery = `select o.id, o.date::text as date, left(o.start_time::text,5) as "startTime",
  left(o.end_time::text,5) as "endTime",
  case when b.saved then 'booked'
    when b.request_id is not null then 'pending'
    when o.date + o.start_time <= ${chicagoNow} then 'past'
    when exists (select 1 from jobs j where j.date=o.date and j.status <> 'canceled'
      and left(j.time,5) >= left(o.start_time::text,5) and left(j.time,5) < left(o.end_time::text,5)) then 'busy'
    else 'open' end as status
  from sales_openings o left join sales_bookings b on b.opening_id=o.id`;

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
    const { rows: [opening] } = await client.query(`${openingQuery} where o.id=$1`, [data.openingId]);
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
    const { rows } = await pool.query(`${openingQuery} ${byDate}`);
    res.json({ openings: rows });
  }));
  app.get('/api/salesman/openings', requireDatabase, salesmanOnly, route(async (_req, res) => {
    const { rows } = await pool.query(`select id,date,"startTime","endTime" from (
      ${openingQuery} where o.date >= ${chicagoNow}::date
    ) openings where status='open' ${byDate}`);
    res.json({ openings: rows });
  }));
  const save = (edit) => route(async (req, res) => {
    const values = openingInput(req.body);
    const id = edit ? req.params.id : null;
    if (edit && !openingIdPattern.test(id)) throw fail(404, 'Opening not found.');
    const opening = await withOpeningLock(pool, async client => {
      if (edit) {
        const { rows: [existing] } = await client.query(`${openingQuery} where o.id=$1`, [id]);
        if (!existing) throw fail(404, 'Opening not found.');
        if (['pending', 'booked'].includes(existing.status)) throw fail(409, 'This opening already has a booking.');
      }
      const { rows: [check] } = await client.query(`select ($1::date + $2::time) > ${chicagoNow} as future,
        exists(select 1 from sales_openings where date=$1 and start_time<$3::time and end_time>$2::time
          and id is distinct from $4::uuid) as overlaps`, [...values, id]);
      if (!check.future) throw fail(400, 'Choose a start time in the future (Central time).');
      if (check.overlaps) throw fail(409, 'This overlaps another opening. Edit it or choose a different time.');
      const { rows: [saved] } = edit
        ? await client.query('update sales_openings set date=$1,start_time=$2,end_time=$3 where id=$4 returning id', [...values, id])
        : await client.query('insert into sales_openings(date,start_time,end_time) values($1,$2,$3) returning id', values);
      return (await client.query(`${openingQuery} where o.id=$1`, [saved.id])).rows[0];
    });
    res.status(edit ? 200 : 201).json(opening);
  });
  app.post(ownerPath, requireDatabase, requireOwner, save(false));
  app.patch(`${ownerPath}/:id`, requireDatabase, requireOwner, save(true));
  app.delete(`${ownerPath}/:id`, requireDatabase, requireOwner, route(async (req, res) => {
    if (!openingIdPattern.test(req.params.id)) throw fail(404, 'Opening not found.');
    await withOpeningLock(pool, async client => {
      const { rows: [opening] } = await client.query(`${openingQuery} where o.id=$1`, [req.params.id]);
      if (!opening) throw fail(404, 'Opening not found.');
      if (opening.status === 'pending') throw fail(409, 'A booking is awaiting confirmation for this opening.');
      await client.query('delete from sales_openings where id=$1', [req.params.id]);
    });
    res.json({ deleted: true });
  }));
}
