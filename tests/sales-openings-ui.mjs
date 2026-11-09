import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const file = resolve(root, new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html');
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
    const mobile = viewport.width < 1024;
    const context = await browser.newContext({ viewport, timezoneId: 'America/Chicago', isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (viewport.width < 1024) await page.route(/\.css$/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px') });
    });
    const today = await page.evaluate(() => new Date().toLocaleDateString('en-CA'));
    const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
    const daysUntilMonday = (8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7 || 7;
    const tomorrow = shift(today, daysUntilMonday), followingDay = shift(tomorrow, 1);
    const owner = { id: 'owner', role: 'owner', name: 'Test Owner', email: 'owner@example.invalid', phone: '', pictureUrl: '', age: 18 };
    const own = { id: 'my-job', customerId: 'my-customer', date: followingDay, time: '09:00', address: '100 My Avenue', serviceType: 'Windows', price: 150, status: 'scheduled' };
    const other = { ...own, id: 'busy-job', customerId: 'other-customer', date: tomorrow, time: '14:30', address: '777 Private Lane', price: 987 };
    const sales = { jobs: [own], mapJobs: [own, other], customers: [{ id: own.customerId, name: 'My Scheduled Customer' }], mapCustomers: [{ id: other.customerId, name: 'Other Private Customer' }], leads: [], commissions: [], solicitations: [], notifications: [], statements: [] };
    const openings = [];
    let role = 'owner', attempts = 0, nextId = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method();
      let result = {};
      if (path === '/api/auth/config') result = { enabled: true, clientId: 'test', state: 'test', signupCodeRequired: true };
      if (path === '/api/auth/session') result = { user: role === 'owner' ? owner : { ...owner, id: 'sales', role, name: 'Test Salesman' } };
      if (path === '/api/bootstrap' || path === '/api/sync-sheets') result = { customers: [], jobs: [], leads: [], invoices: [], expenses: [], servicePlans: [], reviews: [], solicitations: [], calendarEvents: [] };
      if (path === '/api/owner/operations') result = { employees: [], assignments: [], earnings: [], contracts: [], payouts: [] };
      if (path === '/api/owner/sales') result = { salesmen: [], commissions: [], notifications: [] };
      if (path === '/api/owner/issues') result = { issues: [] };
      if (path === '/api/notifications/read') result = { readKeys: [] };
      if (path === '/api/owner/sales-openings') {
        assert.equal(role, 'owner');
        if (method === 'POST') { result = { id: `opening-${++nextId}`, ...route.request().postDataJSON(), status: 'open' }; openings.push(result); }
        else result = { openings };
      }
      if (path.startsWith('/api/owner/sales-openings/')) {
        assert.equal(role, 'owner');
        const index = openings.findIndex(item => path.endsWith(item.id));
        assert.ok(index >= 0);
        if (openings[index].weekendDefault) assert.equal(new URL(route.request().url()).searchParams.get('date'), openings[index].date);
        if (method === 'PATCH') { result = Object.assign(openings[index], route.request().postDataJSON()); }
        if (method === 'DELETE') { openings.splice(index, 1); result = { deleted: true }; }
      }
      if (path === '/api/salesman/bootstrap') result = sales;
      if (path === '/api/salesman/openings') {
        assert.equal(role, 'salesman');
        result = { openings: openings.filter(item => item.status === 'open').map(({ id, date, startTime, endTime }) => ({ id, date, startTime, endTime })) };
      }
      if (path === '/api/salesman/jobs' && method === 'POST') {
        const body = route.request().postDataJSON();
        assert.ok(body.requestId);
        attempts++;
        if (attempts === 1) {
          assert.equal(body.openingId, openings[0].id);
          openings[0].status = 'booked';
          await route.fulfill({ status: 409, json: { code: 'OPENING_UNAVAILABLE', error: 'This opening is no longer available.' } });
          return;
        }
        assert.equal(body.openingId, openings[1].id); assert.equal(body.date, followingDay); assert.equal(body.time, '13:00');
        openings[1].status = 'booked';
        result = { ...body, id: 'job', customerId: 'customer', status: 'scheduled', notes: '', source: 'manual' };
        sales.jobs.push(result); sales.customers.push({ id: 'customer', name: body.name });
      }
      await route.fulfill({ json: result });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    if (viewport.width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    const add = async (date, start, end) => {
      const button = page.getByRole('button', { name: `Add opening on ${date}`, exact: true });
      if (!await button.isVisible()) await page.getByRole('button', { name: 'Next week', exact: true }).click();
      await button.click();
      const editor = page.getByRole('dialog', { name: 'Add opening', exact: true });
      assert.equal(await editor.getByLabel('Date', { exact: true }).inputValue(), date);
      await editor.getByLabel('Start time', { exact: true }).fill(start);
      await editor.getByLabel('End time', { exact: true }).fill(end);
      const frame = await editor.boundingBox(), input = await editor.getByLabel('Date', { exact: true }).boundingBox();
      assert.ok(input.x + input.width <= frame.x + frame.width);
      if (viewport.width < 1024) assert.ok(frame.y >= 59 && frame.y + frame.height <= viewport.height - 33);
      await editor.screenshot({ path: `artifacts/opening-editor-${viewport.width}.png` });
      await editor.getByRole('button', { name: 'Publish opening', exact: true }).click();
      await editor.waitFor({ state: 'detached' });
    };
    await page.getByRole('button', { name: `Add opening on ${today}`, exact: true }).waitFor();
    const toolbar = page.locator('.calendar-owner-header');
    const addMenu = toolbar.getByRole('button', { name: 'Add to calendar', exact: true });
    const addEvent = toolbar.getByRole('button', { name: 'Add event', exact: true });
    const addOpening = toolbar.getByRole('button', { name: 'Add opening', exact: true });
    assert.equal(await toolbar.getByRole('button', { name: 'Today', exact: true }).count(), 1);
    if (viewport.width < 640) {
      assert.equal(await addEvent.count(), 0);
      assert.equal(await addOpening.count(), 0);
      const [plus, prev, next, views, todayButton] = await Promise.all([
        addMenu.boundingBox(),
        toolbar.getByRole('button', { name: 'Previous week', exact: true }).boundingBox(),
        toolbar.getByRole('button', { name: 'Next week', exact: true }).boundingBox(),
        toolbar.getByRole('group', { name: 'Calendar view', exact: true }).boundingBox(),
        toolbar.getByRole('button', { name: 'Today', exact: true }).boundingBox(),
      ]);
      assert.ok(plus.y + plus.height <= prev.y);
      assert.ok(Math.abs(prev.y - next.y) <= 1 && prev.x < next.x);
      assert.ok(views.y > prev.y && Math.abs(views.y + views.height / 2 - todayButton.y - todayButton.height / 2) <= 1);
      assert.ok(todayButton.x + todayButton.width <= viewport.width);
      await toolbar.screenshot({ path: `artifacts/calendar-phone-toolbar-${viewport.width}.png` });
      await addMenu.click();
      await addEvent.waitFor();
      await toolbar.getByRole('heading', { name: 'Scheduling calendar', exact: true }).click();
      assert.equal(await addMenu.getAttribute('aria-expanded'), 'false');
      await addMenu.click();
      await page.keyboard.press('Escape');
      assert.equal(await addMenu.getAttribute('aria-expanded'), 'false');
      await addMenu.click();
      await addEvent.click();
      const closeEvent = page.getByRole('button', { name: 'Close calendar event editor', exact: true });
      await closeEvent.click();
      await addMenu.click();
      await addOpening.click();
      const openingEditor = page.getByRole('dialog', { name: 'Add opening', exact: true });
      await openingEditor.getByRole('button', { name: 'Close opening', exact: true }).click();
    } else {
      assert.equal(await addMenu.count(), 0);
      assert.ok(await addEvent.isVisible() && await addOpening.isVisible());
    }
    await add(tomorrow, '09:00', '11:00');
    await page.getByRole('button', { name: /9:00 AM.*11:00 AM.*Available to sales/ }).click();
    const existing = page.getByRole('dialog', { name: 'Calendar opening', exact: true });
    await existing.getByLabel('End time', { exact: true }).fill('12:00');
    await existing.getByRole('button', { name: 'Save changes', exact: true }).click();
    await existing.waitFor({ state: 'detached' });
    await add(followingDay, '13:00', '16:00');
    await add(followingDay, '16:00', '17:00');
    await page.getByRole('button', { name: /4:00 PM.*5:00 PM.*Available to sales/ }).click();
    await existing.getByRole('button', { name: 'Remove opening', exact: true }).click();
    await existing.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await existing.waitFor({ state: 'detached' });
    assert.equal(openings.length, 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `artifacts/owner-openings-${viewport.width}.png`, fullPage: true });
    role = 'salesman'; await page.reload();
    await page.getByRole('heading', { name: 'Next available', exact: true }).waitFor();
    await page.getByText('9:00 AM - 12:00 PM', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Book opening', exact: true }).click();
    const quickBook = page.getByRole('dialog', { name: 'Book a job', exact: true });
    async function assertScheduleControls(form) {
      const service = await form.getByLabel('Service', { exact: true }).boundingBox();
      const controls = form.locator('input:is([type="date"], [type="time"])');
      const fields = await controls.evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
        return { left: rect.left, width: rect.width, height: rect.height, appearance: css.appearance, alignment: css.textAlign, font: parseFloat(css.fontSize) };
      }));
      assert.equal(fields.length, 2);
      for (const field of fields) {
        if (mobile) assert.ok(Math.abs(field.left - service.x) <= 1);
        assert.ok(Math.abs(field.width - service.width) <= 1);
        assert.equal(field.appearance, 'none');
        assert.equal(field.alignment, 'left');
        assert.ok(field.font >= 16);
      }
      assert.ok(Math.abs(fields[0].height - fields[1].height) <= 1);
      assert.ok(await form.evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await assertScheduleControls(quickBook);
    assert.equal(await quickBook.getByLabel('Date', { exact: true }).inputValue(), tomorrow);
    assert.equal(await quickBook.getByLabel('Time', { exact: true }).inputValue(), '09:00');
    await quickBook.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.screenshot({ path: `artifacts/sales-next-opening-${viewport.width}.png`, fullPage: false });
    await page.getByRole('button', { name: 'View calendar', exact: true }).click();
    const calendar = page.getByRole('region', { name: 'Bookable calendar', exact: true });
    await calendar.waitFor();
    const bookButtons = calendar.getByRole('button', { name: /Book opening/ });
    assert.equal(await bookButtons.count(), 2);
    assert.equal(await calendar.locator('.calendar-day').count(), 7);
    assert.equal(await calendar.getByText('Busy', { exact: true }).count(), 1);
    assert.equal(await calendar.getByText('My Scheduled Customer', { exact: true }).count(), 1);
    assert.doesNotMatch(await calendar.innerText(), /777 Private Lane|Other Private Customer|987/);
    const view = calendar.getByRole('group', { name: 'Calendar view', exact: true });
    await view.getByRole('button', { name: 'day', exact: true }).click();
    assert.equal(await calendar.locator('.calendar-day').count(), 1);
    await calendar.getByRole('button', { name: 'Next day', exact: true }).click();
    await calendar.getByRole('button', { name: /My Scheduled Customer/ }).click();
    const editBooking = page.getByRole('dialog', { name: 'Edit booking', exact: true });
    assert.equal(await editBooking.getByLabel('Date', { exact: true }).inputValue(), followingDay);
    await assertScheduleControls(editBooking);
    const time = editBooking.getByLabel('Time', { exact: true });
    await time.fill('15:15');
    assert.equal(await time.inputValue(), '15:15');
    await editBooking.getByRole('button', { name: 'Cancel', exact: true }).click();
    await view.getByRole('button', { name: 'month', exact: true }).click();
    assert.ok(await calendar.locator('.calendar-day').count() >= 28);
    await view.getByRole('button', { name: 'week', exact: true }).click();
    assert.equal(await calendar.locator('.calendar-day').count(), 7);
    assert.equal(await bookButtons.count(), 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `artifacts/sales-openings-${viewport.width}.png`, fullPage: true });
    async function book(date, time) {
      await bookButtons.first().click();
      const form = page.getByRole('dialog', { name: 'Book a job' });
      assert.equal(await form.getByLabel('Date', { exact: true }).inputValue(), date);
      assert.equal(await form.getByLabel('Time', { exact: true }).inputValue(), time);
      assert.equal(await form.getByLabel('Date', { exact: true }).evaluate(input => input.readOnly), true);
      await form.getByLabel('Customer name', { exact: true }).fill('Calendar Customer');
      await form.getByLabel('Address', { exact: true }).fill('123 Test Avenue');
      await form.getByLabel('Service', { exact: true }).fill('Driveway');
      await form.getByLabel('Service price', { exact: true }).fill('150');
      await form.getByRole('button', { name: 'Book job', exact: true }).click();
      return form;
    }
    const stale = await book(tomorrow, '09:00');
    await stale.getByRole('alert').waitFor();
    await stale.getByRole('button', { name: 'Close', exact: true }).click();
    const saved = await book(followingDay, '13:00');
    await saved.waitFor({ state: 'detached' });
    await page.getByText('Calendar Customer', { exact: true }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const saturday = shift(today, (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7 + 7);
    openings.push({ id: 'weekend', date: saturday, startTime: '11:30', endTime: '18:30', status: 'open', weekendDefault: true });
    role = 'owner'; await page.reload();
    if (viewport.width < 1024) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    const targetDay = page.getByRole('button', { name: `Add opening on ${saturday}`, exact: true });
    await page.getByRole('button', { name: `Add opening on ${today}`, exact: true }).waitFor();
    for (let week = 0; week < 3 && !await targetDay.isVisible(); week++) {
      await page.getByRole('button', { name: 'Next week', exact: true }).click();
    }
    await page.getByRole('button', { name: /11:30 AM.*6:30 PM.*Weekend opening/ }).click();
    assert.equal(await existing.getByLabel('Date', { exact: true }).evaluate(input => input.readOnly), true);
    await existing.getByLabel('End time', { exact: true }).fill('16:30');
    await existing.getByRole('button', { name: 'Save changes', exact: true }).click();
    await existing.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: /11:30 AM.*4:30 PM.*Weekend opening/ }).click();
    await existing.getByRole('button', { name: 'Remove opening', exact: true }).click();
    await existing.getByText(/Other weekends and existing jobs/).waitFor();
    await existing.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await existing.waitFor({ state: 'detached' });
    assert.equal(openings.some(item => item.id === 'weekend'), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Manual openings ${viewport.width}px: publish, edit, remove, next slot, safe areas, stale slot, and booking passed`);
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
