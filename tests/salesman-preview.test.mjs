import test from 'node:test';
import assert from 'node:assert/strict';
import { createSalesmanPreview, mergePreviewMapHistory, removePreviewSolicitation, savePreviewSalesBooking, savePreviewSalesLead, savePreviewSolicitation } from '../src/lib/salesmanPreview.ts';

test('salesman preview contains only practice jobs and accurate 20% examples', () => {
  const data = createSalesmanPreview('2026-10-03');
  assert.equal(data.jobs[0].date, '2026-10-04');
  assert.ok(data.jobs.every(job => job.source === 'mock' && job.id.startsWith('preview-')));
  assert.equal(data.commissions[0].amount, 90);
  assert.deepEqual(data.commissions.map(item => item.status), ['estimated', 'pending', 'approved', 'paid']);
  assert.equal(data.mapJobs.find(job => job.id === 'preview-history-job').price, undefined);
  assert.equal(data.statements[0].payments[0].amount, 35);
});

test('practice booking, editing and lead conversion update memory without duplicates', () => {
  const original = createSalesmanPreview('2026-10-03');
  const input = { requestId: 'practice-request', name: 'Practice New Customer', phone: '', email: '',
    address: 'Sample new property', serviceType: 'Windows', date: '2026-10-05', time: '15:00',
    price: 450, employeeInstructions: '', leadId: original.leads[0].id };
  const saved = savePreviewSalesBooking(original, input);
  assert.equal(original.jobs.length, 4);
  assert.equal(original.leads[0].status, 'new');
  assert.equal(saved.jobs.length, 5);
  assert.equal(saved.customers[0].name, input.name);
  assert.equal(saved.leads[0].status, 'won');
  assert.equal(saved.commissions[0].amount, 90);
  const retried = savePreviewSalesBooking(saved, input);
  assert.equal(retried.jobs.length, 5);
  assert.equal(retried.commissions.length, 5);
  const edited = savePreviewSalesBooking(retried, { ...input, price: 500 }, retried.jobs[0]);
  assert.equal(edited.commissions[0].amount, 100);
  assert.equal(edited.mapJobs[0].price, 500);
  assert.equal(createSalesmanPreview('2026-10-03').jobs.length, 4);
});

test('practice map follow-ups and edits stay within the sample workspace', () => {
  const original = createSalesmanPreview('2026-10-03');
  const input = { address: 'Practice map property', latitude: 29.7174, longitude: -95.4307,
    solicitedDate: '2026-10-03', outcome: 'follow up', followUpDate: '2026-10-05', notes: 'Call first' };
  let data = savePreviewSolicitation(original, input, 'preview-test-solicitation');
  assert.equal(data.leads.length, 2);
  data = savePreviewSolicitation(data, { ...input, followUpDate: '2026-10-06' }, 'preview-test-solicitation');
  assert.equal(data.leads.length, 2);
  assert.equal(data.leads[1].followUpDate, '2026-10-06');
  data = savePreviewSalesLead(data, { ...data.leads[0], notes: 'Practice edit' });
  assert.equal(data.leads[0].notes, 'Practice edit');
  assert.notEqual(original.leads[0].notes, 'Practice edit');
  data = removePreviewSolicitation(data, 'preview-test-solicitation');
  assert.equal(data.solicitations.length, 0);
  assert.equal(data.leads.length, 1);
});

test('full map history remains separate from practice earnings, jobs and customer editing', () => {
  const original = createSalesmanPreview('2026-10-03');
  const history = {
    mapJobs: Array.from({ length: 150 }, (_, index) => ({ id: `real-job-${index}`, customerId: 'real-customer',
      date: index % 2 ? '2020-01-01' : '2099-01-01', time: '09:00', address: '123 Example Avenue',
      serviceType: 'Windows', status: index % 2 ? 'completed' : 'scheduled', latitude: 29.7174, longitude: -95.4307 })),
    mapCustomers: [{ id: 'real-customer', name: 'Real History Customer', address: '123 Example Avenue' }],
  };
  let data = mergePreviewMapHistory(original, history);
  assert.equal(data.mapJobs.length, 154);
  assert.equal(data.mapJobs.some(job => job.id === 'preview-history-job'), false);
  assert.equal(data.mapCustomers.length, 5);
  for (const field of ['jobs', 'customers', 'commissions', 'leads', 'solicitations', 'notifications', 'statements']) assert.equal(data[field], original[field]);
  const booking = { requestId: 'practice-map-booking', name: 'Practice at real property', phone: '', email: '',
    address: history.mapJobs[0].address, serviceType: 'Driveway', date: '2099-10-05', time: '09:00',
    price: 450, employeeInstructions: '', latitude: 29.7174, longitude: -95.4307 };
  data = savePreviewSalesBooking(data, booking);
  data = mergePreviewMapHistory(data, { ...history, syncError: 'Sheet unavailable' });
  assert.equal(data.mapJobs.length, 155);
  assert.equal(data.jobs.length, 5);
  assert.equal(data.commissions[0].amount, 90);
  assert.equal(data.syncError, 'Sheet unavailable');
  data = mergePreviewMapHistory(data, { mapJobs: [], mapCustomers: [] });
  assert.equal(data.mapJobs.length, 5);
  assert.equal(data.mapCustomers.length, 5);
  assert.equal(data.syncError, undefined);
  assert.equal(history.mapJobs.length, 150);
});
