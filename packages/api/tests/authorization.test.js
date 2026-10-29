import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAuthorizationMiddleware, readAuthorizationConfig } from '../auth/authorization.js';

const config = {
  enabled: true,
  tenantId: 'tenant-id',
  clientId: 'client-id',
  groupId: 'allowed-group-id',
  scope: 'access_as_user',
};

async function requestWithClaims(claims, authorization = 'Bearer valid-token') {
  const app = express();
  app.get('/protected', createAuthorizationMiddleware(config, async () => claims), (_req, res) => {
    res.json({ status: 'ok' });
  });
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return await fetch(`http://127.0.0.1:${address.port}/protected`, {
      headers: authorization ? { authorization } : {},
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('authorization configuration defaults to the Burn Permit Entra tenant and group', () => {
  const defaults = readAuthorizationConfig({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.tenantId, 'e6daa991-402f-46f2-b53b-09367f7d9ea8');
  assert.equal(defaults.clientId, 'd18ed6f1-6ec8-4fa3-9359-222db017c34c');
  assert.equal(defaults.groupId, 'aee60979-dcc2-4d85-9a1b-ca7fb86da40d');
  assert.equal(defaults.scope, 'access_as_user');
  assert.equal(readAuthorizationConfig({ AUTHORIZATION_ENABLED: 'false' }).enabled, false);
  assert.equal(readAuthorizationConfig({ AUTHORIZATION_ENABLE: 'false' }).enabled, false);
  assert.equal(readAuthorizationConfig({
    AUTHORIZATION_ENABLED: 'true',
    AUTHORIZATION_ENABLE: 'false',
  }).enabled, true);
  assert.throws(() => readAuthorizationConfig({ AUTHORIZATION_ENABLED: 'sometimes' }), /must be either true or false/);
});

test('API access requires a bearer token', async () => {
  const response = await requestWithClaims({}, '');
  assert.equal(response.status, 401);
});

test('API access rejects tokens that fail validation', async () => {
  const app = express();
  app.get('/protected', createAuthorizationMiddleware(config, async () => {
    throw new Error('Signature verification failed');
  }), (_req, res) => res.json({ status: 'ok' }));
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/protected`, {
      headers: { authorization: 'Bearer invalid-token' },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid or expired access token' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('API access requires the configured delegated scope', async () => {
  const response = await requestWithClaims({ scp: 'other_scope', groups: [config.groupId] });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Required API scope is missing' });
});

test('API access requires membership in the configured Entra group', async () => {
  const response = await requestWithClaims({ scp: config.scope, groups: ['another-group-id'] });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'BurnPermitAdmins group membership is required' });
});

test('API access is allowed only with both the delegated scope and configured group', async () => {
  const response = await requestWithClaims({ scp: config.scope, groups: [config.groupId] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
