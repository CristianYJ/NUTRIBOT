import './billing.css';
import { downloadCsv } from './csv-export.js';

const planName = code => code === 'nutripro' ? 'NutriPro' : code === 'nutripro_plus' ? 'NutriMax' : code;
const amount = cents => new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(cents / 100);
const date = value => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const headers = ['Fecha', 'Concepto', 'Plan', 'Importe USD', 'Estado', 'ID de transacción'];
const row = item => [date(item.paidAt), item.kind === 'upgrade' ? 'Ajuste de plan' : 'Mensualidad', planName(item.plan), (item.amountCents / 100).toFixed(2),
  item.productive ? 'Confirmada' : 'Prueba confirmada', item.transactionId];

export default function BillingTransactions({ items = [] }) {
  return <div className="billing-transactions">
    <div className="billing-transactions-heading"><h3>Transacciones</h3>
      <button type="button" className="btn secondary" disabled={!items.length}
        onClick={() => downloadCsv('nutribot-transacciones.csv', headers, items.map(row))}>Exportar</button></div>
    {items.length ? <div className="billing-transactions-scroll"><table>
      <thead><tr><th>Fecha</th><th>Concepto</th><th>Plan</th><th>Importe</th><th>Estado</th><th>ID de transacción</th><th>Exportar</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.transactionId}>
        <td>{date(item.paidAt)}</td><td>{item.kind === 'upgrade' ? 'Ajuste de plan' : 'Mensualidad'}</td><td>{planName(item.plan)}</td><td>{amount(item.amountCents)}</td>
        <td>{item.productive ? 'Confirmada' : 'Prueba confirmada'}</td>
        <td><code>{item.transactionId}</code></td>
        <td><button type="button" className="billing-export-row" onClick={() => downloadCsv(`nutribot-transaccion-${item.transactionId}.csv`, headers, [row(item)])}>CSV</button></td>
      </tr>)}</tbody>
    </table></div> : <p>No hay transacciones registradas.</p>}
    {items.length === 200 && <p className="billing-note">Se muestran las 200 transacciones más recientes.</p>}
  </div>;
}
