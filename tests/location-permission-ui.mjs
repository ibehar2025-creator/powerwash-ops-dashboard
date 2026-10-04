import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = await readFile('dist/index.html', 'utf8');
const css = (await readFile(resolve('dist', html.match(/href="([^"]+\.css)"/)[1].slice(1)), 'utf8')).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px');
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {MapLocationControl} from './src/components/MapLocationControl';createRoot(document.getElementById('root')).render(<div style={{height:'80vh',position:'relative'}}><MapLocationControl hasLocation={false} onLocate={position=>{window.receivedPosition=position.coords.latitude;}}/></div>);`, resolveDir: process.cwd(), loader: 'tsx' }, jsx: 'automatic', bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' } });
const server = createServer((req, res) => {
  if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const device of [
    { name: 'iphone', viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile Safari/604.1', standalone: true, label: 'iPhone / iPad app' },
    { name: 'android', viewport: { width: 360, height: 800 }, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile Safari/537.36', standalone: false, label: 'Android' },
    { name: 'desktop', viewport: { width: 1440, height: 1000 }, userAgent: 'Mozilla/5.0 Windows Chrome/140.0 Safari/537.36', standalone: false, label: 'Desktop browser' },
  ]) {
    const context = await browser.newContext({ viewport: device.viewport, userAgent: device.userAgent });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(standalone => {
      Object.defineProperty(navigator, 'standalone', { value: standalone });
      window.geoCalls = 0; window.locationOutcome = 'denied';
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
        getCurrentPosition(success, failure, options) {
          window.geoCalls++; window.geoOptions = options;
          if (window.locationOutcome === 'granted') success({ coords: { latitude: 29.7174, longitude: -95.4307, heading: null } });
          else failure({ code: window.locationOutcome === 'denied' ? 1 : 3 });
        },
        watchPosition() { throw new Error('Continuous tracking must not start'); },
      } });
    }, device.standalone);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Show my location', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.geoCalls), 0);
    await page.getByRole('button', { name: 'Show my location', exact: true }).click();
    await page.getByText('Location access is blocked.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Location settings', exact: true }).click();
    await page.getByRole('dialog', { name: 'Allow location access' }).waitFor();
    await page.getByText(device.label, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.geoCalls), 1);
    const bounds = await page.getByRole('dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= device.viewport.width + 1);
    assert.ok(bounds.y >= 59 && bounds.y + bounds.height <= device.viewport.height);
    assert.equal(await page.getByRole('link', { name: 'Official instructions' }).getAttribute('target'), '_blank');
    await page.getByRole('button', { name: 'Close location settings' }).press('Shift+Tab');
    assert.equal(await page.getByRole('button', { name: 'Try again' }).evaluate(node => document.activeElement === node), true);
    await page.getByRole('button', { name: 'Try again' }).press('Tab');
    await page.getByRole('button', { name: 'Close location settings' }).press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', { name: 'Location settings', exact: true }).click();
    await page.screenshot({ path: `artifacts/location-settings-${device.name}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.evaluate(() => { window.locationOutcome = 'granted'; });
    await page.getByRole('button', { name: 'Try again' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.getByRole('status').count(), 0);
    assert.equal(await page.evaluate(() => window.receivedPosition), 29.7174);
    assert.equal(await page.evaluate(() => window.geoCalls), 2);
    assert.equal(await page.evaluate(() => window.geoOptions.timeout), 15000);
    await page.evaluate(() => { window.locationOutcome = 'timeout'; });
    await page.getByRole('button', { name: 'Show my location', exact: true }).click();
    await page.getByText('Location timed out. Please try again.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Location settings', exact: true }).count(), 0);
    await page.evaluate(() => { Object.defineProperty(navigator, 'geolocation', { value: undefined }); });
    await page.getByRole('button', { name: 'Show my location', exact: true }).click();
    await page.getByText('Location is not supported by this browser.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`Location permission UI: ${device.name} passed (denial, settings, safe area, keyboard, one-time retry, timeout, unsupported)`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
