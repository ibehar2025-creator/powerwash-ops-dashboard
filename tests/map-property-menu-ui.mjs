import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = await readFile('dist/index.html', 'utf8');
const css = (await readFile(resolve('dist', html.match(/href="([^"]+\.css)"/)[1].slice(1)), 'utf8')).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px');
const bundle = await build({
  stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BusinessMap} from './src/components/BusinessMap';
  function Test(){const [booking,setBooking]=useState(null);return <><BusinessMap customers={[]} jobs={[]} solicitations={[]} employeeView={new URLSearchParams(location.search).has('employee')} onSaveJobCoordinates={async()=>{}} onCreateSolicitation={async item=>{window.savedSolicitation=item;if(window.saveFails)throw new Error('Please retry saving');}} onUpdateSolicitation={async()=>{}} onDeleteSolicitation={async()=>{}} onAddJob={property=>{window.bookingCalls++;window.bookedProperty=property;setBooking(property);}}/>{booking&&<div role="dialog" aria-label="Book a job"><label>Booking address<input value={booking.address} readOnly/></label><button onClick={()=>setBooking(null)}>Close booking</button></div>}</>};createRoot(document.getElementById('root')).render(<Test/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  jsx: 'automatic', bundle: true, write: false,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': '"test-only"' },
  plugins: [{ name: 'mock-map', setup(build) {
    build.onResolve({ filter: /^@vis.gl\/react-google-maps$/ }, () => ({ path: 'maps', namespace: 'mock' }));
    build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ loader: 'tsx', resolveDir: process.cwd(), contents: `import React from 'react';
      const geocoder={Geocoder:class {async geocode(query){window.geocodeCalls++;if(window.deferGeocode)return new Promise(resolve=>{window.resolveGeocode=resolve;});if(window.geocodeFails)throw new Error('Not found');const formatted_address=query.address||'3810 Case St, Houston, TX';return {results:[{formatted_address,geometry:{location:{lat:()=>29.7174,lng:()=>-95.4307}}}]};}}};
      export const useMapsLibrary=()=>geocoder;export const useMap=()=>null;export const APIProvider=({children})=><>{children}</>;export const Marker=()=>null;export const InfoWindow=({children})=><>{children}</>;
      export const Map=({children,onClick})=><div style={{paddingTop:120}}><button onClick={()=>onClick?.({detail:{latLng:{lat:29.7174,lng:-95.4307}}})}>Click house</button>{children}</div>;` }));
  } }],
});
const server = createServer((req, res) => {
  if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.google = { maps: { SymbolPath: { CIRCLE: 0 } } };
      window.bookingCalls = 0; window.geocodeCalls = 0;
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: 'Click house' }).click();
    const menu = page.getByRole('dialog', { name: 'Record at this property' });
    await menu.waitFor();
    await page.getByRole('button', { name: 'Add job', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('input[placeholder="Click map or enter address"]').value === '3810 Case St, Houston, TX');
    assert.equal(await page.getByRole('dialog').count(), 1);
    assert.equal(await page.evaluate(() => window.bookingCalls), 0);
    const bounds = await menu.boundingBox();
    assert.ok(bounds.y >= 59 && bounds.y + bounds.height <= viewport.height - 34 + 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `artifacts/property-menu-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Add job', exact: true }).click();
    await page.getByRole('dialog', { name: 'Book a job' }).waitFor();
    assert.equal(await menu.count(), 0);
    assert.equal(await page.getByLabel('Booking address').inputValue(), '3810 Case St, Houston, TX');
    assert.deepEqual(await page.evaluate(() => window.bookedProperty), { address: '3810 Case St, Houston, TX', latitude: 29.7174, longitude: -95.4307 });
    await page.getByRole('button', { name: 'Close booking' }).click();
    await page.getByRole('button', { name: 'Click house' }).click();
    await page.getByLabel('Result', { exact: true }).selectOption('follow up');
    await page.getByLabel('Follow-up date').fill('2026-10-15');
    await page.getByLabel('Notes', { exact: true }).fill('Call homeowner');
    await page.evaluate(() => { window.saveFails = true; });
    await page.getByRole('button', { name: 'Save solicitation', exact: true }).click();
    await page.getByText('Please retry saving', { exact: true }).waitFor();
    assert.equal(await menu.count(), 1);
    await page.evaluate(() => { window.saveFails = false; });
    await page.getByRole('button', { name: 'Save solicitation', exact: true }).click();
    await menu.waitFor({ state: 'detached' });
    const saved = await page.evaluate(() => window.savedSolicitation);
    assert.equal(saved.address, '3810 Case St, Houston, TX');
    assert.equal(saved.followUpDate, '2026-10-15');
    assert.equal(saved.notes, 'Call homeowner');
    assert.equal(await page.evaluate(() => window.bookingCalls), 1);
    await page.getByRole('button', { name: 'Click house' }).click();
    await page.getByLabel('Address', { exact: true }).fill('123 Edited Street');
    await page.getByRole('button', { name: 'Add job', exact: true }).click();
    assert.equal(await page.getByLabel('Booking address').inputValue(), '123 Edited Street, Houston, TX');
    await page.getByRole('button', { name: 'Close booking' }).click();
    await page.evaluate(() => { window.geocodeFails = true; });
    await page.getByRole('button', { name: 'Click house' }).click();
    await page.getByText('Pin selected. Add any identifying address details before saving.', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Address', { exact: true }).inputValue(), '29.717400, -95.430700');
    await page.getByRole('button', { name: 'Close property menu' }).press('Escape');
    assert.equal(await menu.count(), 0);
    await page.evaluate(() => { window.geocodeFails = false; window.deferGeocode = true; });
    await page.getByRole('button', { name: 'Click house' }).click();
    assert.equal(await page.getByRole('button', { name: 'Add job', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Close property menu' }).click();
    await page.evaluate(() => window.resolveGeocode({ results: [] }));
    assert.equal(await menu.count(), 0);
    await page.goto(`http://127.0.0.1:${server.address().port}/?employee`);
    await page.getByRole('button', { name: 'Click house' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`Property menu ${viewport.width}: passed (single menu, booking prefill, follow-up/save retry, edited address, geocoder failure, dismissal, employee permissions)`);
    await context.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
