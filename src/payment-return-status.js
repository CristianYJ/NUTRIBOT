export function confirmedPaymentPlan(status, usage, target) {
  if (!['nutripro', 'nutripro_plus'].includes(target) || usage?.plan?.code !== target) return false;
  return status?.state === 'active' && status.plan === target ||
    target === 'nutripro_plus' && status?.upgrade?.state === 'active';
}
