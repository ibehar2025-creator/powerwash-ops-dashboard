import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installSalesRoutes} from '../server/sales.mjs';

const source=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');
test('browser code contains no historical business snapshot or direct Sheets endpoint',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(app,/data\/(googleSheetData|reviews)/);
  assert.doesNotMatch(app,/VITE_SHEETS_SYNC_URL/);
});
function registeredHandler(route,nextRoute,context){
  let handler;
  vm.runInNewContext(source.slice(source.indexOf(route),source.indexOf(nextRoute)),{...context,app:{post:(_path,...handlers)=>{handler=handlers.at(-1);}}});
  return handler;
}
function response(){return {code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}

test('Google registration requires the separate salesman code and keeps inactive accounts blocked',async()=>{
  for(const scenario of [
    {code:'sales-code',role:'salesman',active:true,expected:201},
    {code:'employee-code',role:'salesman',active:true,expected:403},
    {code:'sales-code',role:'salesman',active:false,expected:403},
    {code:'sales-code',role:'admin',active:true,expected:400},
    {code:'sales-code',role:'salesman',active:true,configured:false,expected:503},
  ]){
    let sessions=0;let queries=0;
    const handler=registeredHandler('app.post("/api/auth/register"','app.post("/api/auth/logout"',{
      requireDatabase(){},validAuthState:()=>true,employeeAccessCode:'employee-code',ownerAccessCode:'owner-code',salesmanAccessCode:scenario.configured===false?'':'sales-code',
      verifyGoogleCredential:async()=>({googleSub:'google-test',email:'test@example.invalid',name:'Test',pictureUrl:''}),
      pool:{query:async(sql,params)=>{queries++;assert.equal(params[5],'salesman');assert.doesNotMatch(sql.slice(sql.indexOf('on conflict')),/role\s*=/);return {rows:[{id:'test',role:'salesman',active:scenario.active}]};}},
      createSession:async()=>{sessions++;},toAuthUser:user=>user,
    });
    const res=response();await handler({body:{role:scenario.role,age:18,accessCode:scenario.code}},res,error=>{throw error;});
    assert.equal(res.code,scenario.expected);assert.equal(sessions,scenario.expected===201?1:0);
    if(scenario.expected===400||scenario.configured===false||scenario.code==='employee-code')assert.equal(queries,0);
  }
});

test('personal statements filter every financial query and recompute only the recipient total',async()=>{
  const context=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('const isoDateValue ='),source.indexOf('async function eligiblePayrollLines(')),context);
  const db={query:async(sql,params)=>{
    assert.deepEqual([...params],['salesman']);assert.match(sql,/employee_id = \$1/);
    if(sql.includes('select * from payroll_runs'))return {rows:[{id:'run',period_start:'2026-10-01',period_end:'2026-10-07',payday:'2026-10-09',status:'paid',net_pay:99999}]};
    const shared={payroll_run_id:'run',employee_id:'salesman',employee_name:'Salesman',amount:90};
    if(sql.includes('from payroll_run_lines'))return {rows:[{...shared,id:'line',line_type:'sales_commission',work_date:'2026-10-01'}]};
    if(sql.includes('from payroll_adjustments'))return {rows:[{...shared,id:'adjustment',amount:10,adjustment_type:'addition',category:'correction'}]};
    return {rows:[{...shared,id:'payment',amount:100,payment_method:'bank'}]};
  }};
  const [run]=await context.loadPayrollRuns(db,'salesman');
  assert.equal(run.netPay,100);assert.equal(run.lines.length,1);assert.equal(run.payments[0].amount,100);
  assert.equal(JSON.stringify(run).includes('99999'),false);
});

test('worker approval uses the latest job price and rejects replay of an approved submission',async()=>{
  for(const status of ['pending','approved']){
    const queries=[];const sheet=[];let released=false;
    const row={id:'earning',job_id:'job',employee_id:'worker',status,job_status:'completed',original_job_price:300,upsell_amount:100,applied_upsell_amount:0,tip_amount:50};
    const client={query:async(sql)=>{queries.push(sql);return {rows:sql.includes('select job_id')?[{job_id:'job'}]:sql.includes('select price')?[{price:450}]:sql.includes('select earnings')?[row]:[]};},release(){released=true;}};
    const handler=registeredHandler('app.post("/api/owner/earnings/:id/review"','function servicePlanFromContractFrequency(',{
      requireDatabase(){},requireOwner(){},pool:{connect:async()=>client},earningSelect:'select earnings',priceAfterUpsell:(price,applied,upsell)=>Number(price)-Number(applied)+Number(upsell),
      runSheetAction:async(action,body)=>sheet.push({action,body}),audit:async()=>{},sendPushToUsers:async()=>{},toEarning:r=>r,console,
    });
    const res=response();await handler({body:{decision:'approved'},params:{id:'earning'},authUser:{id:'owner'}},res,error=>{throw error;});
    assert.equal(released,true);
    if(status==='approved'){assert.equal(res.code,409);assert.equal(sheet.length,0);}
    else {assert.equal(sheet[0].body.price,550);assert.ok(queries.indexOf('select id from jobs where id=$1 for update')<queries.findIndex(sql=>sql.includes('for update of es')));}
  }
});

test('sales approval is idempotent, rejects unfinished worker review, and locks payroll-linked amounts',async()=>{
  for(const state of [
    {status:'pending',worker_pending:false,expected:200,mutations:1},
    {status:'approved',worker_pending:false,expected:200,mutations:0},
    {status:'pending',worker_pending:true,expected:409,mutations:0},
    {status:'approved',payroll_linked:true,expected:409,mutations:0},
    {status:'paid',expected:409,mutations:0},
  ]){
    const routes=new Map();const queries=[];
    const credit={id:'credit',job_id:'job',salesman_id:'salesman',job_status:'completed',service_price:450,current_service_price:450,amount:90,date:'2026-10-01',...state};
    const query=async(sql)=>{queries.push(sql);return {rows:sql==='select job_id from sales_credits where id=$1'?[{job_id:'job'}]:sql.includes('select sc.*')?[credit]:[]};};
    const app=Object.fromEntries(['get','post','patch'].map(method=>[method,(path,...handlers)=>routes.set(path,handlers.at(-1))]));
    installSalesRoutes(app,{pool:{connect:async()=>({query,release(){}}),query},audit:async()=>{},sendPushToUsers:async()=>{}});
    const res=response();await routes.get('/api/owner/sales-commissions/:id/review')({body:{decision:'approved'},params:{id:'credit'},authUser:{id:'owner'}},res,error=>{throw error;});
    assert.equal(res.code,state.expected);assert.equal(queries.filter(sql=>sql.startsWith('update sales_credits')).length,state.mutations);
    assert.ok(queries.indexOf('select id from jobs where id=$1 for update')<queries.findIndex(sql=>sql.includes('for update of j,sc')));
  }
});

test('payroll adjustments cannot race past the finalization lock',async()=>{
  const queries=[];let released=false;
  const client={query:async(sql)=>{queries.push(sql);return {rows:sql.includes('select status')?[{status:'finalized'}]:[]};},release(){released=true;}};
  const handler=registeredHandler('app.post("/api/owner/payroll/:id/adjustments"','app.delete("/api/owner/payroll/:runId/adjustments/',{
    requireDatabase(){},requireOwner(){},pool:{connect:async()=>client},audit:async()=>{},loadPayrollRuns:async()=>[],
  });
  const res=response();await handler({body:{employeeId:'salesman',adjustmentType:'addition',category:'correction',description:'Corrected job price',amount:10},params:{id:'run'},authUser:{id:'owner'}},res,error=>{throw error;});
  assert.equal(res.code,409);assert.equal(released,true);assert.match(queries[1],/for update/);assert.equal(queries.some(sql=>sql.startsWith('insert')),false);assert.equal(queries.at(-1),'rollback');
});

test('a spreadsheet snapshot cannot overwrite a job edited while it was being fetched',async()=>{
  const context=vm.createContext({Date});
  vm.runInContext(source.slice(source.indexOf('async function upsertJobs('),source.indexOf('async function upsertInvoices(')),context);
  const stamp=new Date('2026-10-03T12:00:00Z');let called=false;
  await context.upsertJobs({query:async(sql,params)=>{called=true;assert.match(sql,/where jobs.updated_at <= \$2::timestamptz/);assert.match(sql,/clock_timestamp\(\)/);assert.equal(params[1],stamp);return {rows:[]};}},[{id:'job',customerId:'customer',date:'2026-10-04',status:'scheduled',price:450}],stamp);
  assert.equal(called,true);
});
