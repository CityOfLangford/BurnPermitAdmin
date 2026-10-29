import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.AUTHORIZATION_ENABLED = 'false';
const { app, queryValue } = await import('../server.js');
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
    const authConfigResponse = await fetch(`http://127.0.0.1:${address.port}/api/auth-config`);
    assert.equal(authConfigResponse.status, 200);
    assert.deepEqual(await authConfigResponse.json(), { authorizationEnabled: false });

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });

    const apiHealthResponse = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(apiHealthResponse.status, 200);
    assert.deepEqual(await apiHealthResponse.json(), { status: 'ok' });
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

test('admin endpoints reject invalid availability, period, and configuration data', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const postJson = (url, body) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const availabilityResponse = await postJson(`${baseUrl}/system-available-dates`, {
      typeID: 1,
      dateSysAvailableChange: '2026-10-28T15:30',
      flagSystemAvailable: true,
    });
    assert.equal(availabilityResponse.status, 400);

    const periodResponse = await postJson(`${baseUrl}/periods`, {
      Name: '',
      TypeID: 1,
      StartDate: '2026-01-01',
      EndDate: '2026-12-31',
      BookingStartDate: '2025-12-01',
      BookingEndDate: '2026-11-30',
    });
    assert.equal(periodResponse.status, 400);

    const configurationResponse = await fetch(`${baseUrl}/configurations/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Value: 1 }),
    });
    assert.equal(configurationResponse.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
