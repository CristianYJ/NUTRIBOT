import { authenticatedFetch } from './auth-api.js';

export async function billingRequest(path, body, signal) {
  const response = await authenticatedFetch(`/api/billing/${path}`, {
    ...(body !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.text || 'No se pudo consultar Wompi.');
  return result;
}
