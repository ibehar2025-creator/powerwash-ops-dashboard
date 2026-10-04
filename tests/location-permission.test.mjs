import test from 'node:test';
import assert from 'node:assert/strict';
import { locationPermissionHelp } from '../src/lib/locationPermissionHelp.ts';

test('location help distinguishes installed iPhone, Safari, Chrome and Android', () => {
  const iphone = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
  assert.equal(locationPermissionHelp(iphone, true).device, 'iPhone / iPad app');
  assert.ok(locationPermissionHelp(iphone, true).steps.some(step => step.includes('Safari Websites')));
  assert.equal(locationPermissionHelp(iphone, false).device, 'Safari on iPhone / iPad');
  assert.ok(locationPermissionHelp(iphone.replace('Version/18.0', 'CriOS/140.0'), false).steps.some(step => step.includes('Select Chrome')));
  assert.equal(locationPermissionHelp('Macintosh Safari', false, 5).device, 'Safari on iPhone / iPad');
  const android = locationPermissionHelp('Mozilla/5.0 Android Chrome/140.0', true);
  assert.equal(android.device, 'Android');
  assert.ok(android.steps.some(step => step.includes('Site settings > Location')));
  assert.equal(locationPermissionHelp('Macintosh Safari', false).device, 'Safari on Mac');
  assert.equal(locationPermissionHelp('Windows Chrome', false).device, 'Desktop browser');
});
