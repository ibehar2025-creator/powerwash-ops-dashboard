import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const file = resolve(root, req.url.split('?')[0].slice(1) || 'index.html');
    if (relative(root, file).startsWith('..')) throw Error('Invalid path');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport, timezoneId: 'America/Chicago' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route(/\.css$/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px') });
    });
    const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
    const customer = { id: 'customer', name: 'Existing Customer', phone: '', email: '', address: '123 Test Street', notes: '', insights: [] };
    const customers = [customer];
    const plans = [{ id: 'employee-contract-approved', customerId: customer.id, type: 'yearly', price: 275.25, discountPct: 0, renewalDate: today, paymentStatus: 'paid', servicesIncluded: ['Windows'], notes: '' }];
    const signatureData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJbQAAAAASUVORK5CYII=';
    const agreementText = 'Original signed agreement. Two visits over twelve months. No automatic renewal.';
    const approved = { id: 'approved', employeeId: 'employee', employeeName: 'Test Employee', customerName: customer.name, customerPhone: '', customerEmail: '', serviceAddress: customer.address, serviceDescription: 'Windows', frequency: 'Yearly', relatedJob: '', price: 275.25, notes: '', agreementText, signerName: customer.name, signatureData, electronicConsent: true, signedAt: '2026-10-01T15:00:00Z', status: 'approved', ownerNote: '', createdAt: '2026-10-01T15:00:00Z' };
    const contracts = [approved, { ...approved, id: 'pending', customerName: 'New Contract Customer', signerName: 'New Contract Customer', status: 'pending' }, { ...approved, id: 'rejected', customerName: 'Rejected Customer', status: 'rejected', signatureData: '', signerName: '', signedAt: '' }];
    let reviewAttempts = 0, edits = 0, creations = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method();
      let result = {};
      if (path === '/api/auth/config') result = { enabled: true, clientId: 'test', state: 'test', signupCodeRequired: true };
      if (path === '/api/auth/session') result = { user: { id: 'owner', name: 'Test Owner', role: 'owner', age: 18, email: 'owner@example.invalid', phone: '', pictureUrl: '' } };
      if (path === '/api/bootstrap' || path === '/api/sync-sheets') result = { customers, jobs: [], leads: [], servicePlans: plans, reviews: [], invoices: [], expenses: [], calendarEvents: [], solicitations: [] };
      if (path === '/api/owner/operations') result = { employees: [], assignments: [], earnings: [], contracts, payouts: [], reimbursements: [] };
      if (path === '/api/owner/sales') result = { salesmen: [], commissions: [], notifications: [] };
      if (path === '/api/owner/issues') result = { issues: [] };
      if (path === '/api/notifications/read') result = { readKeys: [] };
      if (path === '/api/service-plans/employee-contract-approved' && method === 'PATCH') {
        const body = route.request().postDataJSON();
        assert.equal(body.price, 300.50); assert.equal(body.notes, 'Updated service details');
        Object.assign(plans[0], body); result = plans[0]; edits++;
      }
      if (path === '/api/service-plans' && method === 'POST') {
        const body = route.request().postDataJSON(); assert.equal(body.price, 125.75);
        result = { id: 'manual-plan', discountPct: 0, ...body }; plans.push(result); creations++;
      }
      if (path === '/api/owner/contracts/pending/review') {
        assert.equal(route.request().postDataJSON().decision, 'approved'); reviewAttempts++;
        if (reviewAttempts === 1) { await route.fulfill({ status: 503, json: { error: 'Temporary review failure' } }); return; }
        contracts[1].status = 'approved'; customers.push({ ...customer, id: 'new-customer', name: 'New Contract Customer' });
        plans.push({ ...plans[0], id: 'employee-contract-pending', customerId: 'new-customer' }); result = contracts[1];
      }
      await route.fulfill({ json: result });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    if (viewport.width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Contracts', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Plans & Contracts', exact: true }).click();
    await page.getByRole('heading', { name: 'Plan editor', exact: true }).waitFor();
    await page.getByLabel('Plan price', { exact: true }).fill('');
    assert.equal(await page.getByLabel('Plan price', { exact: true }).inputValue(), '');
    await page.getByLabel('Plan price', { exact: true }).fill('300.50');
    await page.getByLabel('Notes', { exact: true }).fill('Updated service details');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByText('Service plan saved.', { exact: true }).waitFor();
    assert.equal(edits, 1); assert.equal(approved.agreementText, agreementText); assert.equal(approved.signatureData, signatureData);
    await page.getByRole('button', { name: 'View agreement', exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: 'Agreements', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByText(agreementText, { exact: true }).waitFor();
    assert.equal(await page.locator('details').getAttribute('open'), '');
    assert.equal(await page.getByRole('img', { name: 'Electronic signature of Existing Customer' }).evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.screenshot({ path: `artifacts/recurring-agreement-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'All agreements', exact: true }).click();
    await page.getByRole('heading', { name: 'Rejected Customer', exact: true }).waitFor();
    await page.getByRole('button', { name: 'View service plan', exact: true }).click();
    assert.equal(await page.getByLabel('Plan price', { exact: true }).inputValue(), '300.5');
    await page.getByRole('button', { name: 'Add service plan', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Add service plan' });
    await modal.waitFor();
    await modal.locator('select').first().selectOption(customer.id);
    await modal.getByLabel('Plan price', { exact: true }).fill('125.75');
    await modal.getByLabel('Service', { exact: true }).fill('Driveway');
    const date = modal.getByLabel('Next service date', { exact: true }); await date.fill(today);
    const box = await modal.boundingBox(), dateBox = await date.boundingBox();
    assert.ok(box.y >= 59 && box.y + box.height <= viewport.height - 33);
    assert.ok(dateBox.x >= box.x && dateBox.x + dateBox.width <= box.x + box.width);
    await modal.screenshot({ path: `artifacts/recurring-create-${viewport.width}.png` });
    await modal.getByRole('button', { name: 'Add service plan', exact: true }).click();
    await modal.waitFor({ state: 'detached' }); assert.equal(creations, 1);
    assert.equal(await page.getByRole('button', { name: 'View agreement', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Open notifications', exact: true }).click();
    await page.getByRole('button', { name: /^New contract: New Contract Customer/ }).click();
    assert.equal(await page.getByRole('tab', { name: /^Review/ }).getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(plans.length, 2);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByText('No new contracts are waiting for approval.', { exact: true }).waitFor();
    assert.equal(plans.length, 3);
    await page.getByRole('tab', { name: 'Plans', exact: true }).click();
    assert.ok((await page.getByRole('combobox').first().innerText()).includes('New Contract Customer'));
    await page.getByRole('tab', { name: 'Agreements', exact: true }).click();
    await page.getByRole('button', { name: 'Open notifications', exact: true }).click();
    await page.getByRole('button', { name: /^(Plan renewal|Overdue renewal): Existing Customer/ }).first().click();
    assert.equal(await page.getByRole('tab', { name: 'Plans', exact: true }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Plans', exact: true }).focus(); await page.keyboard.press('End');
    assert.equal(await page.getByRole('tab', { name: 'Agreements', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok((await page.locator('.recurring-tabs button').evaluateAll(nodes => nodes.map(node => node.scrollWidth <= node.clientWidth))).every(Boolean));
    await page.screenshot({ path: `artifacts/recurring-plans-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Open profile menu', exact: true }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.text-button')).color === 'rgb(71, 85, 105)');
    await page.screenshot({ path: `artifacts/recurring-plans-light-${viewport.width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`Plans & Contracts ${viewport.width}: navigation, editing, immutable signatures, linked views, creation, review retry, customer refresh, notifications, keyboard and layout passed`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
