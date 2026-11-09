import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const { webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = await readFile('dist/index.html', 'utf8');
const stylesheet = html.match(/href="([^"]+\.css)"/)?.[1];
assert.ok(stylesheet);
const css = await readFile(resolve('dist', stylesheet.replace(/^\//, '')), 'utf8');
await mkdir('artifacts', { recursive: true });
const browser = await webkit.launch();
try {
  for (const width of [320, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 640 }, isMobile: true, hasTouch: true, locale: 'en-US' });
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1">
      <div class="dark"><div class="sales-modal"><form class="sales-dialog">
        <fieldset class="settings-grid">
          <label class="block min-w-0">Service<input type="text" value="Windows"></label>
          <label class="block min-w-0">Date<input type="date" value="2026-11-08"></label>
          <label class="block min-w-0">Time<input type="time" value="09:00"></label>
        </fieldset>
      </form></div></div>`);
    await page.addStyleTag({ content: css });
    const fields = await page.locator('input').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      return { left: rect.left, right: rect.right, height: rect.height, appearance: css.appearance, align: css.textAlign, font: parseFloat(css.fontSize) };
    }));
    const [service, date, time] = fields;
    for (const field of [date, time]) {
      assert.ok(Math.abs(field.left - service.left) <= 1 && Math.abs(field.right - service.right) <= 1);
      assert.equal(field.appearance, 'none');
      assert.equal(field.align, 'left');
      assert.ok(field.font >= 16);
    }
    assert.ok(Math.abs(date.height - time.height) <= 1);
    const dialog = page.locator('.sales-dialog');
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth));
    await page.getByLabel('Time').fill('15:15');
    assert.equal(await page.getByLabel('Time').inputValue(), '15:15');
    await dialog.screenshot({ path: `artifacts/booking-schedule-webkit-${width}.png` });
    await page.close();
    console.log(`WebKit ${width}px: date and time aligned, contained, and editable`);
  }
} finally { await browser.close(); }
