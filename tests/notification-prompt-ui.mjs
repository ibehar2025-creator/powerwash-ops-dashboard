import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html = await readFile('dist/index.html', 'utf8');
const css = (await readFile(resolve('dist', html.match(/href="([^"]+\.css)"/)[1].slice(1)), 'utf8')).replaceAll('env(safe-area-inset-top)', '59px').replaceAll('env(safe-area-inset-bottom)', '34px');
const bundle = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AuthContext} from './src/lib/authContext';import {ProfileMenu} from './src/components/ProfileMenu';const params=new URLSearchParams(location.search);const user={id:params.get('user')||'one',role:params.get('role')||'employee',name:'Test User',email:'test@example.invalid',phone:'',pictureUrl:'',age:18};document.documentElement.classList.add('dark');createRoot(document.getElementById('root')).render(<AuthContext.Provider value={{user,updateProfile:async()=>{},signOut:async()=>{},deleteAccount:async()=>{}}}><main style={{padding:80}}><ProfileMenu theme="dark" onTheme={()=>{}} preview={params.has('preview')}/></main></AuthContext.Provider>);`, resolveDir: process.cwd(), loader: 'tsx' }, jsx: 'automatic', bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' } });
const server = createServer((req, res) => {
  if (req.url === '/test.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
  else if (req.url === '/test.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/test.css"><div id="root"></div><script src="/test.js"></script>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [index, viewport] of [{width:390,height:844},{width:360,height:800},{width:1440,height:1000}].entries()) {
    const context = await browser.newContext({viewport});
    await context.addInitScript(() => {
      window.permissionCalls = 0; window.pushPermission = 'default'; window.hasSubscription = false;
      Object.defineProperty(window, 'Notification', {configurable:true,value:{get permission(){return window.pushPermission;},async requestPermission(){window.permissionCalls++;window.pushPermission='granted';return 'granted';}}});
      Object.defineProperty(navigator, 'serviceWorker', {configurable:true,value:{getRegistration:async()=>({pushManager:{getSubscription:async()=>window.hasSubscription?{endpoint:'https://push.example.invalid',toJSON:()=>({endpoint:'https://push.example.invalid'})}:null}}),ready:Promise.resolve({pushManager:{subscribe:async()=>{window.hasSubscription=true;return {toJSON:()=>({endpoint:'https://push.example.invalid',keys:{}})};}}})}});
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    let configured = true, saves = 0, failSave = false;
    await page.route('**/api/**',async route=>{
      if(route.request().url().endsWith('/api/push/config'))await route.fulfill({json:{enabled:configured,publicKey:'AQID',subscribed:false}});
      else {saves++;await route.fulfill({status:failSave?503:201,json:{subscribed:!failSave}});}
    });
    await page.goto(`${base}?role=${['owner','employee','salesman'][index]}`);
    const prompt = page.getByRole('dialog',{name:'Allow notifications',exact:true});
    await prompt.waitFor();assert.equal(await page.evaluate(()=>window.permissionCalls),0);
    const bounds = await prompt.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1);assert.ok(bounds.y>=59&&bounds.y+bounds.height<=viewport.height-34+1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await prompt.getByRole('button',{name:'Not now',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Open profile menu'}).evaluate(node=>document.activeElement===node),false);
    await page.screenshot({path:`artifacts/notification-prompt-${viewport.width}.png`,fullPage:true});
    await prompt.getByRole('button',{name:'Allow notifications',exact:true}).click();await prompt.waitFor({state:'detached'});
    await page.getByRole('heading',{name:'Phone notifications',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.permissionCalls),0);
    failSave=true;await page.getByRole('button',{name:'Enable notifications',exact:true}).click();await page.getByText('Unable to save notification settings. Please try again.',{exact:true}).waitFor();
    failSave=false;await page.getByRole('button',{name:'Enable notifications',exact:true}).click();await page.getByText('Enabled on this device',{exact:true}).waitFor();assert.equal(saves,2);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.reload();await page.waitForTimeout(1800);assert.equal(await prompt.count(),0);
    await page.goto(`${base}?user=two`);await prompt.waitFor();await page.keyboard.press('Escape');await prompt.waitFor({state:'detached'});await page.reload();await page.waitForTimeout(1800);assert.equal(await prompt.count(),0);
    await page.goto(`${base}?user=enabled`);await page.evaluate(()=>{window.pushPermission='granted';window.hasSubscription=true;});await page.waitForTimeout(1800);assert.equal(await prompt.count(),0);
    await page.goto(`${base}?user=denied`);await page.evaluate(()=>{window.pushPermission='denied';});await prompt.waitFor();await prompt.getByRole('button',{name:'Allow notifications',exact:true}).click();await page.getByText('Notifications are blocked.',{exact:false}).waitFor();assert.equal(await page.evaluate(()=>window.permissionCalls),0);
    await page.goto(`${base}?user=unsupported`);await page.evaluate(()=>{delete window.Notification;delete window.PushManager;});await prompt.waitFor();await prompt.getByRole('button',{name:'Allow notifications',exact:true}).click();await page.getByText('On iPhone, open Safari, tap Share',{exact:false}).waitFor();
    await page.goto(`${base}?preview=1&user=preview`);await page.waitForTimeout(1800);assert.equal(await prompt.count(),0);
    configured=false;await page.goto(`${base}?user=unconfigured`);await page.waitForTimeout(1800);assert.equal(await prompt.count(),0);
    assert.deepEqual(errors,[]);
    console.log(`Notifications ${viewport.width}: role prompt, safe areas, focus trap, settings, explicit enable, failed-save retry, per-user dismissal, enabled, denied, unsupported, preview and unconfigured passed`);
    await context.close();
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
