import type { Customer, Job, Lead, PayrollRun, Solicitation } from '../types/business';
export type MapJob = Pick<Job,'id'|'date'|'time'|'customerId'|'address'|'serviceType'|'status'|'latitude'|'longitude'> & {price?:number};
export type MapCustomer = Pick<Customer,'id'|'name'|'address'>;
export interface SalesMapHistory {mapJobs:MapJob[];mapCustomers:MapCustomer[];syncError?:string}
export interface SalesCredit {
  id:string; jobId:string; salesmanId:string; salesmanName:string; customerName:string; jobDate:string;
  servicePrice:number; currentServicePrice:number; rate:number; amount:number;
  status:'estimated'|'pending'|'approved'|'rejected'|'paid'|'canceled'; ownerNote:string;
  workerPending:boolean; payrollLinked:boolean; reviewedAt?:string; paidAt?:string;
}
export interface SalesNotification {id:string;title:string;detail:string;job_id?:string;created_at:string}
export interface SalesmanProfile {id:string;name:string;email:string;active:boolean;pictureUrl:string;commissionPct:number}
export interface SalesWorkspace {
  jobs:Job[]; mapJobs:MapJob[]; customers:Customer[]; mapCustomers:MapCustomer[];
  commissions:SalesCredit[];leads:Lead[];solicitations:Solicitation[];notifications:SalesNotification[];statements:PayrollRun[];syncError?:string;
}
export interface OwnerSales {salesmen:SalesmanProfile[];commissions:SalesCredit[];notifications:SalesNotification[]}
export interface SalesBooking {
  requestId?:string;name:string;phone:string;email:string;address:string;serviceType:string;
  date:string;time:string;price:number;employeeInstructions:string;latitude?:number;longitude?:number;leadId?:string;
}
export async function salesRequest<T>(path:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.detail || data.error || 'Unable to save. Please try again.'),{status:response.status});
  return data;
}
