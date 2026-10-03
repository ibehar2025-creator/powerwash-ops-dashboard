begin;
do $$
declare person uuid:=gen_random_uuid(); worker uuid:=gen_random_uuid(); customer text:='test-sales-'||gen_random_uuid(); job text:='test-sales-'||gen_random_uuid(); credit uuid; payroll uuid; n numeric; state text;
begin
  insert into user_accounts(id,google_sub,email,name,age,role) values(person,'test-'||person,person||'@example.invalid','Temporary test salesman',18,'salesman');
  insert into user_accounts(id,google_sub,email,name,age,role) values(worker,'test-'||worker,worker||'@example.invalid','Temporary test worker',18,'employee');
  insert into customers(id,name) values(customer,'Temporary test customer');
  insert into jobs(id,customer_id,date,status,price,payment_status) values(job,customer,current_date,'scheduled',450,'unpaid');
  if exists(select 1 from sales_credits where job_id=job) then raise exception 'Existing jobs must not receive automatic sales credit'; end if;
  insert into sales_credits(job_id,salesman_id) values(job,person) returning id into credit;
  perform refresh_sales_credit(job);
  select amount,status into n,state from sales_credits where id=credit;
  if n<>90 or state<>'estimated' then raise exception '450 * 20%% failed: % %',n,state; end if;
  update jobs set price=500 where id=job;
  select amount into n from sales_credits where id=credit;
  if n<>100 then raise exception 'Corrected estimate failed'; end if;
  update jobs set status='completed' where id=job;
  select status into state from sales_credits where id=credit;
  if state<>'pending' then raise exception 'Automatic review failed'; end if;
  update sales_credits set status='approved' where id=credit;
  update jobs set price=450 where id=job;
  perform refresh_sales_credit(job);
  select amount into n from sales_credits where id=credit;
  if n<>100 then raise exception 'Approved amount did not remain frozen'; end if;
  update sales_credits set status='estimated' where id=credit;
  perform refresh_sales_credit(job);
  select amount,status into n,state from sales_credits where id=credit;
  if n<>90 or state<>'pending' then raise exception 'Explicit correction failed'; end if;
  update jobs set status='canceled' where id=job;
  select amount,status into n,state from sales_credits where id=credit;
  if n<>0 or state<>'canceled' then raise exception 'Canceled commission failed'; end if;
  update jobs set status='scheduled',price=450 where id=job;
  insert into job_assignments(job_id,employee_id,original_job_price,base_commission_pct,upsell_commission_pct,contract_bonus_pct,tip_share_pct)
    values(job,worker,300,0.22,0.30,0.10,1);
  insert into earning_submissions(job_id,employee_id,upsell_amount,tip_amount,gas_cost,applied_upsell_amount,status)
    values(job,worker,100,50,20,0,'pending');
  select original_job_price into n from job_assignments where job_id=job;
  if n<>450 then raise exception 'Worker retained a stale assignment price'; end if;
  update earning_submissions set applied_upsell_amount=100 where job_id=job;
  update jobs set price=550,status='completed' where id=job;
  update earning_submissions set status='approved' where job_id=job;
  select original_job_price into n from job_assignments where job_id=job;
  if n<>450 then raise exception 'Worker service basis includes upsell'; end if;
  select amount into n from sales_credits where id=credit;
  if n<>90 then raise exception 'Worker upsell, tip, gas excluded incorrectly'; end if;
  perform refresh_sales_credit(job);perform refresh_sales_credit(job);
  if (select count(*) from sales_credits where job_id=job)<>1 then raise exception 'Duplicate credit'; end if;
  update sales_credits set status='approved' where id=credit;
  insert into payroll_runs(period_start,period_end,payday) values('2099-01-05','2099-01-11','2099-01-13') returning id into payroll;
  insert into payroll_run_lines(payroll_run_id,employee_id,job_id,source_key,line_type,description,customer_name,work_date,amount,sales_credit_id)
    values(payroll,worker,job,job||':commission','commission','Worker commission','Test',current_date,99,null),
    (payroll,person,job,job||':sales_commission','sales_commission','Sales commission','Test',current_date,90,credit);
  if (select count(*) from payroll_run_lines where job_id=job)<>2 then raise exception 'Worker and salesman replaced each other'; end if;
  begin
    insert into payroll_run_lines(payroll_run_id,employee_id,job_id,source_key,line_type,description,customer_name,work_date,amount,sales_credit_id)
      values(payroll,person,job,job||':sales_commission','sales_commission','Duplicate','Test',current_date,90,credit);
    raise exception 'Duplicate payroll accepted';
  exception when unique_violation then null;
  end;
  update sales_credits set status='paid',paid_at=now() where id=credit;
  update jobs set price=650 where id=job;
  select amount into n from sales_credits where id=credit;
  if n<>90 then raise exception 'Paid commission changed'; end if;
end $$;
rollback;
select 'Commission lifecycle passed; all test records rolled back' as result;
