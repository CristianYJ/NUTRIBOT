const styles = { basico: "basic", nutripro: "pro", nutripro_plus: "plus", staff: "staff", goat: "goat" };

export default function PlanBadge({ plan }) {
  const tone = styles[plan?.code] || "unknown";
  const label = plan?.name || "Sin asignar";
  return <span className={`plan-badge plan-badge-${tone}`} aria-label={['staff','goat'].includes(plan?.code) ? label : `Plan ${label}`}>
    <span className="plan-badge-dot" aria-hidden="true" />
    {['staff','goat'].includes(plan?.code) ? label : `Plan ${label}`}
  </span>;
}
