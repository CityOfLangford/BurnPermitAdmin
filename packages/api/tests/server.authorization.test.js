import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.AUTHORIZATION_ENABLED = 'true';
process.env.ENTRA_TENANT_ID = 'tenant-id';
process.env.ENTRA_CLIENT_ID = 'client-id';
process.env.ENTRA_GROUP_ID = 'group-id';

const { app } = await import('../server.js');

test('authorization middleware protects all API routes, including health checks', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const authConfigResponse = await fetch(`http://127.0.0.1:${address.port}/api/auth-config`);
    assert.equal(authConfigResponse.status, 200);
    assert.deepEqual(await authConfigResponse.json(), { authorizationEnabled: true });

    for (const path of ['/health', '/api/health', '/api/configurations']) {
      const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 401, `${path} should require an access token`);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
