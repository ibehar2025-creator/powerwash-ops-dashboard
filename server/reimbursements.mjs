import { readFile } from 'node:fs/promises';

export async function ensureReimbursementSchema(db) {
  await db.query(await readFile(new URL('./reimbursement-schema.sql', import.meta.url), 'utf8'));
}

export function validateReimbursementItems(value, { required = false } = {}) {
  if (!Array.isArray(value) || value.length > 30 || (required && !value.length)) throw new Error('Add between 1 and 30 reimbursement items.');
  let cents = 0;
  const items = value.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 200) throw new Error('Enter a name for each reimbursement item (up to 200 characters).');
    if (!['number','string'].includes(typeof item.cost) || String(item.cost).trim() === '') throw new Error('Enter a cost for each reimbursement item.');
    const cost = Number(item.cost);
    if (!Number.isFinite(cost) || cost <= 0 || cost > 999999.99 || Math.abs(cost * 100 - Math.round(cost * 100)) > 0.000001) throw new Error('Item costs must be positive amounts with at most two decimal places.');
    cents += Math.round(cost * 100);
    return { name: item.name.trim(), cost: Math.round(cost * 100) / 100 };
  });
  if (cents > 99999999) throw new Error('The reimbursement total is too large.');
  return { items, amount: cents / 100 };
}

export const toReimbursement = row => ({
  id: row.id, employeeId: row.employee_id, employeeName: row.employee_name ?? 'Employee',
  expenseDate: row.expense_date?.toISOString?.().slice(0,10) ?? row.expense_date,
  items: row.items, amount: Number(row.amount), notes: row.notes, status: row.status, ownerNote: row.owner_note,
  createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  reviewedAt: row.reviewed_at?.toISOString?.() ?? row.reviewed_at,
  paidAt: row.paid_at?.toISOString?.() ?? row.paid_at,
});

export async function loadReimbursements(db, employeeId) {
  const result = await db.query(`select rr.*, ua.name as employee_name from reimbursement_requests rr
    join user_accounts ua on ua.id=rr.employee_id ${employeeId ? 'where rr.employee_id=$1' : ''}
    order by rr.created_at desc`, employeeId ? [employeeId] : []);
  return result.rows.map(toReimbursement);
}

export async function reimbursementPayrollLines(db, periodEnd) {
  const result = await db.query(`select rr.*,ua.name as employee_name from reimbursement_requests rr
    join user_accounts ua on ua.id=rr.employee_id where rr.status='approved' and rr.expense_date <= $1
    and not exists(select 1 from payroll_run_lines prl where prl.reimbursement_request_id=rr.id)
    order by rr.expense_date,rr.id`, [periodEnd]);
  const pending = await db.query("select count(*)::int as count from reimbursement_requests where status='pending' and expense_date <= $1", [periodEnd]);
  return { missingApprovals: pending.rows[0]?.count ?? 0, lines: result.rows.map(row => ({
    sourceKey: `reimbursement:${row.id}`, id: `reimbursement:${row.id}`, employeeId: row.employee_id,
    employeeName: row.employee_name, jobId: null, earningSubmissionId: null, reimbursementRequestId: row.id,
    lineType: 'reimbursement', description: row.items.map(item => `${item.name}: $${Number(item.cost).toFixed(2)}`).join('; '),
    customerName: '', workDate: toReimbursement(row).expenseDate, amount: Number(row.amount),
  })) };
}

export function installReimbursementRoutes(app, { pool, requireDatabase, allowEmployeeOrOwner, requireOwner, employeeSubject, audit, sendPushToRole, sendPushToUsers }) {
  app.post('/api/employee/reimbursements', requireDatabase, allowEmployeeOrOwner, async (req,res,next) => {
    try {
      const subject = await employeeSubject(req);
      let validated;
      try { validated = validateReimbursementItems(req.body.items, { required: true }); } catch(error) { return res.status(400).json({ error: error.message }); }
      const { requestId, expenseDate, notes = '' } = req.body;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId ?? '') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate ?? '') || !Number.isFinite(Date.parse(expenseDate)) || new Date(expenseDate).toISOString().slice(0,10) !== expenseDate ||
        typeof notes !== 'string' || notes.length > 2000) return res.status(400).json({ error: 'Enter a valid expense date and request details.' });
      const inserted = await pool.query(`insert into reimbursement_requests(employee_id,request_id,expense_date,items,amount,notes)
        values($1,$2,$3,$4,$5,$6) on conflict(employee_id,request_id) do nothing returning *`,
        [subject.id, requestId, expenseDate, JSON.stringify(validated.items), validated.amount, notes.trim()]);
      const row = inserted.rows[0] ?? (await pool.query('select * from reimbursement_requests where employee_id=$1 and request_id=$2', [subject.id,requestId])).rows[0];
      if (inserted.rows[0]) {
        await audit(req.authUser.id,'submit_reimbursement','reimbursement',row.id,{ amount: validated.amount });
        void sendPushToRole('owner',{ title:'Reimbursement needs approval',body:`${subject.name} requested $${validated.amount.toFixed(2)}.`,tag:`reimbursement-${row.id}` }).catch(console.error);
      }
      res.status(inserted.rows[0] ? 201 : 200).json(toReimbursement({ ...row,employee_name:subject.name }));
    } catch(error) { next(error); }
  });
  app.post('/api/owner/reimbursements/:id/review', requireDatabase, requireOwner, async (req,res,next) => {
    const client = await pool.connect();
    try {
      const { decision, ownerNote = '' } = req.body;
      if (!['approved','rejected'].includes(decision) || typeof ownerNote !== 'string' || ownerNote.length > 2000) return res.status(400).json({ error:'Choose approve or reject.' });
      await client.query('begin');
      const found = await client.query('select * from reimbursement_requests where id=$1 for update',[req.params.id]);
      if (!found.rows[0]) return res.status(404).json({ error:'Reimbursement not found.' });
      if (found.rows[0].status !== 'pending') return res.status(409).json({ error:'This reimbursement has already been reviewed.' });
      const updated = await client.query(`update reimbursement_requests set status=$2,owner_note=$3,reviewed_by=$4,reviewed_at=now() where id=$1 returning *`,[req.params.id,decision,ownerNote.trim(),req.authUser.id]);
      await client.query('commit');
      await audit(req.authUser.id,`reimbursement_${decision}`,'reimbursement',req.params.id,{});
      void sendPushToUsers([updated.rows[0].employee_id],{ title:`Reimbursement ${decision}`,body:`$${Number(updated.rows[0].amount).toFixed(2)} ${decision}.`,tag:`reimbursement-review-${req.params.id}` }).catch(console.error);
      res.json(toReimbursement(updated.rows[0]));
    } catch(error) { next(error); } finally { await client.query('rollback').catch(()=>{}); client.release(); }
  });
}
