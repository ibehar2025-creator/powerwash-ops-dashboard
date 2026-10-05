import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve('dist');
const server=createServer(async(req,res)=>{try{const path=resolve(root,req.url.split('?')[0].slice(1)||'index.html');if(relative(root,path).startsWith('..'))throw new Error('Invalid path');const contents=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'})[extname(path)]||'application/octet-stream');res.end(contents);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const viewport of [{width:390,height:844},{width:360,height:800},{width:1440,height:1000}]){
  const mobile=viewport.width<600;const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let read=[];const requests=[];const user={id:'test-salesman',name:'Test Salesman',email:'sales@example.invalid',role:'salesman',age:18,phone:'',pictureUrl:''};
  const job={id:'test-job',customerId:'test-customer',date:'2099-10-10',time:'09:00',address:'123 Example Avenue',serviceType:'Windows',status:'scheduled',price:450,amountPaid:0,tipAmount:0,paymentStatus:'unpaid',notes:'',employeeInstructions:'Use the side gate',source:'manual',crewIds:[]};
  const credit={id:'test-credit',jobId:job.id,salesmanId:user.id,salesmanName:user.name,customerName:'Test Customer',jobDate:job.date,servicePrice:450,currentServicePrice:450,rate:0.20,amount:90,status:'estimated',ownerNote:'',workerPending:false,payrollLinked:false};
  const data={jobs:[job],mapJobs:[job],customers:[{id:'test-customer',name:'Test Customer',phone:'555-0100',email:'customer@example.invalid',address:job.address,notes:'',insights:[]}],mapCustomers:[{id:'test-customer',name:'Test Customer',address:job.address}],commissions:[credit],leads:[{id:'test-lead',name:'Example Lead',contact:'555-0101',address:'124 Example Avenue',source:'Map solicitation',status:'new',estimatedValue:0,followUpDate:'2026-01-01',notes:'Call before visiting.'}],solicitations:[],notifications:[{id:'test-event',title:'Job booked',detail:'Test Customer - 2099-10-10',created_at:'2026-10-03'}],statements:[]};
  if(mobile)await page.route(/\.css$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top)','59px').replaceAll('env(safe-area-inset-bottom)','34px')});});
  await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;requests.push(path);let result={};if(path==='/api/auth/config')result={enabled:true,clientId:'test',state:'test',signupCodeRequired:true};if(path==='/api/auth/session')result={user};if(path==='/api/salesman/bootstrap')result=data;if(path==='/api/notifications/read'){if(route.request().method()==='POST')read=[...new Set([...read,...route.request().postDataJSON().keys])];result={readKeys:read};}if(path==='/api/salesman/jobs'&&route.request().method()==='POST'){const body=route.request().postDataJSON();assert.ok(body.requestId);const saved={...job,...body,id:'new-test-job',customerId:'new-test-customer'};data.jobs.push(saved);data.customers.push({...data.customers[0],id:saved.customerId,name:body.name});result=saved;}await route.fulfill({json:result});});
  await page.goto(url);await page.getByRole('heading',{name:'Sales overview'}).waitFor();
  await page.getByRole('button',{name:'Open profile menu'}).click();
  assert.equal(await page.getByRole('button',{name:'Salesman preview',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Employee preview',exact:true}).count(),0);
  await page.getByRole('button',{name:'Open profile menu'}).click();
  assert.equal(await page.getByText('Company revenue').count(),0);assert.equal(requests.some(path=>path.startsWith('/api/owner/')),false);
  const width=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(width.scroll<=width.client);
  await page.screenshot({path:`artifacts/salesman-dashboard-${viewport.width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Notifications',exact:true}).click();await page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();
  await page.waitForFunction(()=>true);assert.ok(read.some(key=>key.startsWith('inbox-seen|')));assert.equal(read.some(key=>key==='sales|test-event'),false);
  await page.getByRole('button',{name:'Mark Job booked as read'}).click();await page.getByRole('button',{name:'Close notifications',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Notifications',exact:true}).count(),0);
  await page.getByRole('button',{name:'Book job',exact:true}).click();await page.getByRole('heading',{name:'Book a job',exact:true}).waitFor();
  await page.getByLabel('Customer name', {exact:true}).fill('New Test Customer');await page.getByLabel('Address',{exact:true}).fill('125 Example Avenue');await page.getByLabel('Service',{exact:true}).fill('Driveway');await page.getByLabel('Date',{exact:true}).fill('2099-10-11');await page.getByLabel('Service price',{exact:true}).fill('0');await page.getByLabel('Service price',{exact:true}).fill('');assert.equal(await page.getByLabel('Service price',{exact:true}).inputValue(),'');await page.getByLabel('Service price',{exact:true}).fill('450');
  const fields=await page.locator('.sales-dialog input').evaluateAll(nodes=>nodes.map(n=>({font:parseFloat(getComputedStyle(n).fontSize),right:n.getBoundingClientRect().right,parent:n.parentElement.getBoundingClientRect().right})));assert.ok(fields.every(f=>f.font>=16&&f.right<=f.parent+1));
  if(mobile){const top=await page.locator('.sales-dialog').evaluate(n=>n.getBoundingClientRect().top);assert.ok(top>=59);}
  await page.screenshot({path:`artifacts/salesman-booking-${viewport.width}.png`,fullPage:true});await page.locator('.sales-dialog').getByRole('button',{name:'Book job',exact:true}).click();await page.getByRole('heading',{name:'My Jobs',exact:true}).last().waitFor();await page.getByLabel('Search my jobs').fill('New Test');assert.equal(await page.locator('article').count(),1);
  if(mobile)await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'My Earnings',exact:true}).click();await page.getByText('$450 × 20% =').waitFor();assert.ok((await page.locator('main').innerText()).includes('$90'));
  await page.screenshot({path:`artifacts/salesman-earnings-${viewport.width}.png`,fullPage:true});assert.deepEqual(errors,[]);await context.close();console.log(`Salesman UI: ${viewport.width}px passed (safe areas, notifications, booking, zero deletion, search, earnings)`);
  const ownerContext=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});const ownerPage=await ownerContext.newPage();const ownerErrors=[];const ownerRequests=[];ownerPage.on('pageerror',e=>ownerErrors.push(e.message));
  if(mobile)await ownerPage.route(/\.css$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replaceAll('env(safe-area-inset-top)','59px').replaceAll('env(safe-area-inset-bottom)','34px')});});
  const person={id:'test-salesman',name:'Test Salesman',email:'sales@example.invalid',active:true,pictureUrl:'',commissionPct:0.20};
  const paidWeek={id:'old-run',periodStart:'2026-09-28',periodEnd:'2026-10-04',payday:'2026-10-06',status:'paid',lines:[],adjustments:[],payments:[],grossEarnings:0,totalAdditions:0,totalDeductions:0,netPay:0,createdAt:'2026-10-03'};
  const payroll={preview:{periodStart:paidWeek.periodStart,periodEnd:paidWeek.periodEnd,payday:paidWeek.payday,eligibleLines:[],missingApprovals:0},runs:[paidWeek]};
  await ownerPage.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname,method=route.request().method();let result={};
    ownerRequests.push({path,method});
    if(path==='/api/auth/config')result={enabled:true,clientId:'test',state:'test',signupCodeRequired:true};
    if(path==='/api/auth/session')result={user:{...user,id:'test-owner',role:'owner'}};
    if(path==='/api/bootstrap'||path==='/api/sync-sheets')result={customers:[],jobs:[],leads:[],invoices:[],expenses:[],servicePlans:[],reviews:[],solicitations:[],calendarEvents:[]};
    if(path==='/api/owner/operations')result={employees:[],assignments:[],earnings:[],contracts:[],payouts:[]};
    if(path==='/api/owner/sales')result={salesmen:[person],commissions:[],notifications:[]};
    if(path===`/api/owner/salesmen/${person.id}`&&method==='PATCH'){const body=route.request().postDataJSON();assert.equal(body.commissionPct,0.15);person.commissionPct=body.commissionPct;result={saved:true};}
    if(path==='/api/owner/sales-preview/map')result={mapJobs:[{id:'real-history-job',customerId:'real-history-customer',date:'2020-01-01',time:'09:00',address:'123 Example Avenue',serviceType:'Windows',status:'completed',latitude:29.7174,longitude:-95.4307}],mapCustomers:[{id:'real-history-customer',name:'Real History Customer',address:'123 Example Avenue'}]};
    if(path==='/api/notifications/read')result={readKeys:[]};
    if(path==='/api/owner/payroll'){
      if(method==='POST'){const body=route.request().postDataJSON();assert.equal(body.allowEmpty,true);assert.equal(body.periodStart,'2026-10-05');result={...paidWeek,...body,id:'correction-run',status:'draft'};payroll.runs.push(result);}
      else result=payroll;
    }
    const run=payroll.runs.find(r=>r.id==='correction-run');
    if(path==='/api/owner/payroll/correction-run/adjustments'){const body=route.request().postDataJSON();assert.equal(body.employeeId,person.id);run.adjustments.push({...body,id:'correction',employeeName:person.name,createdAt:'2026-10-03'});run.totalAdditions=10;run.netPay=10;result=run;}
    if(path==='/api/owner/payroll/correction-run/finalize'){run.status='finalized';result=run;}
    if(path==='/api/owner/payroll/correction-run/payments'){assert.equal(route.request().postDataJSON().employeeId,person.id);run.status='paid';run.payments.push({id:'payment',employeeId:person.id,employeeName:person.name,amount:10,paymentMethod:'bank',paidAt:'2026-10-03'});result=run;}
    await route.fulfill({json:result});
  });
  await ownerPage.goto(url);await ownerPage.getByRole('heading',{name:'Performance snapshot'}).waitFor();
  await ownerPage.waitForLoadState('networkidle');
  const pendingKey='powerwash-pending-sales-booking:test-owner';
  await ownerPage.evaluate(key=>localStorage.setItem(key,JSON.stringify({requestId:'real-pending-owner-booking',name:'Real pending draft'})),pendingKey);
  await ownerPage.getByRole('button',{name:'Open profile menu'}).click();
  assert.equal(await ownerPage.getByRole('button',{name:'Employee preview',exact:true}).count(),1);
  const previewStart=ownerRequests.length;
  await ownerPage.getByRole('button',{name:'Salesman preview',exact:true}).click();await ownerPage.getByRole('heading',{name:'Sales overview'}).waitFor();
  await ownerPage.waitForLoadState('networkidle');
  assert.deepEqual(ownerRequests.slice(previewStart),[{path:'/api/owner/sales-preview/map',method:'GET'}]);
  assert.ok((await ownerPage.locator('main').innerText()).includes('Sample Customer'));
  if(mobile)assert.ok((await ownerPage.getByRole('button',{name:'Return to owner'}).boundingBox()).y>=59);
  const previewWidth=await ownerPage.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(previewWidth.scroll<=previewWidth.client);
  await ownerPage.screenshot({path:`artifacts/salesman-preview-${viewport.width}.png`,fullPage:true});
  await ownerPage.getByRole('button',{name:'Open profile menu'}).click();
  await ownerPage.getByRole('button',{name:'Light',exact:true}).click();
  await ownerPage.screenshot({path:`artifacts/salesman-preview-light-${viewport.width}.png`,fullPage:true});
  await ownerPage.getByRole('button',{name:'Dark',exact:true}).click();
  const returnColors=await ownerPage.getByRole('button',{name:'Return to owner'}).evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));
  assert.deepEqual(returnColors,{color:'rgb(120, 53, 15)',background:'rgb(255, 255, 255)'});
  await ownerPage.screenshot({path:`artifacts/salesman-preview-dark-${viewport.width}.png`,fullPage:true});
  assert.equal(await ownerPage.getByRole('button',{name:'My profile',exact:true}).count(),0);
  assert.equal(await ownerPage.getByRole('button',{name:'Report a problem',exact:true}).count(),0);
  assert.equal(await ownerPage.getByRole('button',{name:'Salesman preview',exact:true}).count(),0);
  await ownerPage.getByRole('button',{name:'Open profile menu'}).click();
  await ownerPage.getByRole('button',{name:'Notifications',exact:true}).click();
  await ownerPage.getByRole('button',{name:'Mark Sample commission approved as read'}).click();
  await ownerPage.getByRole('button',{name:'Close notifications',exact:true}).click();
  await ownerPage.getByRole('button',{name:'Book job',exact:true}).click();
  assert.equal(await ownerPage.getByText('This booking is awaiting confirmation.',{exact:true}).count(),0);
  await ownerPage.getByLabel('Customer name',{exact:true}).fill('Practice New Customer');
  await ownerPage.getByLabel('Address',{exact:true}).fill('Practice new property');
  await ownerPage.getByLabel('Service',{exact:true}).fill('Windows');
  await ownerPage.getByLabel('Date',{exact:true}).fill('2099-10-11');
  await ownerPage.getByLabel('Service price',{exact:true}).fill('450');
  await ownerPage.locator('.sales-dialog').getByRole('button',{name:'Book job',exact:true}).click();
  await ownerPage.getByLabel('Search my jobs').fill('Practice New Customer');
  assert.equal(await ownerPage.locator('article').count(),1);
  await ownerPage.getByRole('button',{name:'Edit Practice New Customer',exact:true}).click();
  await ownerPage.getByLabel('Service price',{exact:true}).fill('500');
  await ownerPage.getByRole('button',{name:'Save changes',exact:true}).click();
  await ownerPage.getByText('$500 × 20% = $100 (estimated)',{exact:true}).waitFor();
  const previewTab=async name=>{if(mobile)await ownerPage.getByRole('button',{name:'Open menu',exact:true}).click();await ownerPage.getByRole('button',{name,exact:true}).click();};
  await previewTab('Leads');await ownerPage.getByRole('button',{name:'Edit',exact:true}).click();
  await ownerPage.locator('.sales-dialog textarea').fill('Practice edited follow-up');
  await ownerPage.getByRole('button',{name:'Save follow-up',exact:true}).click();
  await ownerPage.getByText('Practice edited follow-up',{exact:true}).waitFor();
  await ownerPage.getByRole('button',{name:'Book job',exact:true}).click();
  assert.equal(await ownerPage.getByLabel('Customer name',{exact:true}).inputValue(),'Sample Follow-up');
  await ownerPage.getByLabel('Service',{exact:true}).fill('Driveway');await ownerPage.getByLabel('Service price',{exact:true}).fill('250');
  await ownerPage.locator('.sales-dialog').getByRole('button',{name:'Book job',exact:true}).click();
  await previewTab('Leads');await ownerPage.getByText('won',{exact:true}).waitFor();
  await previewTab('My Earnings');assert.ok((await ownerPage.locator('main').innerText()).includes('$100'));
  await ownerPage.getByRole('button',{name:'Refresh',exact:true}).click();
  await ownerPage.waitForLoadState('networkidle');
  assert.ok(ownerRequests.slice(previewStart).length>=5);
  assert.ok(ownerRequests.slice(previewStart).every(request=>request.path==='/api/owner/sales-preview/map'&&request.method==='GET'));
  await previewTab('My Jobs');await ownerPage.getByLabel('Search my jobs').fill('Real History Customer');assert.equal(await ownerPage.locator('article').count(),0);
  await ownerPage.getByLabel('Search my jobs').fill('Practice New Customer');assert.equal(await ownerPage.locator('article').count(),1);
  assert.deepEqual(JSON.parse(await ownerPage.evaluate(key=>localStorage.getItem(key),pendingKey)),{requestId:'real-pending-owner-booking',name:'Real pending draft'});
  await ownerPage.getByRole('button',{name:'Return to owner'}).click();await ownerPage.getByRole('heading',{name:'Performance snapshot'}).waitFor();
  await ownerPage.waitForLoadState('networkidle');await ownerPage.getByRole('button',{name:'Open profile menu'}).click();
  await ownerPage.getByRole('button',{name:'Salesman preview',exact:true}).click();await ownerPage.getByRole('heading',{name:'Sales overview'}).waitFor();
  await previewTab('My Jobs');await ownerPage.getByLabel('Search my jobs').fill('Practice New Customer');assert.equal(await ownerPage.locator('article').count(),0);
  await ownerPage.getByRole('button',{name:'Return to owner'}).click();await ownerPage.getByRole('heading',{name:'Performance snapshot'}).waitFor();
  console.log(`Owner salesman preview: ${viewport.width}px passed (owner-only menu, safe areas, read-only real history, practice booking/editing/leads/notifications without writes, draft isolation, reset)`);
  if(mobile)await ownerPage.getByRole('button',{name:'Open navigation',exact:true}).click();
  await ownerPage.getByRole('button',{name:'Team & Pay',exact:true}).click();await ownerPage.getByRole('heading',{name:'Sales accounts',exact:true}).waitFor();await ownerPage.getByLabel('Test Salesman sales commission percentage',{exact:true}).fill('15');await ownerPage.getByRole('button',{name:'Save percentage',exact:true}).click();await ownerPage.getByText('15% sales commission · Active',{exact:true}).waitFor();await ownerPage.getByRole('tab',{name:'Payments',exact:true}).click();await ownerPage.getByRole('heading',{name:'Weekly contractor payments'}).waitFor();
  await ownerPage.getByRole('button',{name:'Payroll correction',exact:true}).click();await ownerPage.getByLabel('Contractor',{exact:true}).selectOption(person.id);await ownerPage.getByLabel('Amount',{exact:true}).fill('10');await ownerPage.getByLabel('Reason',{exact:true}).fill('Corrected sales commission after payment');
  await ownerPage.getByRole('button',{name:'Save correction',exact:true}).click();await ownerPage.getByText('Payroll adjustments',{exact:true}).waitFor();assert.equal(await ownerPage.getByLabel('Payment week',{exact:true}).inputValue(),'correction-run');
  await ownerPage.getByRole('button',{name:'Confirm weekly amounts',exact:true}).click();await ownerPage.getByRole('button',{name:'Mark paid',exact:true}).click();await ownerPage.getByText('Payment marked as paid.',{exact:true}).waitFor();
  assert.ok((await ownerPage.locator('.app-content').innerText()).includes('$10'));assert.deepEqual(ownerErrors,[]);
  await ownerPage.screenshot({path:`artifacts/payroll-correction-${viewport.width}.png`,fullPage:true});await ownerContext.close();console.log(`Owner payroll UI: ${viewport.width}px passed (future correction week, adjusted recipient total, confirmation, payment)`);
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
