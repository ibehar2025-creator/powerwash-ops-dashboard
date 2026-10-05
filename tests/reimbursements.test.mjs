import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateReimbursementItems, reimbursementPayrollLines, installReimbursementRoutes, loadReimbursements } from '../server/reimbursements.mjs';

test('itemized reimbursements total integer cents and reject invalid items', () => {
  assert.deepEqual(validateReimbursementItems([{ name:' Gas ',cost:'12.75' },{ name:'Supplies',cost:7.10 }]),{ items:[{ name:'Gas',cost:12.75 },{ name:'Supplies',cost:7.10 }],amount:19.85 });
  assert.equal(validateReimbursementItems([{name:'A',cost:.1},{name:'B',cost:.2}]).amount,.3);
  for (const cost of ['',null,true,-1,0,Infinity,1.001,1000000]) assert.throws(() => validateReimbursementItems([{ name:'Test',cost }]));
  assert.throws(() => validateReimbursementItems([{ name:' ',cost:10 }]));
  assert.throws(() => validateReimbursementItems([],{ required:true }));
  assert.throws(() => validateReimbursementItems(Array.from({length:31},() => ({ name:'A',cost:1 }))));
});
test('standalone reimbursement payroll requires approval and excludes already linked sources', async () => {
  const db={query:async(sql,params)=>{
    assert.deepEqual(params,['2026-10-04']);
    if(sql.includes('count(*)'))return {rows:[{count:2}]};
    assert.match(sql,/rr.status='approved'/); assert.match(sql,/not exists/); assert.match(sql,/reimbursement_request_id=rr.id/);
    return {rows:[{id:'request',employee_id:'employee',employee_name:'Test',expense_date:'2026-10-04',items:[{name:'Insurance',cost:75}],amount:75}]};
  }};
  const result=await reimbursementPayrollLines(db,'2026-10-04');
  assert.equal(result.missingApprovals,2);assert.equal(result.lines[0].sourceKey,'reimbursement:request');
  assert.equal(result.lines[0].amount,75);assert.equal(result.lines[0].jobId,null);assert.equal(result.lines[0].lineType,'reimbursement');
});
test('employee request history is scoped to the authenticated employee', async () => {
  await loadReimbursements({query:async(sql,params)=>{assert.match(sql,/where rr.employee_id=\$1/);assert.deepEqual(params,['my-employee']);return {rows:[]};}},'my-employee');
});
function routes(db) {
  const registered=new Map(), middleware={database(){},employee(){},owner(){}};
  let notifications=0;
  installReimbursementRoutes({post:(url,...handlers)=>registered.set(url,handlers)}, {
    pool:{query:db.query,connect:async()=>({...db,release(){}})},requireDatabase:middleware.database,allowEmployeeOrOwner:middleware.employee,requireOwner:middleware.owner,
    employeeSubject:async req=>req.authUser,audit:async()=>{},sendPushToRole:async()=>{notifications++;},sendPushToUsers:async()=>{},
  });
  return {registered,middleware,notifications:()=>notifications};
}
function response(){return {code:200,status(code){this.code=code;return this;},json(value){this.value=value;return this;}};}
test('standalone retries create one request and cannot choose another employee', async () => {
  let record;
  const state=routes({query:async(sql,params)=>{
    if(sql.startsWith('insert into')){assert.equal(params[0],'my-employee');assert.match(sql,/on conflict\(employee_id,request_id\) do nothing/);if(record)return {rows:[]};record={id:'request',employee_id:params[0],expense_date:params[2],items:JSON.parse(params[3]),amount:params[4],notes:params[5],status:'pending'};return {rows:[record]};}
    return {rows:[record]};
  }});
  const handlers=state.registered.get('/api/employee/reimbursements');assert.equal(handlers[1],state.middleware.employee);
  const req={authUser:{id:'my-employee',name:'Test'},body:{employeeId:'other',requestId:'00000000-0000-4000-8000-000000000001',expenseDate:'2026-10-04',items:[{name:'Insurance',cost:75}]}};
  for(const code of [201,200]){const res=response();await handlers.at(-1)(req,res,error=>{throw error;});assert.equal(res.code,code);assert.equal(res.value.amount,75);}
  assert.equal(state.notifications(),1);
});
test('owner approval locks the request and rejects repeated review', async () => {
  const row={id:'request',employee_id:'employee',items:[{name:'Insurance',cost:75}],amount:75,status:'pending'};
  const state=routes({query:async(sql,params)=>{if(sql.startsWith('select')){assert.match(sql,/for update/);return {rows:[row]};}if(sql.startsWith('update')){row.status=params[1];return {rows:[row]};}return {rows:[]};}});
  const handlers=state.registered.get('/api/owner/reimbursements/:id/review');assert.equal(handlers[1],state.middleware.owner);
  for(const expected of [200,409]){const res=response();await handlers.at(-1)({params:{id:'request'},authUser:{id:'owner'},body:{decision:'approved'}},res,error=>{throw error;});assert.equal(res.code,expected);}
});
test('job reimbursement remains separate from commission and both payment paths mark standalone requests paid',()=>{
  const source=readFileSync(new URL('../server/index.mjs',import.meta.url),'utf8');
  assert.match(source,/reimbursement_items = excluded.reimbursement_items/);
  assert.match(source,/gas = req.body.reimbursementItems !== undefined \? reimbursement.amount/);
  assert.match(source,/sourceKey, line.lineType.*line.reimbursementRequestId/s);
  assert.match(source,/update reimbursement_requests set status='paid',paid_at=\$2 where employee_id=\$1/);
  assert.match(source,/reimbursement_request_id=any\(\$1::uuid\[\]\)/);
  const schema=readFileSync(new URL('../server/reimbursement-schema.sql',import.meta.url),'utf8');
  assert.match(schema,/enable row level security/);assert.match(schema,/revoke all.*from anon, authenticated/);assert.match(schema,/unique\(employee_id, request_id\)/);
});
