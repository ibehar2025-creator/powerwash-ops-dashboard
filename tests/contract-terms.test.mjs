import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/components/EmployeeContractFlow.tsx', import.meta.url), 'utf8');
const builder = source.slice(source.indexOf('const recurringTerms ='), source.indexOf('export function EmployeeContractFlow'));
const context = vm.createContext({ currency: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) });
vm.runInContext(ts.transpile(builder), context);

test('new recurring agreements include every visible requested term', () => {
  for (const frequency of ['Every 6 months', 'Monthly', 'Yearly']) {
    const text = context.agreementText({ customerName: 'Test Customer', serviceAddress: 'Test Address', serviceDescription: 'Windows', frequency, price: '175', notes: '' });
    assert.ok(text.includes(`Service frequency: ${frequency}`));
    assert.ok(text.includes('Price per service: $175.00'));
    for (const clause of ["at least 24 hours' notice", 'rain, storms, freezing temperatures, or unsafe working conditions', 'automated text messages and emails', 'appointment reminders, schedule updates, invoice notifications, and plan renewal reminders', "Company's CRM system", '2 scheduled cleaning(s) over a 12-month period', 'does not automatically renew', 'agree in writing to continue on new terms', 'By signing electronically, Customer confirms']) assert.ok(text.includes(clause), clause);
    assert.doesNotMatch(text, /Semi annual Window/);
  }
});

test('signing submits the displayed agreement snapshot', () => {
  assert.match(source, /agreementText: agreement/);
  assert.match(source, /\{recurringTerms\}<\/div>/);
});
