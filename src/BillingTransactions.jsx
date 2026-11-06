import './billing.css';
import { downloadCsv } from './csv-export.js';

const planName = code => code === 'nutripro' ? 'NutriPro' : code === 'nutripro_plus' ? 'NutriMax' : code;
const amount = cents => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(cents / 100);
const date = value => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const headers = ['Fecha', 'Concepto', 'Plan', 'Importe USD', 'Estado', 'Referencia'];
const concept = item => item.kind === 'upgrade' ? 'Ajuste de plan' : item.kind === 'subscription' ? 'Suscripción' : 'Mensualidad';
const status = item => ({ pending: 'Pendiente de confirmación', review: 'En revisión', cancelled: 'Cancelada',
  unconfirmed: 'Vencida sin confirmar', failed: 'Fallida' })[item.status] || (item.productive ? 'Confirmada' : 'Prueba confirmada');
const row = item => [date(item.paidAt), concept(item), planName(item.plan), (item.amountCents / 100).toFixed(2),
  status(item), item.transactionId || item.referenceId || ''];

export default function BillingTransactions({ items = [], admin = false, onContinue, continuingId }) {
  return <div className="billing-transactions">
    <div className="billing-transactions-heading"><h3>Transacciones</h3>
      {admin && <button type="button" className="btn secondary" disabled={!items.length}
        onClick={() => downloadCsv('nutribot-transacciones.csv', headers, items.map(row))}>Exportar</button>}</div>
    {items.length ? <div className="billing-transactions-scroll"><table>
      <thead><tr><th>Fecha</th><th>Concepto</th><th>Plan</th><th>Importe</th><th>Estado</th><th>Referencia</th><th>{admin ? 'Exportar' : 'Acción'}</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.recordId || item.transactionId}>
        <td>{date(item.paidAt)}</td><td>{concept(item)}</td><td>{planName(item.plan)}</td><td>{amount(item.amountCents)}{item.status && item.status !== 'confirmed' ? ' previsto' : ''}</td>
        <td>{status(item)}</td>
        <td><code>{item.transactionId || item.referenceId || 'Sin referencia'}</code></td>
        <td>{admin
          ? <button type="button" className="billing-export-row" onClick={() => downloadCsv(`nutribot-transaccion-${(item.recordId || item.transactionId).replace(/[^a-z0-9-]/gi, '-')}.csv`, headers, [row(item)])}>CSV</button>
          : item.status === 'pending' && onContinue
            ? <button type="button" className="billing-continue" disabled={continuingId === item.recordId} onClick={() => onContinue(item)}>{continuingId === item.recordId ? 'Abriendo…' : 'Continuar'}</button>
            : null}</td>
      </tr>)}</tbody>
    </table></div> : <p>No hay movimientos registrados.</p>}
    {items.length === 200 && <p className="billing-note">Se muestran las 200 transacciones más recientes.</p>}
  </div>;
}
