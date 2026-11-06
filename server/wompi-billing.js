import { randomUUID } from 'node:crypto';
import { AppError } from './recipes.js';
import { wompiPrices } from './wompi.js';

const amountCents = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null;
const publicState = row => row && ({ plan: row.plan_code, state: row.state,
  paidUntil: row.paid_until, lastPaidAt: row.last_paid_at, productive: row.productive,
  linkUrl: row.state === 'pending' ? row.link_url : null });
const upgradeWindowMs = 3 * 24 * 60 * 60 * 1000;
const upgradeAmount = (subscription, now = new Date()) => {
  const end = new Date(subscription.paid_until).getTime();
  const start = new Date(subscription.last_paid_at).getTime();
  const remaining = end - now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || remaining < 60 * 60 * 1000 || end <= start)
    throw new AppError('UPGRADE_UNAVAILABLE', 'El período actual está por vencer. Espera al próximo período para cambiar de plan.', 409);
  return Math.max(1, Math.min(700, Math.round(700 * remaining / (end - start))));
};
const upgradeState = row => row && ({ state: row.state, amountCents: row.amount_cents,
  paidUntil: row.paid_until, linkUrl: row.state === 'pending' ? row.link_url : null,
  linkExpiresAt: row.state === 'pending' ? row.link_expires_at : null,
  reminderAt: new Date(new Date(row.paid_until).getTime() - upgradeWindowMs).toISOString() });

export function createWompiBilling({ transaction, profileId }) {
  const transactionsFor = id => transaction(async c => (await c.query(`
    SELECT p.transaction_id,p.amount_cents,p.paid_at,s.plan_code,s.productive,'recurring' AS kind
    FROM wompi_payments p JOIN wompi_subscriptions s ON s.id=p.subscription_id
    WHERE s.profile_id=$1
    UNION ALL
    SELECT u.transaction_id,u.amount_cents,u.paid_at,'nutripro_plus' AS plan_code,false AS productive,'upgrade' AS kind
    FROM wompi_upgrades u WHERE u.profile_id=$1 AND u.transaction_id IS NOT NULL
    ORDER BY paid_at DESC,transaction_id DESC LIMIT 200`, [id])).rows.map(row => ({
      transactionId: row.transaction_id, amountCents: row.amount_cents,
      paidAt: row.paid_at, plan: row.plan_code, productive: row.productive, kind: row.kind,
    })), true);
  return {
    listBillingTransactions: () => transactionsFor(profileId()),
    adminBillingTransactions: id => {
      if (!Number.isSafeInteger(id) || id < 1) throw new AppError('INVALID_FILTER', 'Cuenta inválida.', 400);
      return transactionsFor(id);
    },
    billingStatus: () => transaction(async c => {
      const row = (await c.query(`SELECT plan_code,state,paid_until,last_paid_at,productive,link_url FROM wompi_subscriptions
        WHERE profile_id=$1 AND state IN ('pending','active','review') ORDER BY created_at DESC LIMIT 1`, [profileId()])).rows[0];
      const upgrade = (await c.query(`SELECT * FROM wompi_upgrades WHERE profile_id=$1 AND state IN ('pending','active','review') ORDER BY created_at DESC LIMIT 1`, [profileId()])).rows[0];
      return { ...(publicState(row) || { state: 'none' }), upgrade: upgradeState(upgrade) || null };
    }, true),
    upgradeQuote: () => transaction(async c => {
      const subscription = (await c.query(`SELECT * FROM wompi_subscriptions WHERE profile_id=$1 AND plan_code='nutripro' AND state='active' ORDER BY created_at DESC LIMIT 1`, [profileId()])).rows[0];
      if (!subscription) throw new AppError('UPGRADE_UNAVAILABLE', 'Necesitas una suscripción NutriPro activa.', 409);
      return { amountCents: upgradeAmount(subscription), paidUntil: subscription.paid_until };
    }, true),
    startBillingUpgrade: (wompi, webhookUrl) => transaction(async c => {
      const profile = (await c.query('SELECT role_code,plan_code FROM profiles WHERE id=$1 FOR UPDATE', [profileId()])).rows[0];
      if (profile?.role_code !== 'user' || profile.plan_code !== 'nutripro')
        throw new AppError('UPGRADE_UNAVAILABLE', 'Necesitas un plan NutriPro activo.', 409);
      const existing = (await c.query(`SELECT * FROM wompi_upgrades WHERE profile_id=$1 AND state IN ('pending','active','review') FOR UPDATE`, [profileId()])).rows[0];
      if (existing) {
        if (existing.state === 'pending' && new Date(existing.link_expires_at) > new Date())
          return { url: existing.link_url, amountCents: existing.amount_cents, paidUntil: existing.paid_until };
        if (existing.state !== 'pending') throw new AppError('UPGRADE_UNAVAILABLE', 'Ya existe un cambio de plan en curso.', 409);
        await c.query(`UPDATE wompi_upgrades SET state='expired' WHERE id=$1`, [existing.id]);
      }
      const source = (await c.query(`SELECT * FROM wompi_subscriptions WHERE profile_id=$1 AND plan_code='nutripro' AND state='active' FOR UPDATE`, [profileId()])).rows[0];
      if (!source) throw new AppError('UPGRADE_UNAVAILABLE', 'La suscripción NutriPro ya no está activa.', 409);
      const now = new Date();
      const cents = upgradeAmount(source, now);
      const expiresAt = new Date(Math.min(now.getTime() + 30 * 60 * 1000, new Date(source.paid_until).getTime() - 60_000));
      const id = randomUUID();
      const link = await wompi.createOneTimeLink({ reference: `nutribot-upgrade:${id}`, amountCents: cents, expiresAt, webhookUrl });
      await c.query(`INSERT INTO wompi_upgrades(id,profile_id,source_subscription_id,amount_cents,paid_until,source_paid_at,link_id,link_url,link_expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, profileId(), source.id, cents, source.paid_until, source.last_paid_at, link.id, link.url, expiresAt]);
      return { url: link.url, amountCents: cents, paidUntil: source.paid_until };
    }),
    createBillingLink: (plan, wompi) => transaction(async c => {
      if (!Object.hasOwn(wompiPrices, plan)) throw new AppError('INVALID_PLAN', 'Selecciona NutriPro o NutriMax.', 400);
      const profile = (await c.query('SELECT role_code FROM profiles WHERE id=$1 FOR UPDATE', [profileId()])).rows[0];
      if (!profile) throw new AppError('UNAUTHORIZED', 'Cuenta no encontrada.', 401);
      if (profile.role_code !== 'user') throw new AppError('BILLING_ROLE', 'Esta cuenta tiene un plan de equipo.', 409);
      const existing = (await c.query(`SELECT * FROM wompi_subscriptions WHERE profile_id=$1
        AND state IN ('pending','active','review') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [profileId()])).rows[0];
      if (existing) {
        if (existing.plan_code !== plan || existing.state !== 'pending')
          throw new AppError('BILLING_EXISTS', 'Ya tienes una suscripción en proceso. Consulta su estado antes de solicitar otra.', 409);
        return { url: existing.link_url, state: existing.state };
      }
      const upgrade = (await c.query(`SELECT * FROM wompi_upgrades WHERE profile_id=$1 AND state='active' FOR UPDATE`, [profileId()])).rows[0];
      if (upgrade && (plan !== 'nutripro_plus' || new Date(upgrade.paid_until).getTime() - Date.now() > upgradeWindowMs))
        throw new AppError('UPGRADE_UNAVAILABLE', 'La nueva afiliación NutriMax estará disponible tres días antes del vencimiento.', 409);
      const day = Math.min(28, upgrade ? new Date(upgrade.paid_until).getUTCDate() : new Date().getUTCDate());
      const link = await wompi.createRecurringLink({ plan, day });
      await c.query(`INSERT INTO wompi_subscriptions(id,profile_id,plan_code,amount_cents,link_id,link_url,productive)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), profileId(), plan, wompiPrices[plan], link.id, link.url, link.productive]);
      return { url: link.url, state: 'pending', productive: link.productive };
    }),
    recordWompiPayment: (event, transactionDetails) => transaction(async c => {
      const transactionId = event?.IdTransaccion;
      // Wompi's public recurrent-link documentation does not specify the webhook
      // link field. Accept only a provider-verified ID that matches our own link.
      const linkIdValue = event?.EnlacePagoRecurrente?.Id || event?.EnlacePago?.Id;
      const linkId = linkIdValue == null ? null : String(linkIdValue);
      if (typeof transactionId !== 'string' || !/^[a-f\d-]{36}$/i.test(transactionId) ||
          typeof linkId !== 'string' || !linkId ||
          event?.ResultadoTransaccion !== 'ExitosaAprobada' ||
          transactionDetails?.idTransaccion !== transactionId ||
          transactionDetails?.esAprobada !== true || transactionDetails?.esReal !== false ||
          event?.EsProductiva !== false)
        throw new AppError('INVALID_PAYMENT', 'El pago no pudo verificarse.', 400);
      const subscription = (await c.query('SELECT * FROM wompi_subscriptions WHERE link_id=$1 FOR UPDATE', [linkId])).rows[0];
      if (!subscription || subscription.productive ||
          amountCents(event.Monto) !== subscription.amount_cents ||
          amountCents(transactionDetails.monto) !== subscription.amount_cents)
        throw new AppError('INVALID_PAYMENT', 'El pago no coincide con la suscripción.', 400);
      if (subscription.state === 'ended') throw new AppError('INVALID_PAYMENT', 'Esta afiliación ya fue cancelada.', 409);
      const paidAt = new Date(event.FechaTransaccion);
      if (!Number.isFinite(paidAt.getTime()) || paidAt.getTime() > Date.now() + 300000)
        throw new AppError('INVALID_PAYMENT', 'La fecha del pago no es válida.', 400);
      const inserted = await c.query(`INSERT INTO wompi_payments(transaction_id,subscription_id,amount_cents,paid_at)
        VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING transaction_id`,
      [transactionId, subscription.id, subscription.amount_cents, paidAt]);
      if (!inserted.rowCount) return { duplicate: true };
      if (subscription.last_paid_at && paidAt <= subscription.last_paid_at)
        return { applied: false, outOfOrder: true };
      const until = new Date(paidAt);
      const day = until.getUTCDate();
      until.setUTCDate(1);
      until.setUTCMonth(until.getUTCMonth() + 1);
      const finalDay = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 0)).getUTCDate();
      until.setUTCDate(Math.min(day, finalDay));
      await c.query(`UPDATE wompi_subscriptions SET state='active',last_paid_at=$2,paid_until=$3 WHERE id=$1`,
        [subscription.id, paidAt, until]);
      await c.query(`SELECT set_config('nutribot.plan_change_reason','Cobro Wompi confirmado',true)`);
      await c.query(`UPDATE profiles SET plan_code=$2,revision=revision+1 WHERE id=$1 AND role_code='user'`,
        [subscription.profile_id, subscription.plan_code]);
      if (subscription.plan_code === 'nutripro_plus')
        await c.query(`UPDATE wompi_upgrades SET state='expired' WHERE profile_id=$1 AND state='active'`, [subscription.profile_id]);
      return { applied: true };
    }),
    recordWompiUpgradePayment: (event, details, wompi) => transaction(async c => {
      const match = /^nutribot-upgrade:([a-f\d-]{36})$/i.exec(event?.EnlacePago?.IdentificadorEnlaceComercio || '');
      const transactionId = event?.IdTransaccion;
      if (!match || typeof transactionId !== 'string' || !/^[a-f\d-]{36}$/i.test(transactionId) ||
          event?.ResultadoTransaccion !== 'ExitosaAprobada' || event?.EsProductiva !== false ||
          details?.idTransaccion !== transactionId || details?.esAprobada !== true || details?.esReal !== false)
        throw new AppError('INVALID_PAYMENT', 'El ajuste no pudo verificarse.', 400);
      const upgrade = (await c.query('SELECT * FROM wompi_upgrades WHERE id=$1 FOR UPDATE', [match[1]])).rows[0];
      if (!upgrade || String(event.EnlacePago.Id) !== upgrade.link_id ||
          amountCents(event.Monto) !== upgrade.amount_cents || amountCents(details.monto) !== upgrade.amount_cents)
        throw new AppError('INVALID_PAYMENT', 'El ajuste no coincide con el enlace emitido.', 400);
      if (upgrade.state === 'active' && upgrade.transaction_id === transactionId) return { duplicate: true };
      if (upgrade.state !== 'pending') throw new AppError('INVALID_PAYMENT', 'El ajuste ya no está pendiente.', 409);
      const paidAt = new Date(event.FechaTransaccion);
      if (!Number.isFinite(paidAt.getTime()) || paidAt < new Date(upgrade.created_at) || paidAt > new Date(upgrade.link_expires_at) ||
          paidAt.getTime() > Date.now() + 300000)
        throw new AppError('INVALID_PAYMENT', 'El ajuste llegó fuera de plazo.', 400);
      const source = (await c.query('SELECT * FROM wompi_subscriptions WHERE id=$1 FOR UPDATE', [upgrade.source_subscription_id])).rows[0];
      const profile = (await c.query('SELECT role_code,plan_code FROM profiles WHERE id=$1 FOR UPDATE', [upgrade.profile_id])).rows[0];
      if (!source || source.state !== 'active' || source.plan_code !== 'nutripro' ||
          new Date(source.last_paid_at).getTime() !== new Date(upgrade.source_paid_at).getTime() ||
          profile?.role_code !== 'user' || profile.plan_code !== 'nutripro')
        throw new AppError('UPGRADE_UNAVAILABLE', 'La suscripción cambió antes de confirmar el ajuste.', 409);
      await wompi.disableRecurringLink(source.link_id);
      await c.query(`UPDATE wompi_subscriptions SET state='ended' WHERE id=$1`, [source.id]);
      await c.query(`UPDATE wompi_upgrades SET state='active',transaction_id=$2,paid_at=$3 WHERE id=$1`, [upgrade.id, transactionId, paidAt]);
      await c.query(`SELECT set_config('nutribot.plan_change_reason','Ajuste NutriMax Wompi confirmado',true)`);
      await c.query(`UPDATE profiles SET plan_code='nutripro_plus',revision=revision+1 WHERE id=$1`, [upgrade.profile_id]);
      return { applied: true };
    }),
    expireBilling: () => transaction(async c => {
      const expired = (await c.query(`SELECT s.id,s.profile_id,s.plan_code FROM wompi_subscriptions s
        WHERE s.state='active' AND s.paid_until <= now() FOR UPDATE`)).rows;
      for (const item of expired) {
        await c.query(`SELECT set_config('nutribot.plan_change_reason','Mensualidad Wompi vencida',true)`);
        await c.query(`UPDATE profiles SET plan_code='basico',revision=revision+1
          WHERE id=$1 AND role_code='user' AND plan_code=$2`, [item.profile_id, item.plan_code]);
      }
      const upgrades = (await c.query(`SELECT id,profile_id FROM wompi_upgrades WHERE state='active' AND paid_until <= now() FOR UPDATE`)).rows;
      for (const item of upgrades) {
        await c.query(`UPDATE wompi_upgrades SET state='expired' WHERE id=$1`, [item.id]);
        await c.query(`SELECT set_config('nutribot.plan_change_reason','Ajuste NutriMax vencido',true)`);
        await c.query(`UPDATE profiles SET plan_code='basico',revision=revision+1 WHERE id=$1 AND role_code='user' AND plan_code='nutripro_plus'
          AND NOT EXISTS (SELECT 1 FROM wompi_subscriptions WHERE profile_id=$1 AND plan_code='nutripro_plus' AND state='active' AND paid_until > now())`, [item.profile_id]);
      }
      return expired.length + upgrades.length;
    }),
  };
}
