export async function completeJobAfterEarnings({ db, updateSheet, jobId }) {
  const jobResult = await db.query("select price from jobs where id = $1", [jobId]);
  if (!jobResult.rows[0]) throw new Error("The assigned job was not found.");

  const completedPrice = Number(jobResult.rows[0].price ?? 0);
  await updateSheet("updateJob", {
    jobId,
    status: "completed",
    paymentStatus: "paid",
    amountPaid: completedPrice,
  });
  await db.query(
    `update jobs set status = 'completed', payment_status = 'paid', amount_paid = price,
     website_overrides = website_overrides || '{"status": true}'::jsonb, updated_at = now()
     where id = $1`,
    [jobId],
  );

  return { status: "completed", paymentStatus: "paid", amountPaid: completedPrice };
}
