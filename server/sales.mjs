import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function ensureSalesSchema(pool) {
  if (pool) await pool.query(await readFile(new URL('./sales-schema.sql', import.meta.url), 'utf8'));
}
export const commissionAmount = (price, appliedUpsell = 0, canceled = false) => canceled ? 0 : Math.round(Math.max(0, Number(price) - Number(appliedUpsell)) * 20) / 100;
export const priceAfterUpsell = (currentPrice, applied, upsell) => Math.round((Number(currentPrice) - Number(applied) + Number(upsell)) * 100) / 100;
export function salesmanOnly(req, res, next) {
  if (req.authUser?.role !== 'salesman') return res.status(403).json({ error: 'Salesman access required.' });
  next();
}
export function ownerOrSalesman(req, res, next) {
  if (!['owner','salesman'].includes(req.authUser?.role)) return res.status(403).json({ error: 'Not permitted.' });
  next();
}
export function mapProjection(row, own) {
  const job = { id: row.id, customerId: row.customer_id, date: String(row.date?.toISOString?.().slice(0,10) ?? row.date), time: row.time,
    address: row.address, serviceType: row.service_type, status: row.status, latitude: row.latitude ?? undefined, longitude: row.longitude ?? undefined };
  if (own) job.price = Number(row.price);
  return job;
}
const creditQuery = `select sc.*,j.date,j.time,j.status as job_status,j.price as job_price,c.name as customer_name,ua.name as salesman_name,
  exists(select 1 from payroll_run_lines where sales_credit_id=sc.id) as payroll_linked,
  exists(select 1 from earning_submissions where job_id=j.id and status in ('pending','draft')) as worker_pending,
  greatest(0,j.price-coalesce((select sum(applied_upsell_amount) from earning_submissions where job_id=j.id),0)) as current_service_price
  from sales_credits sc join jobs j on j.id=sc.job_id join customers c on c.id=j.customer_id join user_accounts ua on ua.id=sc.salesman_id`;
const toCredit = row => ({ id:row.id,jobId:row.job_id,salesmanId:row.salesman_id,salesmanName:row.salesman_name,customerName:row.customer_name,
  jobDate:row.date?.toISOString?.().slice(0,10) ?? row.date, servicePrice:Number(row.service_price),currentServicePrice:Number(row.current_service_price),
  rate:Number(row.rate),amount:row.job_status==='canceled'&&row.status!=='paid'?0:Number(row.amount),status:row.job_status==='canceled'&&row.status!=='paid'?'canceled':row.status,ownerNote:row.owner_note,workerPending:row.worker_pending,
  payrollLinked:row.payroll_linked,reviewedAt:row.reviewed_at,paidAt:row.paid_at });
export async function salesPayrollLines(db, periodEnd) {
  const rows = await db.query(`${creditQuery} where sc.status='approved' and j.status='completed' and j.date <= $1 and not exists(select 1 from payroll_run_lines where sales_credit_id=sc.id)`, [periodEnd]);
  const missing = await db.query(`select count(*)::int as count from sales_credits sc join jobs j on j.id=sc.job_id where j.status='completed' and j.date <= $1 and sc.status='pending'`, [periodEnd]);
  return { missingApprovals:missing.rows[0].count, lines:rows.rows.filter(row=>Number(row.amount)>0).map(row=>({
    id:`${row.job_id}:sales_commission`,sourceKey:`${row.job_id}:sales_commission`,salesCreditId:row.id,employeeId:row.salesman_id,employeeName:row.salesman_name,
    jobId:row.job_id,earningSubmissionId:null,lineType:'sales_commission',description:'Sales commission (20%)',customerName:row.customer_name,
    workDate:row.date?.toISOString?.().slice(0,10) ?? row.date,amount:Number(row.amount) })) };
}
function bookingInput(body) {
  const fields=['name','phone','email','address','serviceType','date','time','employeeInstructions','leadId'];
  const data=Object.fromEntries(fields.map(key=>[key,String(body[key] ?? '').trim()]));
  data.price=Number(body.price); data.latitude=body.latitude ?? null; data.longitude=body.longitude ?? null;
  if (!data.name || !data.address || !data.serviceType || fields.some(key=>data[key].length>4000) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(`${data.date}T12:00:00Z`)) || new Date(`${data.date}T12:00:00Z`).toISOString().slice(0,10)!==data.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time) ||
    body.price === '' || body.price == null || !Number.isFinite(data.price) || data.price<0 || data.price>100000 ||
    (data.latitude === null)!==(data.longitude === null) ||
    (data.latitude !== null && (!Number.isFinite(data.latitude)||Math.abs(data.latitude)>90)) ||
    (data.longitude !== null && (!Number.isFinite(data.longitude)||Math.abs(data.longitude)>180))) throw Object.assign(new Error('Enter a valid name, address, service, date, time, and price.'),{status:400});
  return data;
}
export function installSalesRoutes(app, {pool,requireDatabase,requireOwner,runSheetAction,syncUrl,toJob,toCustomer,toLead,toSolicitation,audit,sendPushToRole,sendPushToUsers,refreshSheetsIfStale,loadPayrollRuns}) {
  const route = fn => async(req,res,next)=>{try{await fn(req,res);}catch(error){if(error.status)res.status(error.status).json({error:error.message});else next(error);}};
  const notify = async(db,userId,jobId,title,detail)=>db.query('insert into sales_notifications(user_id,job_id,title,detail) values($1,$2,$3,$4)',[userId,jobId,title,detail]);
  app.get('/api/salesman/bootstrap',requireDatabase,salesmanOnly,route(async(req,res)=>{
    let syncError='';
    try { await refreshSheetsIfStale(); } catch(error) { syncError=error.message; console.error('Salesman sheet refresh failed',error); }
    const id=req.authUser.id;
    const jobs=await pool.query(`select j.*,sc.salesman_id from jobs j left join sales_credits sc on sc.job_id=j.id order by j.date desc,j.time`,[]);
    const owned=jobs.rows.filter(row=>row.salesman_id===id);
    const ownCustomers=new Set(owned.map(row=>row.customer_id));
    const customers=await pool.query('select * from customers where id=any($1::text[])',[ [...new Set(jobs.rows.map(row=>row.customer_id))] ]);
    const [credits,leads,solicitations,events,statements]=await Promise.all([
      pool.query(`${creditQuery} where sc.salesman_id=$1 order by j.date desc`,[id]),pool.query('select * from leads where created_by=$1 order by follow_up_date nulls last',[id]),
      pool.query('select * from solicitations where created_by=$1',[id]),pool.query('select * from sales_notifications where user_id=$1 order by created_at desc limit 100',[id]),loadPayrollRuns(pool,id)]);
    res.json({jobs:owned.map(toJob),mapJobs:jobs.rows.map(row=>mapProjection(row,row.salesman_id===id)),
      customers:customers.rows.filter(row=>ownCustomers.has(row.id)).map(toCustomer),
      mapCustomers:customers.rows.map(row=>({id:row.id,name:row.name,address:row.address})),leads:leads.rows.map(toLead),
      commissions:credits.rows.map(toCredit),solicitations:solicitations.rows.map(toSolicitation),notifications:events.rows,statements,syncError});
  }));
  // Reserve IDs before any external write. The reservation survives timeouts and process restarts.
  app.post('/api/salesman/jobs',requireDatabase,salesmanOnly,route(async(req,res)=>{
    const requestId=req.body.requestId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId ?? '')) return res.status(400).json({error:'A stable booking request ID is required.'});
    const data=bookingInput(req.body); const id=req.authUser.id;
    const prior=await pool.query('select request_id from sales_bookings where request_id=$1',[requestId]);
    if(!prior.rows[0]){
      const future=(await pool.query(`select ($1::date+$2::time) > (now() at time zone 'America/Chicago') as valid`,[data.date,data.time])).rows[0].valid;
      if(!future) return res.status(400).json({error:'Choose a future job date and time.'});
    }
    await pool.query(`insert into sales_bookings(request_id,salesman_id,job_id,customer_id,payload) values($1,$2,$3,$4,$5) on conflict(request_id) do nothing`,
      [requestId,id,`manual-job-${randomUUID()}`,`manual-customer-${randomUUID()}`,JSON.stringify(data)]);
    const client=await pool.connect();
    try{
      await client.query('begin');
      const reservation=(await client.query('select * from sales_bookings where request_id=$1 for update',[requestId])).rows[0];
      if(reservation.salesman_id!==id) throw Object.assign(new Error('Booking not found.'),{status:404});
      if(JSON.stringify(reservation.payload)!==JSON.stringify(data) && JSON.stringify(Object.fromEntries(Object.keys(data).sort().map(k=>[k,data[k]])))!==JSON.stringify(Object.fromEntries(Object.keys(reservation.payload).sort().map(k=>[k,reservation.payload[k]])))) throw Object.assign(new Error('This request belongs to another booking. Restore its original details or start a new booking.'),{status:409});
      if(reservation.saved){await client.query('commit');const saved=(await pool.query('select * from jobs where id=$1',[reservation.job_id])).rows[0];return saved?res.json(toJob(saved)):res.status(410).json({error:'The owner removed this booking. It cannot be recreated by retrying.'});}
      if(data.leadId){const lead=await client.query('select * from leads where id=$1 and created_by=$2 and converted_job_id is null for update',[data.leadId,id]);if(!lead.rows[0])throw Object.assign(new Error('Lead not found or already converted.'),{status:409});}
      // Read back stable IDs before retrying an uncertain Sheets response. Never blindly append twice.
      if(!syncUrl)throw new Error('SHEETS_SYNC_URL is not configured.');
      const response=await fetch(syncUrl,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error('Unable to verify spreadsheet bookings. Retry this booking shortly.');
      const snapshot=await response.json();
      if(!Array.isArray(snapshot.jobs)||!Array.isArray(snapshot.customers))throw new Error('Spreadsheet did not return a verifiable job/customer list.');
      const jobId=reservation.job_id,customerId=reservation.customer_id;
      if(!snapshot.customers.some(row=>row.id===customerId)) await runSheetAction('addCustomer',{customerId,name:data.name,phone:data.phone,email:data.email,address:data.address,notes:''});
      if(!snapshot.jobs.some(row=>row.id===jobId)) await runSheetAction('addUpcomingJob',{...data,jobId,customerId,status:'scheduled',notes:'',amountPaid:0,paymentStatus:'unpaid'});
      await client.query(`insert into customers(id,name,phone,email,address) values($1,$2,$3,$4,$5) on conflict(id) do nothing`,[customerId,data.name,data.phone,data.email,data.address]);
      await client.query(`insert into jobs(id,customer_id,date,time,address,service_type,status,price,payment_status,notes,employee_instructions,source,latitude,longitude,geocoded_address)
        values($1,$2,$3,$4,$5,$6,'scheduled',$7,'unpaid','',$8,'manual',$9,$10,
        case when $9::double precision is not null and $10::double precision is not null then $5 else null end) on conflict(id) do nothing`,[jobId,customerId,data.date,data.time,data.address,data.serviceType,data.price,data.employeeInstructions,data.latitude,data.longitude]);
      await client.query('insert into sales_credits(job_id,salesman_id) values($1,$2) on conflict(job_id) do nothing',[jobId,id]);
      await client.query('select refresh_sales_credit($1)',[jobId]);
      if(data.leadId)await client.query("update leads set status='won',converted_job_id=$3,updated_at=now() where id=$1 and created_by=$2",[data.leadId,id,jobId]);
      await client.query('update sales_bookings set saved=true,customer_synced=true,job_synced=true where request_id=$1',[requestId]);
      await notify(client,null,jobId,'New salesman booking',`${req.authUser.name}: ${data.name} - ${data.date} ${data.time} - ${data.address}`);
      await notify(client,id,jobId,'Job booked',`${data.name} - ${data.date} ${data.time} - ${data.address}`);
      await client.query('commit');
      await audit(id,'salesman_booking','job',jobId,{requestId});
      void sendPushToRole('owner',{title:'New salesman booking',body:`${req.authUser.name} booked ${data.name}.`,tag:`sales-booking-${jobId}`}).catch(console.error);
      res.status(201).json(toJob((await pool.query('select * from jobs where id=$1',[jobId])).rows[0]));
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }));
  app.patch('/api/salesman/jobs/:id',requireDatabase,salesmanOnly,route(async(req,res)=>{
    const client=await pool.connect();
    try{
      await client.query('begin');
      const row=(await client.query(`select j.*,c.name,c.phone,c.email from jobs j join customers c on c.id=j.customer_id
        join sales_credits sc on sc.job_id=j.id where j.id=$1 and sc.salesman_id=$2 for update of j,sc`,[req.params.id,req.authUser.id])).rows[0];
      if(!row)throw Object.assign(new Error('Job not found.'),{status:404});
      const future=(await client.query(`select ($1::date+$2::time) > (now() at time zone 'America/Chicago') as valid`,[row.date,row.time])).rows[0].valid;
      if(row.status!=='scheduled'||!future)throw Object.assign(new Error('Only your future scheduled jobs can be edited. Contact the owner.'),{status:409});
      const allowed=['name','phone','email','date','time','address','serviceType','price','employeeInstructions','latitude','longitude'];
      if(Object.keys(req.body).some(key=>!allowed.includes(key)))throw Object.assign(new Error('This field can only be changed by the owner.'),{status:403});
      const data=bookingInput({name:row.name,phone:row.phone,email:row.email,date:row.date?.toISOString?.().slice(0,10)??row.date,time:row.time,address:row.address,serviceType:row.service_type,price:Number(row.price),employeeInstructions:row.employee_instructions,latitude:row.latitude,longitude:row.longitude,...req.body});
      if(data.address!==row.address&&!Object.hasOwn(req.body,'latitude')){data.latitude=null;data.longitude=null;}
      const valid=(await client.query(`select ($1::date+$2::time) > (now() at time zone 'America/Chicago') as valid`,[data.date,data.time])).rows[0].valid;
      if(!valid)throw Object.assign(new Error('Choose a future job date and time.'),{status:400});
      await runSheetAction('updateJob',{...data,jobId:row.id,customerId:row.customer_id,status:'scheduled'});
      await client.query(`update jobs set date=$2,time=$3,address=$4,service_type=$5,price=$6,employee_instructions=$7,latitude=$8,longitude=$9,
        geocoded_address=case when $8::double precision is not null and $9::double precision is not null then $4 else null end,updated_at=clock_timestamp() where id=$1`,[row.id,data.date,data.time,data.address,data.serviceType,data.price,data.employeeInstructions,data.latitude,data.longitude]);
      await client.query(`update customers set name=$2,phone=$3,email=$4,address=$5,
        website_overrides=website_overrides||'{"name":true,"phone":true,"email":true,"address":true}'::jsonb,updated_at=now() where id=$1`,[row.customer_id,data.name,data.phone,data.email,data.address]);
      await notify(client,null,row.id,'Salesman updated a booking',`${req.authUser.name}: ${data.name} - ${data.date} ${data.time} - ${data.address}`);
      await client.query('commit');
      await audit(req.authUser.id,'salesman_edit','job',row.id,req.body);
      void sendPushToRole('owner',{title:'Salesman updated a booking',body:`${req.authUser.name} edited ${data.name}.`,tag:`sales-edit-${row.id}`}).catch(console.error);
      res.json(toJob((await pool.query('select * from jobs where id=$1',[row.id])).rows[0]));
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }));
  app.patch('/api/salesman/leads/:id',requireDatabase,salesmanOnly,route(async(req,res)=>{
    const {name,contact,notes,followUpDate,status}=req.body;
    if(status && !['new','contacted','quoted','lost'].includes(status))return res.status(400).json({error:'Convert a lead by booking its job.'});
    const result=await pool.query(`update leads set name=coalesce($3,name),contact=coalesce($4,contact),notes=coalesce($5,notes),
      follow_up_date=case when $6::boolean then nullif($7,'')::date else follow_up_date end,status=coalesce($8,status),
      website_overrides=website_overrides||'{"name":true,"contact":true,"notes":true,"followUpDate":true}'::jsonb,updated_at=now()
      where id=$1 and created_by=$2 and converted_job_id is null returning *`,[req.params.id,req.authUser.id,name,contact,notes,Object.hasOwn(req.body,'followUpDate'),followUpDate,status]);
    if(!result.rows[0])return res.status(404).json({error:'Lead not found or already converted.'});
    res.json(toLead(result.rows[0]));
  }));
  app.get('/api/owner/sales',requireDatabase,requireOwner,route(async(_req,res)=>{
    const [people,credits,events]=await Promise.all([pool.query("select id,name,email,picture_url,active from user_accounts where role='salesman' and google_sub not like 'deleted:%' order by name"),pool.query(`${creditQuery} order by j.date desc`),pool.query('select * from sales_notifications where user_id is null order by created_at desc limit 100')]);
    res.json({salesmen:people.rows.map(row=>({...row,pictureUrl:row.picture_url})),commissions:credits.rows.map(toCredit),notifications:events.rows});
  }));
  app.patch('/api/owner/salesmen/:id',requireDatabase,requireOwner,route(async(req,res)=>{
    if(typeof req.body.active!=='boolean')return res.status(400).json({error:'Choose an active status.'});
    const result=await pool.query("update user_accounts set active=$2,updated_at=now() where id=$1 and role='salesman' returning id",[req.params.id,req.body.active]);
    if(!result.rows[0])return res.status(404).json({error:'Salesman not found.'});
    if(!req.body.active)await pool.query('delete from auth_sessions where user_id=$1',[req.params.id]);
    await audit(req.authUser.id,'salesman_activation','account',req.params.id,{active:req.body.active});res.json({saved:true});
  }));
  app.post('/api/owner/sales-commissions/:id/review',requireDatabase,requireOwner,route(async(req,res)=>{
    const client=await pool.connect();
    try{
      await client.query('begin');
      const source=await client.query('select job_id from sales_credits where id=$1',[req.params.id]);
      if(!source.rows[0])throw Object.assign(new Error('Commission not found.'),{status:404});
      await client.query('select id from jobs where id=$1 for update',[source.rows[0].job_id]);
      const credit=(await client.query(`${creditQuery} where sc.id=$1 for update of j,sc`,[req.params.id])).rows[0];
      if(!credit)throw Object.assign(new Error('Commission not found.'),{status:404});
      const decision=req.body.decision;
      if(!['approved','rejected','correct'].includes(decision))throw Object.assign(new Error('Choose approve, reject, or correct.'),{status:400});
      if(credit.status==='paid'||credit.payroll_linked)throw Object.assign(new Error('This commission is in payroll. Use a payroll correction adjustment.'),{status:409});
      if(decision==='correct'){
        if(!req.body.ownerNote?.trim())throw Object.assign(new Error('A correction reason is required.'),{status:400});
        await client.query("update sales_credits set status='estimated',owner_note=$2,reviewed_by=null,reviewed_at=null where id=$1",[credit.id,req.body.ownerNote]);
        await client.query('select refresh_sales_credit($1)',[credit.job_id]);
      }else{
        if(credit.status==='approved'&&decision==='approved'){await client.query('commit');return res.json(toCredit(credit));}
        if(credit.status!=='pending'||credit.job_status!=='completed'||credit.worker_pending)throw Object.assign(new Error('Complete the job and review worker earnings first. Corrections must return to review before approval.'),{status:409});
        await client.query('select refresh_sales_credit($1)',[credit.job_id]);
        await client.query('update sales_credits set status=$2,owner_note=$3,reviewed_by=$4,reviewed_at=now(),updated_at=now() where id=$1',[credit.id,decision,String(req.body.ownerNote??''),req.authUser.id]);
      }
      await notify(client,credit.salesman_id,credit.job_id,decision==='correct'?'Commission returned to review':`Sales commission ${decision}`,`${credit.customer_name} - ${String(req.body.ownerNote??'')}`);
      await client.query('commit');await audit(req.authUser.id,`sales_commission_${decision}`,'sales_credit',credit.id,{ownerNote:req.body.ownerNote??''});
      void sendPushToUsers([credit.salesman_id],{title:'Sales commission updated',body:`${credit.customer_name}: ${decision}.`,tag:`sales-review-${credit.id}`}).catch(console.error);
      res.json(toCredit((await pool.query(`${creditQuery} where sc.id=$1`,[credit.id])).rows[0]));
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }));
}
