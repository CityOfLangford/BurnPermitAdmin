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

test('blackout date endpoints reject invalid data before querying the database', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/blackout-dates`;
    const createResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TypeID: 3, BlackoutDate: '2026-10-28' }),
    });
    assert.equal(createResponse.status, 400);
    assert.deepEqual(await createResponse.json(), { error: 'A permit type of 1 or 2 and a valid blackout date are required' });

    const updateResponse = await fetch(`${baseUrl}/invalid-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TypeID: 1, BlackoutDate: '2026-10-28' }),
    });
    assert.equal(updateResponse.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
