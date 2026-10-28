import assert from 'node:assert/strict';
import { test } from 'node:test';
import { app, queryValue } from '../server.js';

test('queryValue normalizes query parameter shapes', () => {
  assert.equal(queryValue(undefined), null);
  assert.equal(queryValue(['first', 'second']), 'first');
  assert.equal(queryValue(12), 12);
  assert.equal(queryValue({ value: 'x' }), '[object Object]');
});

test('health endpoint reports the API status', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
