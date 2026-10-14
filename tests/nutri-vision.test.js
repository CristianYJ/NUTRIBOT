import test from 'node:test';
import assert from 'node:assert/strict';
import { prefersCamera, preparePhoto } from '../src/nutri-vision.js';

// Browser APIs supplied only in this test process.
globalThis.createImageBitmap = async () => {};
globalThis.document = { createElement() {} };

test('Nutri-Vision prefers camera capture on phones and iPads, but not desktop touch computers', () => {
  for (const device of [
    { userAgentData: { mobile: true } },
    { userAgent: 'Mozilla/5.0 (Linux; Android 14)' },
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS)' },
    { userAgent: 'Mozilla/5.0 (iPad)' },
    { platform: 'MacIntel', maxTouchPoints: 5 },
  ]) assert.equal(prefersCamera(device), true);
  for (const device of [{}, { platform: 'Win32', maxTouchPoints: 10 }, { platform: 'MacIntel', maxTouchPoints: 0 }])
    assert.equal(prefersCamera(device), false);
});

test('photo validation rejects unsupported formats and files over 15 MB before decoding', async t => {
  const decode = t.mock.method(globalThis, 'createImageBitmap', async () => { throw Error('unexpected decode'); });
  await assert.rejects(preparePhoto({ type: 'image/heic', size: 20 }), /JPG, PNG o WebP/);
  await assert.rejects(preparePhoto({ type: 'image/jpeg', size: 15 * 1024 * 1024 + 1 }), /15 MB/);
  assert.equal(decode.mock.callCount(), 0);
});

test('photos are resized, converted to JPEG and released; oversized encoded photos are rejected', async t => {
  let closed = 0;
  let encoded = 'data:image/jpeg;base64,YWJj';
  const bitmap = { width: 4000, height: 3000, close() { closed++; } };
  const context = { fillRect() {}, drawImage() {} };
  const canvas = { getContext: () => context, toDataURL: () => encoded };
  t.mock.method(globalThis, 'createImageBitmap', async () => bitmap);
  t.mock.method(globalThis.document, 'createElement', () => canvas);
  const result = await preparePhoto({ type: 'image/png', size: 15 * 1024 * 1024 });
  assert.deepEqual([canvas.width, canvas.height], [1600, 1200]);
  assert.equal(context.fillStyle, 'white');
  assert.deepEqual(result.image, { mimeType: 'image/jpeg', data: 'YWJj' });
  assert.equal(closed, 1);
  encoded = 'data:image/jpeg;base64,' + 'a'.repeat(4194305);
  await assert.rejects(preparePhoto({ type: 'image/webp', size: 100 }), /demasiado grande/);
  assert.equal(closed, 2);
});

test('unreadable photos give an actionable error', async t => {
  t.mock.method(globalThis, 'createImageBitmap', async () => { throw Error('decode failed'); });
  await assert.rejects(preparePhoto({ type: 'image/jpeg', size: 100 }), /Prueba con otra imagen/);
});

