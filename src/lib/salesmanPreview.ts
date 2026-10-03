import type { Customer, Job, Lead, Solicitation } from '../types/business';
import type { SalesBooking, SalesCredit, SalesWorkspace } from './sales';

const salesmanId = 'preview-salesman';
const salesmanName = 'Sample Salesman';

function dateOffset(today: string, days: number) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mapJob(job: Job) {
  const { id, customerId, address, serviceType, date, time, status, latitude, longitude, price } = job;
  return { id, customerId, address, serviceType, date, time, status, latitude, longitude, price };
}

function commission(job: Job, customerName: string, status: SalesCredit['status'] = 'estimated'): SalesCredit {
  return {
    id: `preview-credit-${job.id}`, jobId: job.id, salesmanId, salesmanName, customerName,
    jobDate: job.date, servicePrice: job.price, currentServicePrice: job.price,
    rate: 0.2, amount: Math.round(job.price * 20) / 100, status, ownerNote: '',
    workerPending: false, payrollLinked: status === 'paid',
    ...(status === 'paid' ? { paidAt: `${job.date}T12:00:00Z` } : {}),
  };
}

export function createSalesmanPreview(today: string): SalesWorkspace {
  const samples = [
    { name: 'Sample Customer', days: 1, price: 450, status: 'estimated' },
    { name: 'Sample Completed Customer', days: -1, price: 300, status: 'pending' },
    { name: 'Sample Approved Customer', days: -2, price: 250, status: 'approved' },
    { name: 'Sample Paid Customer', days: -7, price: 175, status: 'paid' },
  ] as const;
  const customers: Customer[] = samples.map((sample, index) => ({
    id: `preview-sales-customer-${index}`, name: sample.name, phone: '', email: '',
    address: `Sample property ${index + 1}`, notes: '', insights: [],
  }));
  const jobs: Job[] = samples.map((sample, index) => ({
    id: `preview-sales-job-${index}`, customerId: customers[index].id,
    date: dateOffset(today, sample.days), time: '09:00', address: customers[index].address,
    serviceType: 'Driveway cleaning', status: index === 0 ? 'scheduled' : 'completed',
    price: sample.price, amountPaid: index === 0 ? 0 : sample.price, tipAmount: 0,
    paymentStatus: index === 0 ? 'unpaid' : 'paid', crewIds: [], notes: '',
    employeeInstructions: 'Practice job only', source: 'mock',
    latitude: 29.7174 + index * 0.0005, longitude: -95.4307 + index * 0.0005,
  }));
  const paidJob = jobs[3];
  return {
    jobs, customers,
    mapJobs: [...jobs.map(mapJob), {
      id: 'preview-history-job', customerId: 'preview-history-customer', address: 'Sample past property',
      serviceType: 'Windows', date: dateOffset(today, -30), time: '10:00', status: 'completed',
      latitude: 29.7195, longitude: -95.433,
    }],
    mapCustomers: [...customers.map(({ id, name, address }) => ({ id, name, address })),
      { id: 'preview-history-customer', name: 'Sample Property History', address: 'Sample past property' }],
    commissions: jobs.map((job, index) => commission(job, customers[index].name, samples[index].status)),
    leads: [{ id: 'preview-sales-lead', name: 'Sample Follow-up', contact: '', address: 'Sample follow-up property',
      source: 'Map solicitation', status: 'new', estimatedValue: 0, followUpDate: today, notes: 'Practice follow-up only' }],
    solicitations: [],
    notifications: [{ id: 'preview-sales-notification', title: 'Sample commission approved',
      detail: 'Sample Approved Customer - $50', created_at: `${today}T12:00:00Z` }],
    statements: [{
      id: 'preview-sales-statement', periodStart: paidJob.date, periodEnd: dateOffset(paidJob.date, 6),
      payday: today, status: 'paid', createdAt: `${today}T12:00:00Z`,
      lines: [{ id: 'preview-sales-line', employeeId: salesmanId, employeeName: salesmanName,
        jobId: paidJob.id, lineType: 'sales_commission', description: 'Sample sales commission',
        customerName: customers[3].name, workDate: paidJob.date, amount: 35 }],
      adjustments: [], payments: [{ id: 'preview-sales-payment', employeeId: salesmanId,
        employeeName: salesmanName, amount: 35, paymentMethod: 'bank', reference: '', note: '', paidAt: `${today}T12:00:00Z` }],
      grossEarnings: 35, totalAdditions: 0, totalDeductions: 0, netPay: 35,
    }],
  };
}

export function savePreviewSalesBooking(data: SalesWorkspace, input: SalesBooking, existing?: Job | null): SalesWorkspace {
  const id = existing?.id ?? `preview-sales-job-${input.requestId ?? crypto.randomUUID()}`;
  const customerId = existing?.customerId ?? `preview-sales-customer-${id}`;
  const customer: Customer = { id: customerId, name: input.name, phone: input.phone, email: input.email,
    address: input.address, notes: '', insights: [] };
  const job: Job = { id, customerId, date: input.date, time: input.time, address: input.address,
    serviceType: input.serviceType, price: input.price, status: 'scheduled', amountPaid: 0, tipAmount: 0,
    paymentStatus: 'unpaid', crewIds: [], notes: '', employeeInstructions: input.employeeInstructions,
    source: 'mock', latitude: input.latitude, longitude: input.longitude };
  return {
    ...data,
    jobs: [job, ...data.jobs.filter(item => item.id !== id)],
    customers: [customer, ...data.customers.filter(item => item.id !== customerId)],
    mapJobs: [mapJob(job), ...data.mapJobs.filter(item => item.id !== id)],
    mapCustomers: [{ id: customer.id, name: customer.name, address: customer.address }, ...data.mapCustomers.filter(item => item.id !== customerId)],
    commissions: [commission(job, customer.name), ...data.commissions.filter(item => item.jobId !== id)],
    leads: data.leads.map(item => item.id === input.leadId ? { ...item, status: 'won' } : item),
  };
}

export function savePreviewSalesLead(data: SalesWorkspace, lead: Lead): SalesWorkspace {
  return { ...data, leads: data.leads.map(item => item.id === lead.id ? lead : item) };
}

export function savePreviewSolicitation(data: SalesWorkspace, input: Omit<Solicitation, 'id'>, id = `preview-solicitation-${crypto.randomUUID()}`): SalesWorkspace {
  const leadId = `preview-lead-${id}`;
  const leads = data.leads.filter(item => item.id !== leadId);
  if (input.outcome === 'follow up') leads.push({ id: leadId, name: 'Map follow-up', contact: '',
    address: input.address, source: 'Map solicitation', status: 'new', estimatedValue: 0,
    followUpDate: input.followUpDate, notes: input.notes });
  return { ...data, solicitations: [{ ...input, id }, ...data.solicitations.filter(item => item.id !== id)], leads };
}

export function removePreviewSolicitation(data: SalesWorkspace, id: string): SalesWorkspace {
  return { ...data, solicitations: data.solicitations.filter(item => item.id !== id),
    leads: data.leads.filter(item => item.id !== `preview-lead-${id}`) };
}
