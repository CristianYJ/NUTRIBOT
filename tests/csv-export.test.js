import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCsv } from '../src/csv-export.js';

test('CSV exports preserve rows and keep spreadsheet formulas as text', () => {
  const result = makeCsv(['Nombre', 'Monto'], [['="malicious"', 0], ['NutriPro, prueba', '2.99']]);
  assert.equal(result, '\uFEFF"Nombre","Monto"\r\n"\'=\"\"malicious\"\"","0"\r\n"NutriPro, prueba","2.99"\r\n');
});
