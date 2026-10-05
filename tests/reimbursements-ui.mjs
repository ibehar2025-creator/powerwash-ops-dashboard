import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve,relative,extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{const file=resolve(root,req.url.split('?')[0].slice(1)||'index.html');if(relative(root,file).startsWith('..'))throw Error('Invalid path');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const viewport of [{width:390,height:844},{width:360,height:800},{width:1440,height:1000}]) {
    const context=await browser.newContext({viewport,timezoneId:'America/Chicago'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/\.css$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top)','59px').replaceAll('env(safe-area-inset-bottom)','34px')});});
    const today=await page.evaluate(()=>new Date().toLocaleDateString('en-CA'));
    const user={id:'00000000-0000-4000-8000-000000000001',name:'Test Employee',role:'employee',age:18,phone:'',email:'employee@example.invalid',pictureUrl:''};
    const job={id:'test-job',customerId:'customer',date:today,time:'09:00',address:'123 Test Street',serviceType:'Windows',status:'scheduled',price:250,amountPaid:0,tipAmount:0,paymentStatus:'unpaid',notes:'',employeeInstructions:'',source:'manual',crewIds:[]};
    const data={employee:{...user,active:true,baseCommissionPct:.22,upsellCommissionPct:.3,contractBonusPct:.1,tipSharePct:1},preview:false,jobs:[job],customers:[{id:'customer',name:'Test Customer',phone:'',email:'',address:job.address,notes:'',insights:[]}],assignments:[{jobId:job.id,employeeId:user.id,employeeName:user.name,originalJobPrice:250,baseCommissionPct:.22,upsellCommissionPct:.3,contractBonusPct:.1,tipSharePct:1}],earnings:[],contracts:[],solicitations:[],payouts:[],reimbursements:[]};
    let role='employee',requestAttempts=0,firstAttempt;
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname,method=route.request().method();let result={};
      if(path==='/api/auth/config')result={enabled:true,clientId:'test',state:'test',signupCodeRequired:true};
      if(path==='/api/auth/session')result={user:{...user,role,id:role==='owner'?'owner':user.id}};
      if(path==='/api/employee/bootstrap')result=data;
      if(path==='/api/employee/payroll')result={statements:[]};
      if(path==='/api/notifications/read')result={readKeys:[]};
      if(path==='/api/employee/earnings'&&method==='POST'){
        const body=route.request().postDataJSON();assert.deepEqual(body.reimbursementItems,[{name:'Gas',cost:12.75},{name:'Supplies',cost:7.10}]);assert.equal(body.gasCost,undefined);
        result={id:'earning',jobId:job.id,employeeId:user.id,employeeName:user.name,customerName:'Test Customer',jobDate:today,originalJobPrice:250,gasCost:19.85,reimbursementItems:body.reimbursementItems,tipAmount:0,upsellAmount:0,upsellDescription:'',upsellOutcome:'',upsellQuotedAmount:0,upsellNotes:'',contractSold:false,status:'pending',ownerNote:'',baseEarnings:55,upsellEarnings:0,contractEarnings:0,tipEarnings:0,totalEarnings:74.85,submittedAt:new Date().toISOString()};data.earnings=[result];job.status='completed';
      }
      if(path==='/api/employee/reimbursements'){
        const body=route.request().postDataJSON();requestAttempts++;
        if(requestAttempts===1){firstAttempt=body;await route.fulfill({status:503,json:{error:'Temporary test failure'}});return;}
        assert.deepEqual(body,firstAttempt);assert.deepEqual(body.items,[{name:'Insurance',cost:75}]);
        result={id:'00000000-0000-4000-8000-000000000003',employeeId:user.id,employeeName:user.name,expenseDate:body.expenseDate,items:body.items,amount:75,notes:body.notes,status:'pending',ownerNote:'',createdAt:new Date().toISOString()};data.reimbursements=[result];
      }
      if(path==='/api/bootstrap'||path==='/api/sync-sheets')result={customers:data.customers,jobs:[],leads:[],servicePlans:[],reviews:[],invoices:[],expenses:[],calendarEvents:[],solicitations:[]};
      if(path==='/api/owner/operations')result={employees:[data.employee],assignments:[],earnings:data.earnings,contracts:[],payouts:[],reimbursements:data.reimbursements};
      if(path==='/api/owner/sales')result={salesmen:[],commissions:[],notifications:[]};
      if(path==='/api/owner/issues')result={issues:[]};
      if(path.endsWith('/review')&&path.includes('/reimbursements/')){assert.equal(route.request().postDataJSON().decision,'approved');data.reimbursements[0].status='approved';result=data.reimbursements[0];}
      if(path==='/api/owner/payouts') {assert.deepEqual(route.request().postDataJSON(),{earningIds:[],reimbursementIds:[data.reimbursements[0].id]});data.reimbursements[0].status='paid';result={id:'payout',employeeId:user.id,employeeName:user.name,amount:75,paidAt:new Date().toISOString(),earningIds:[]};}
      await route.fulfill({json:result});
    });
    await page.goto(url);await page.getByRole('button',{name:'Request reimbursement',exact:true}).waitFor();
    await page.getByRole('button',{name:'Open job details',exact:true}).click();
    await page.getByRole('button',{name:'Earnings & tip',exact:true}).click();
    await page.getByRole('button',{name:'Add item',exact:true}).click();
    await page.getByLabel('Reimbursement item 1',{exact:true}).fill('Gas');
    await page.getByLabel('Reimbursement cost 1',{exact:true}).fill('0');await page.getByLabel('Reimbursement cost 1',{exact:true}).fill('');assert.equal(await page.getByLabel('Reimbursement cost 1',{exact:true}).inputValue(),'');
    await page.getByLabel('Reimbursement cost 1',{exact:true}).fill('12.75');
    await page.getByRole('button',{name:'Add item',exact:true}).click();await page.getByLabel('Reimbursement item 2',{exact:true}).fill('Supplies');await page.getByLabel('Reimbursement cost 2',{exact:true}).fill('7.10');
    const jobModal=page.getByRole('dialog',{name:'Submit job earnings'});const bounds=await jobModal.boundingBox();assert.ok(bounds.y>=59&&bounds.y+bounds.height<=viewport.height-34+1);
    assert.ok((await jobModal.innerText()).includes('$19.85'));assert.equal(await page.getByText('Gas reimbursement ($)').count(),0);
    await page.screenshot({path:`artifacts/job-reimbursements-${viewport.width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Submit earnings & mark completed',exact:true}).click();await jobModal.waitFor({state:'detached'});
    await page.getByRole('button',{name:'Request reimbursement',exact:true}).click();
    const standalone=page.getByRole('dialog',{name:'Request reimbursement'});await page.getByLabel('Reimbursement item 1',{exact:true}).fill('Insurance');await page.getByLabel('Reimbursement cost 1',{exact:true}).fill('75');
    await page.getByLabel('Notes',{exact:true}).fill('Monthly coverage');
    const standaloneBounds=await standalone.boundingBox();assert.ok(standaloneBounds.y>=59&&standaloneBounds.y+standaloneBounds.height<=viewport.height-34+1);
    const dateInput=page.getByLabel('Expense date',{exact:true});
    await dateInput.fill('2026-10-05');assert.equal(await dateInput.inputValue(),'2026-10-05');
    const dateBounds=await dateInput.boundingBox(),notesBounds=await standalone.locator('textarea').boundingBox();
    assert.ok(dateBounds.x>=standaloneBounds.x+19&&dateBounds.x+dateBounds.width<=standaloneBounds.x+standaloneBounds.width-19);
    assert.ok(Math.abs(dateBounds.width-notesBounds.width)<=1);
    assert.equal(await dateInput.evaluate(node=>getComputedStyle(node).appearance),'none');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const inputFonts=await standalone.locator('input').evaluateAll(nodes=>nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)));assert.ok(inputFonts.every(font=>font>=16));
    await page.screenshot({path:`artifacts/standalone-reimbursement-${viewport.width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Submit reimbursement',exact:true}).click();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Retry reimbursement',exact:true}).click();await standalone.waitFor({state:'detached'});
    assert.ok((await page.locator('main').innerText()).includes('$150'));
    role='owner';await page.reload();
    if(viewport.width<1024)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    await page.getByRole('button',{name:'Team',exact:true}).click();
    await page.getByRole('heading',{name:'Not tied to a job · 1 pending',exact:true}).waitFor();
    await page.screenshot({path:`artifacts/owner-reimbursement-review-${viewport.width}.png`,fullPage:true});
    const requestCard=page.locator('article').filter({hasText:'Monthly coverage'});await requestCard.getByRole('button',{name:'Approve',exact:true}).click();
    await page.getByRole('button',{name:'Mark reimbursement paid',exact:true}).click();
    await page.getByRole('heading',{name:'Approved reimbursements · $0.00',exact:true}).waitFor();
    role='employee';await page.reload();await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByText('Reimbursement paid',{exact:true}).waitFor();
    role='owner';await page.reload();await page.getByRole('button',{name:'Open profile menu',exact:true}).click();await page.getByRole('button',{name:'Employee preview',exact:true}).click();
    await page.getByRole('button',{name:'Request reimbursement',exact:true}).click();await page.getByLabel('Reimbursement item 1',{exact:true}).fill('Practice supplies');await page.getByLabel('Reimbursement cost 1',{exact:true}).fill('10');
    await page.getByRole('button',{name:'Submit reimbursement',exact:true}).click();await page.getByRole('dialog',{name:'Request reimbursement'}).waitFor({state:'detached'});
    assert.equal(requestAttempts,2);
    assert.deepEqual(errors,[]);
    console.log(`Reimbursements ${viewport.width}: job itemization, total, zero deletion, safe areas, standalone retry, owner approval/payment, personal notification passed`);
    await context.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
