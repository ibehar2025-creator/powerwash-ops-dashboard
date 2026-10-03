import test from 'node:test';
import assert from 'node:assert/strict';
import {commissionAmount,priceAfterUpsell,mapProjection,salesmanOnly,ownerOrSalesman,salesPayrollLines,installSalesRoutes} from './sales.mjs';

test('20% uses corrected service price, not upsells, tips or gas',()=>{
  assert.equal(commissionAmount(450),90);
  assert.equal(commissionAmount(550,100),90);
  assert.equal(commissionAmount(500),100);
  assert.equal(commissionAmount(450,0,true),0);
  assert.equal(commissionAmount(0),0);
});
test('worker approval preserves latest price and applies upsell only once',()=>{
  assert.equal(priceAfterUpsell(450,0,100),550);
  assert.equal(priceAfterUpsell(550,100,100),550);
  assert.equal(priceAfterUpsell(500,100,100),500);
  assert.equal(priceAfterUpsell(450,0,0),450);
});
test('other customers map history excludes all financial/contact/private fields',()=>{
  const row={id:'job',customer_id:'customer',date:'2026-10-10',time:'09:00',address:'123 Example',service_type:'Windows',status:'completed',price:450,notes:'private',phone:'private',tip_amount:50};
  assert.deepEqual(Object.keys(mapProjection(row,false)).sort(),['id','customerId','date','time','address','serviceType','status','latitude','longitude'].sort());
  assert.equal(mapProjection(row,true).price,450);
  assert.equal(mapProjection(row,true).notes,undefined);
});
test('server guards reject direct wrong-role API attempts',()=>{
  for(const role of ['employee','owner',undefined]){let next=false;let status; salesmen({authUser:{role}},{status:n=>{status=n;return {json:()=>{}};}},()=>{next=true;});assert.equal(next,false);assert.equal(status,403);}
  function salesmen(...args){salesmanOnly(...args);}
  for(const role of ['owner','salesman']){let next=false;ownerOrSalesman({authUser:{role}},{},()=>{next=true;});assert.equal(next,true);}
});
test('all salesman APIs are role guarded and never expose owner routing',()=>{
  const routes=[];const app=Object.fromEntries(['get','post','patch'].map(method=>[method,(path,...handlers)=>routes.push({path,handlers})]));
  installSalesRoutes(app,{});
  for(const route of routes.filter(r=>r.path.startsWith('/api/salesman/')))assert.equal(route.handlers[1],salesmanOnly);
  assert.ok(routes.some(r=>r.path==='/api/owner/sales-commissions/:id/review'));
});
test('sales payroll uses its own source key and salesman recipient',async()=>{
  const db={query:async(sql)=>sql.includes('count(*)')?{rows:[{count:1}]}:{rows:[{id:'credit',job_id:'same-job',salesman_id:'salesman',salesman_name:'Sales Rep',customer_name:'Customer',date:'2026-10-01',amount:'90'}]}};
  const result=await salesPayrollLines(db,'2026-10-04');assert.equal(result.missingApprovals,1);
  assert.equal(result.lines[0].sourceKey,'same-job:sales_commission');assert.notEqual(result.lines[0].sourceKey,'same-job:commission');
  assert.equal(result.lines[0].employeeId,'salesman');assert.equal(result.lines[0].amount,90);assert.equal(result.lines[0].earningSubmissionId,null);
});

function bookingHarness(failure){
  const routes=new Map();let reservation;let fail=failure;let released=false;
  const snapshot={jobs:[],customers:[]};const writes=[];let dbJob;
  const query=async(sql,p=[])=>{
    if(sql.startsWith('select request_id'))return {rows:reservation?[reservation]:[]};
    if(sql.includes('as valid'))return {rows:[{valid:true}]};
    if(sql.startsWith('insert into sales_bookings')){reservation??={request_id:p[0],salesman_id:p[1],job_id:p[2],customer_id:p[3],payload:JSON.parse(p[4]),saved:false};return {rows:[]};}
    if(sql.startsWith('select * from sales_bookings'))return {rows:[reservation]};
    if(sql.startsWith('insert into customers')&&fail==='database'){fail=null;throw new Error('Temporary database failure');}
    if(sql.startsWith('insert into jobs'))dbJob={id:p[0],price:p[6]};
    if(sql.startsWith('update sales_bookings'))reservation.saved=true;
    if(sql.startsWith('select * from jobs'))return {rows:[dbJob]};
    return {rows:[]};
  };
  const pool={query,connect:async()=>({query,release:()=>{released=true;}})};
  const app=Object.fromEntries(['get','post','patch'].map(method=>[method,(path,...handlers)=>routes.set(`${method} ${path}`,handlers.at(-1))]));
  const runSheetAction=async(action,row)=>{writes.push(action);if(action==='addCustomer')snapshot.customers.push({id:row.customerId});if(action==='addUpcomingJob'){snapshot.jobs.push({id:row.jobId});if(fail==='timeout'){fail=null;throw new Error('Response timeout after successful write');}}};
  installSalesRoutes(app,{pool,syncUrl:'https://example.invalid/sheets',runSheetAction,toJob:r=>r,audit:async()=>{},sendPushToRole:async()=>{}});
  return {handler:routes.get('post /api/salesman/jobs'),snapshot,writes,reservation:()=>reservation,released:()=>released};
}
async function invoke(handler,body,user='salesman'){
  const result={status:200,body:null,error:null};
  const response={status(n){result.status=n;return this;},json(data){result.body=data;return this;}};
  await handler({body,authUser:{id:user,role:'salesman',name:'Sales Rep'},params:{}},response,error=>{result.error=error;});return result;
}
const booking={requestId:'a4c55283-6d75-4e34-9caa-4135a0920724',name:'Customer',phone:'',email:'',date:'2099-10-10',time:'09:00',address:'123 Example',serviceType:'Windows',price:450,employeeInstructions:'Gate on left'};
for(const failure of ['database','timeout'])test(`booking retry recovers ${failure} without duplicating spreadsheet rows`,async()=>{
  const h=bookingHarness(failure);const original=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,json:async()=>h.snapshot});
  try{
    assert.ok((await invoke(h.handler,booking)).error);
    const success=await invoke(h.handler,booking);assert.equal(success.error,null);assert.equal(success.status,201);
    assert.equal(h.snapshot.jobs.length,1);assert.equal(h.snapshot.customers.length,1);
    const replay=await invoke(h.handler,booking);assert.equal(replay.status,200);assert.equal(replay.body.id,success.body.id);
    assert.equal(h.writes.filter(a=>a==='addUpcomingJob').length,1);assert.equal(h.released(),true);
    const stolen=await invoke(h.handler,booking,'another-salesman');assert.equal(stolen.status,404);
    const changed=await invoke(h.handler,{...booking,price:500});assert.equal(changed.status,409);
  }finally{globalThis.fetch=original;}
});
test('unsafe fields, foreign jobs and foreign leads are rejected',async()=>{
  const routes=new Map();let mutations=0;
  const query=async(sql)=>{if(sql.startsWith('update'))mutations++;return {rows:[]};};
  const app=Object.fromEntries(['get','post','patch'].map(method=>[method,(path,...handlers)=>routes.set(path,handlers.at(-1))]));
  installSalesRoutes(app,{pool:{query,connect:async()=>({query,release(){}})}});
  const res={code:200,status(n){this.code=n;return this;},json(){}};
  await routes.get('/api/salesman/jobs/:id')({params:{id:'foreign'},body:{status:'completed'},authUser:{id:'salesman'}},res,error=>{throw error;});
  assert.equal(res.code,404);assert.equal(mutations,0);
  await routes.get('/api/salesman/leads/:id')({params:{id:'foreign'},body:{status:'won'},authUser:{id:'salesman'}},res,error=>{throw error;});
  assert.equal(res.code,400);assert.equal(mutations,0);
});
