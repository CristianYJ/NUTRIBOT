import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordResetMessage } from '../server/password-mail.js';

test('reset email includes the account name, one reset destination, and a text fallback', () => {
  const link = 'https://nutribot.online/#restablecer/abc123';
  const message = passwordResetMessage({ name: 'Lázaro', link });
  assert.match(message.subject, /Restablece tu contraseña/);
  assert.match(message.text, /Hola, Lázaro:/);
  assert.match(message.text, /20 minutos/);
  assert.match(message.html, /Restablecer contraseña/);
  assert.match(message.html, /nutribot-logo\.png/);
  assert.equal(message.html.match(/href="https:\/\/nutribot\.online\/#restablecer\/abc123"/g)?.length, 2);
});

test('reset email escapes profile names and links in HTML', () => {
  const message = passwordResetMessage({ name: '<script>alert(1)</script>', link: 'https://nutribot.online/#restablecer/abc&123' });
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /abc&amp;123/);
});
