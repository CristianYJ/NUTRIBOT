import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './recipes.js';

const tokenUrl = 'https://id.wompi.sv/connect/token';
const apiUrl = 'https://api.wompi.sv';

export const wompiPrices = Object.freeze({ nutripro: 299, nutripro_plus: 999 });

export function verifyWompiWebhook(raw, received, secret) {
  if (!Buffer.isBuffer(raw) || !secret || typeof received !== 'string' || !/^[a-f\d]{64}$/i.test(received)) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(received, 'hex'));
}

export function createWompi({ appId, secret, fetchImpl = fetch } = {}) {
  let token = null;
  let tokenExpires = 0;
  const configured = Boolean(appId && secret);
  async function accessToken() {
    if (!configured) throw new AppError('PAYMENTS_UNAVAILABLE', 'Los pagos aún no están configurados.', 503);
    if (token && Date.now() < tokenExpires - 60_000) return token;
    const body = new URLSearchParams({ grant_type: 'client_credentials', audience: 'wompi_api', client_id: appId, client_secret: secret });
    let response;
    try { response = await fetchImpl(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10000) }); }
    catch { throw new AppError('PAYMENTS_UNAVAILABLE', 'No se pudo conectar con Wompi.', 503); }
    if (!response.ok) throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi rechazó la configuración de pagos.', 503);
    const result = await response.json();
    if (typeof result.access_token !== 'string' || !Number.isFinite(result.expires_in)) throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi devolvió una respuesta inválida.', 503);
    token = result.access_token;
    tokenExpires = Date.now() + result.expires_in * 1000;
    return token;
  }
  async function request(method, path, body) {
    let response;
    try { response = await fetchImpl(`${apiUrl}${path}`, { method, headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) }); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError('PAYMENTS_UNAVAILABLE', 'No se pudo conectar con Wompi.', 503); }
    if (!response.ok) throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi no pudo completar la solicitud.', 503);
    return response.status === 204 ? null : response.json();
  }
  return {
    configured,
    async createOneTimeLink({ reference, amountCents, expiresAt, webhookUrl }) {
      if (!/^nutribot-upgrade:[a-f\d-]{36}$/i.test(reference) || !Number.isInteger(amountCents) || amountCents < 1 || amountCents > 700 ||
          !Number.isFinite(new Date(expiresAt).getTime()) || !/^https:\/\//.test(webhookUrl || ''))
        throw new AppError('INVALID_PAYMENT', 'Datos del ajuste inválidos.', 400);
      const business = await request('GET', '/Aplicativo');
      if (business?.estaProductivo !== false || business?.idAplicativo !== appId)
        throw new AppError('PAYMENTS_UNAVAILABLE', 'El negocio Wompi debe estar en modo de pruebas.', 503);
      const result = await request('POST', '/EnlacePago', {
        identificadorEnlaceComercio: reference, monto: amountCents / 100,
        nombreProducto: 'Ajuste NutriMax NutriBot (prueba)',
        configuracion: { urlWebhook: webhookUrl, esMontoEditable: false, esCantidadEditable: false },
        limitesDeUso: { cantidadMaximaPagosExitosos: 1 },
        vigencia: { fechaFin: new Date(expiresAt).toISOString() },
      });
      const url = result?.urlEnlace;
      if (result?.idEnlace == null || !url || new URL(url).protocol !== 'https:' || !/(^|\.)wompi\.sv$/.test(new URL(url).hostname) || result.estaProductivo !== false)
        throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi devolvió un enlace de prueba inválido.', 503);
      return { id: String(result.idEnlace), url };
    },
    async disableRecurringLink(id) {
      const path = `/EnlacePagoRecurrente/${encodeURIComponent(id)}`;
      let result;
      try { result = await request('POST', path); }
      catch (error) {
        // A retry can arrive after Wompi disabled the link but before our DB commit.
        const current = await request('GET', path);
        if (current?.estaActivo === false) return current;
        throw error;
      }
      if (result?.estaActivo === false) return result;
      const current = await request('GET', path);
      if (current?.estaActivo !== false) throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi no confirmó la cancelación de NutriPro.', 503);
      return current;
    },
    async createRecurringLink({ plan, day }) {
      const cents = wompiPrices[plan];
      if (!cents || !Number.isInteger(day) || day < 1 || day > 28) throw new AppError('INVALID_PLAN', 'Plan o fecha de cobro inválidos.', 400);
      const business = await request('GET', '/Aplicativo');
      if (business?.estaProductivo !== false || business?.idAplicativo !== appId)
        throw new AppError('PAYMENTS_UNAVAILABLE', 'El negocio Wompi debe estar en modo de pruebas.', 503);
      const name = plan === 'nutripro' ? 'NutriPro' : 'NutriMax';
      const result = await request('POST', '/EnlacePagoRecurrente', {
        diaDePago: day, nombre: `${name} NutriBot (prueba)`, idAplicativo: appId,
        monto: cents / 100, descripcionProducto: `${name} de NutriBot · prueba mensual de $${(cents / 100).toFixed(2)} sin cargo real`,
      });
      const url = result?.urlEnlace || result?.urlEnlaceLargo;
      if (typeof result?.idEnlace !== 'string' || !url || new URL(url).protocol !== 'https:' || !/(^|\.)wompi\.sv$/.test(new URL(url).hostname))
        throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi devolvió un enlace inválido.', 503);
      if (result.estaProductivo !== false)
        throw new AppError('PAYMENTS_UNAVAILABLE', 'Wompi devolvió un enlace productivo. No se habilitará.', 503);
      return { id: result.idEnlace, url, productive: result.estaProductivo === true };
    },
    getSubscriptions: (id) => request('GET', `/EnlacePagoRecurrente/${encodeURIComponent(id)}/suscripciones?CantidadPorPagina=20&PaginaActual=1`),
    getTransaction: (id) => request('GET', `/TransaccionCompra/${encodeURIComponent(id)}`),
  };
}
