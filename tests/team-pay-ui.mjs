import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = await readFile('dist/index.html', 'utf8');
const css = (await readFile(resolve('dist', html.match(/href="([^"]+\.css)"/)[1].slice(1)), 'utf8')).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px');
const bundle = await build({ stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TeamPayWorkspace} from './src/components/TeamPayWorkspace';function Harness(){const [operations,setOperations]=useState(window.seed.operations),[section,setSection]=useState('people');return <main style={{padding:'max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom))',maxWidth:1200,margin:'auto'}}><TeamPayWorkspace operations={operations} jobs={window.seed.jobs} customerNames={new Map([['customer','Test Customer'],['future-customer','Future Customer']])} section={section} onSection={setSection} onRefresh={async()=>setOperations(await(await fetch('/api/owner/operations')).json())}/></main>;}createRoot(document.getElementById('root')).render(<Harness/>);`, resolveDir: process.cwd(), loader: 'tsx' }, jsx: 'automatic', bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' } });
const server = createServer((req,res) => {
  if(req.url==='/test.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
  else if(req.url==='/test.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const viewport of [{width:320,height:740},{width:390,height:844},{width:1440,height:1000}]) {
    const employee={id:'worker',name:'Test Employee',email:'worker@example.invalid',active:true,pictureUrl:'',baseCommissionPct:.22,upsellCommissionPct:.3,contractBonusPct:.1,tipSharePct:1};
    const jobs=[{id:'completed-job',customerId:'customer',date:'2026-10-04',time:'09:00',address:'123 Example Street',serviceType:'Windows',status:'completed',price:250},{id:'future-job',customerId:'future-customer',date:'2099-10-11',time:'10:00',address:'456 Example Street',serviceType:'Windows',status:'scheduled',price:450}];
    const operations={employees:[employee],assignments:[{jobId:'future-job',employeeId:employee.id,employeeName:employee.name,originalJobPrice:450,baseCommissionPct:.22}],contracts:[],payouts:[],earnings:[{id:'earning',jobId:'completed-job',employeeId:employee.id,employeeName:employee.name,customerName:'Test Customer',jobDate:'2026-10-04',status:'pending',baseEarnings:55,upsellEarnings:0,tipEarnings:0,contractEarnings:0,gasCost:19.85,reimbursementItems:[{name:'Gas',cost:12.75},{name:'Supplies',cost:7.10}],totalEarnings:74.85}],reimbursements:[{id:'request',employeeId:employee.id,employeeName:employee.name,expenseDate:'2026-10-04',items:[{name:'Insurance',cost:75}],amount:75,notes:'Monthly coverage',status:'pending'}]};
    const sales={salesmen:[{id:'sales',name:'Test Salesman',email:'sales@example.invalid',active:true,pictureUrl:''}],commissions:[{id:'credit',jobId:'completed-job',salesmanId:'sales',salesmanName:'Test Salesman',customerName:'Test Customer',jobDate:'2026-10-04',status:'pending',servicePrice:450,currentServicePrice:450,amount:90,workerPending:true}],notifications:[]};
    let run,profileSaved=false,assigned=false,commissionSaved=false,payments=0;
    const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(seed=>{window.seed=seed;document.addEventListener('DOMContentLoaded',()=>{document.documentElement.classList.add('dark');document.body.style.background='#020617';});},{operations,jobs});
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname,method=route.request().method(),body=method==='GET'?null:route.request().postDataJSON();let result={};
      if(path==='/api/owner/operations')result=operations;
      if(path==='/api/owner/sales')result=sales;
      if(path==='/api/owner/employees/worker'){assert.equal(body.baseCommissionPct,.25);Object.assign(employee,body);profileSaved=true;result=employee;}
      if(path==='/api/owner/salesmen/sales'){sales.salesmen[0].active=body.active;result=sales.salesmen[0];}
      if(path==='/api/owner/assignments'){assert.equal(body.jobId,'future-job');assert.equal(body.employeeId,'worker');assigned=true;result=operations.assignments[0];}
      if(path==='/api/owner/assignments/future-job/commission'){assert.equal(body.baseCommissionPct,.4);operations.assignments[0].baseCommissionPct=.4;commissionSaved=true;result=operations.assignments[0];}
      if(path==='/api/owner/earnings/earning/review'){assert.equal(body.decision,'approved');operations.earnings[0].status='approved';sales.commissions[0].workerPending=false;result=operations.earnings[0];}
      if(path==='/api/owner/reimbursements/request/review'){assert.equal(body.decision,'approved');operations.reimbursements[0].status='approved';result=operations.reimbursements[0];}
      if(path==='/api/owner/sales-commissions/credit/review'){assert.equal(body.decision,'approved');sales.commissions[0].status='approved';result=sales.commissions[0];}
      const eligibleLines=[];
      if(operations.earnings[0].status==='approved')eligibleLines.push({id:'base',employeeId:'worker',employeeName:employee.name,lineType:'commission',workDate:'2026-10-04',customerName:'Test Customer',amount:55},{id:'extras',employeeId:'worker',employeeName:employee.name,lineType:'gas_reimbursement',workDate:'2026-10-04',customerName:'Test Customer',amount:19.85,description:'Gas: $12.75; Supplies: $7.10'});
      if(operations.reimbursements[0].status==='approved')eligibleLines.push({id:'insurance',employeeId:'worker',employeeName:employee.name,lineType:'reimbursement',workDate:'2026-10-04',customerName:'',amount:75,description:'Insurance: $75.00'});
      if(sales.commissions[0].status==='approved')eligibleLines.push({id:'sale',employeeId:'sales',employeeName:'Test Salesman',lineType:'sales_commission',workDate:'2026-10-04',customerName:'Test Customer',amount:90});
      if(path==='/api/owner/payroll'){
        const preview={periodStart:'2026-09-28',periodEnd:'2026-10-04',payday:'2026-10-06',eligibleLines,missingApprovals:0};
        if(method==='POST'){run={id:'run',...preview,lines:eligibleLines,status:'draft',adjustments:[],payments:[],grossEarnings:239.85,netPay:239.85,totalAdditions:0,totalDeductions:0};result=run;}
        else result={preview,runs:run?[run]:[]};
      }
      if(path==='/api/owner/payroll/run/finalize'){run.status='finalized';result=run;}
      if(path==='/api/owner/payroll/run/payments'){payments++;run.payments.push({employeeId:body.employeeId});if(body.employeeId==='worker'){operations.earnings[0].status='paid';operations.reimbursements[0].status='paid';}else sales.commissions[0].status='paid';if(payments===2)run.status='paid';result=run;}
      assert.notEqual(path,'/api/owner/payouts');await route.fulfill({json:result});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByText('Test Salesman',{exact:true}).waitFor();
    const person=page.locator('article').filter({hasText:'worker@example.invalid'});await person.getByLabel('Base %',{exact:true}).fill('25');await person.getByRole('button',{name:'Save employee settings'}).click();
    await page.getByRole('button',{name:'Deactivate',exact:true}).click();await page.getByRole('button',{name:'Activate',exact:true}).waitFor();await page.getByRole('button',{name:'Activate',exact:true}).click();
    await page.screenshot({path:`artifacts/team-pay-people-${viewport.width}.png`,fullPage:true});
    await page.getByRole('tab',{name:'Assignments',exact:true}).click();await page.getByLabel('Assigned employee').selectOption('worker');
    await page.getByLabel('Search assigned jobs').fill('Future Customer');await page.getByLabel('Base %',{exact:true}).fill('40');await page.getByRole('button',{name:'Save rate'}).click();await page.getByText('40% base',{exact:true}).waitFor();
    await page.screenshot({path:`artifacts/team-pay-assignments-${viewport.width}.png`,fullPage:true});
    await page.getByRole('tab',{name:'Assignments',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.getByRole('heading',{name:'Pending earnings · 1',exact:true}).waitFor();
    const earning=page.locator('section').filter({has:page.getByRole('heading',{name:'Pending earnings · 1',exact:true})});
    await page.getByText('Supplies',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Mark payout paid'}).count(),0);
    await earning.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('heading',{name:'Pending earnings · 0',exact:true}).waitFor();
    await page.locator('article').filter({hasText:'Monthly coverage'}).getByRole('button',{name:'Approve',exact:true}).click();
    await page.locator('article').filter({hasText:'Test Salesman · Test Customer'}).getByRole('button',{name:'Approve',exact:true}).click();
    assert.equal(await page.getByRole('tab',{name:'Review',exact:true}).getAttribute('aria-selected'),'true');
    await page.screenshot({path:`artifacts/team-pay-review-${viewport.width}.png`,fullPage:true});
    await page.getByRole('tab',{name:'Payments',exact:true}).click();await page.getByRole('heading',{name:'Weekly contractor payments'}).waitFor();
    await page.getByText('View earnings included',{exact:true}).first().click();await page.getByText('Insurance: $75.00',{exact:true}).waitFor();await page.getByText('Gas: $12.75; Supplies: $7.10',{exact:true}).waitFor();
    assert.ok((await page.getByRole('tabpanel').innerText()).includes('$239.85'));
    await page.getByRole('button',{name:'Confirm weekly amounts'}).click();await page.getByRole('button',{name:'Mark paid',exact:true}).first().click();await page.getByRole('button',{name:'Mark paid',exact:true}).click();await page.getByRole('button',{name:'Mark paid',exact:true}).waitFor({state:'detached'});
    await page.locator('dl').getByText('$0.00',{exact:true}).waitFor();
    await page.screenshot({path:`artifacts/team-pay-payments-${viewport.width}.png`,fullPage:true});
    assert.ok(profileSaved&&assigned&&commissionSaved);assert.equal(payments,2);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const tabBounds=await page.getByRole('tablist').boundingBox();assert.ok(tabBounds.x>=0&&tabBounds.x+tabBounds.width<=viewport.width);
    const labelFits=await page.getByRole('tab').evaluateAll(nodes=>nodes.every(node=>[...node.querySelectorAll('span')].every(span=>span.getBoundingClientRect().right<=node.getBoundingClientRect().right+1)));assert.ok(labelFits);
    await page.getByRole('tab',{name:'Review',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
    await page.getByRole('tab',{name:'People',exact:true}).click();await page.getByRole('button',{name:'Refresh team and pay'}).click();
    await page.waitForFunction(()=>!document.querySelector('button[aria-label="Refresh team and pay"]').disabled);
    await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.body.style.background='#f1f5f9';});await page.screenshot({path:`artifacts/team-pay-people-light-${viewport.width}.png`,fullPage:true});assert.deepEqual(errors,[]);
    console.log(`Team & Pay ${viewport.width}: accounts, activation, assignments, per-job rates, keyboard tabs, three approvals, itemized reimbursements, two payouts, refreshed summaries, no overflow passed`);await context.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
