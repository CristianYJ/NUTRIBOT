import test from 'node:test';
import assert from 'node:assert/strict';
import { planWelcomeMessage } from '../server/plan-mail.js';

test('welcome email describes the verified test plan and links to the profile', () => {
  const message = planWelcomeMessage({ name: 'Lázaro', plan: 'nutripro', origin: 'https://nutribot.online' });
  assert.match(message.subject, /NutriPro/);
  assert.match(message.text, /14 generaciones/);
  assert.match(message.text, /3 fotos/);
  assert.match(message.text, /no se efectuó un cobro real/);
  assert.match(message.html, /https:\/\/nutribot\.online\/#profile/);
  assert.match(message.html, /nutribot-logo\.png/);
});

test('welcome email escapes a profile name and selects NutriMax limits', () => {
  const message = planWelcomeMessage({ name: '<script>x</script>', plan: 'nutripro_plus', origin: 'https://nutribot.online' });
  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.text, /22 generaciones/);
  assert.match(message.text, /6 fotos/);
});
