import test from 'node:test';
import assert from 'node:assert/strict';
import { systemLogsPdf } from '../server/admin-system-pdf.js';

test('system PDF contains a bounded, paginated activity report', () => {
  const items = Array.from({ length: 47 }, (_, index) => ({ createdAt: '2026-11-04T12:00:00Z',
    category: 'roles', action: 'role_change', accountId: index + 1, detail: 'admin → goat' }));
  const pdf = systemLogsPdf(items, { days: 7, category: 'roles' });
  const source = pdf.toString('latin1');
  assert(source.startsWith('%PDF-1.4'));
  assert(source.includes('/Count 2'));
  assert(source.includes('Página 1 de 2'));
  assert(source.includes('Página 2 de 2'));
  assert(source.includes('admin > goat'));
  assert(source.endsWith('%%EOF\n'));
});
