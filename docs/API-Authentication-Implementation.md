# API Authentication – Implementation Guide (Express + jose + Entra ID)

How the Express API validates Entra ID access tokens and checks membership in an Entra ID group.

**Prerequisite:** the app registration, enterprise app and group assignment are set up as described in [Entra-App-Registration-Setup.md](Entra-App-Registration-Setup.md).

Replace the `<PLACEHOLDERS>` with real values.

## How it works

1. The client sends `Authorization: Bearer <access token>` on every API call.
2. The `jose` middleware verifies the token's signature (against Entra ID's public keys), algorithm, issuer, audience and expiry.
3. The middleware checks that `scp` contains the API scope and `groups` contains the allowed group ID.
4. Only then does the request reach express routes.

| Check | Failure |
|---|---|
| `Authorization: Bearer` header present | 401 |
| Signature valid (RS256, Entra JWKS) | 401 |
| `iss` = `https://login.microsoftonline.com/<TENANT_ID>/v2.0` | 401 |
| `aud` = `<CLIENT_ID>` or `api://<CLIENT_ID>` | 401 |
| Token not expired / not before `nbf` | 401 |
| `scp` contains `<SCOPE_NAME>` | 403 |
| `groups` contains `<GROUP_ID>` | 403 |

### What jose does

`jose` is a dependency-free library for JWT, JWS, JWK and JWKS.

- `createRemoteJWKSet` downloads and caches Entra ID's signing keys from `https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys`, and refetches them when Microsoft rotates keys.
- `jwtVerify` checks the signature, `exp`/`nbf`, issuer and audience.

## File layout

```
packages/api/
  .env
  src/
    server.ts
    auth/
      authorization.ts
  test/
    authorization.test.js
    server.authorization.test.js
```

Adjust paths to match the project. The test imports use the compiled `.js` paths.

## 1. Install

```
cd packages/api
npm install jose express cors dotenv
npm install -D @types/express @types/cors
```

## 2. `.env` (excerpt only)

```
# Entra ID authorization
AUTHORIZATION_ENABLED=true
ENTRA_TENANT_ID=<TENANT_ID>
ENTRA_CLIENT_ID=<CLIENT_ID>
ENTRA_GROUP_ID=<GROUP_ID>
ENTRA_API_SCOPE=<SCOPE_NAME>
```

- `ENTRA_API_SCOPE` is the scope **name only** (for example `AccessBurnPermitAdmin`), not the full `api://…/` URI. It must exactly match the scope name in **Expose an API**.
- `ENTRA_CLIENT_ID` is the app registration that exposes the API.
- `AUTHORIZATION_ENABLED=false` skips every check. Use it only for local debugging, never in production.
- Be sure to include the **database connection** details in the .env file (not shown here).
- Keep `.env` in `.gitignore`.


## 3. `src/auth/authorization.ts`

```ts
import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// Define the configuration structure required for authorization settings.
export type AuthorizationConfig = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  groupId: string;
  scope: string;
};

// Fallback placeholder values used when environment variables are missing.
const defaultTenantId = '<TENANT_ID>';
const defaultClientId = '<CLIENT_ID>';
const defaultGroupId = '<GROUP_ID>';
const defaultScope = '<SCOPE_NAME>';

type TokenVerifier = (token: string) => Promise<JWTPayload>;

// Read, parse, and validate authorization configuration from environment variables.
export function readAuthorizationConfig(environment: NodeJS.ProcessEnv = process.env): AuthorizationConfig {
  const enabledValue = (environment.AUTHORIZATION_ENABLED ?? environment.AUTHORIZATION_ENABLE ?? 'true')
    .trim()
    .toLowerCase();

  if (enabledValue !== 'true' && enabledValue !== 'false') {
    throw new Error('AUTHORIZATION_ENABLED must be either true or false');
  }

  const config: AuthorizationConfig = {
    enabled: enabledValue === 'true',
    tenantId: environment.ENTRA_TENANT_ID || defaultTenantId,
    clientId: environment.ENTRA_CLIENT_ID || defaultClientId,
    groupId: environment.ENTRA_GROUP_ID || defaultGroupId,
    scope: environment.ENTRA_API_SCOPE ?? defaultScope,
  };

  if (config.enabled && (!config.tenantId || !config.clientId || !config.groupId || !config.scope)) {
    throw new Error('Entra tenant, client, group, and API scope settings are required when authorization is enabled');
  }

  return config;
}

// Create a verifier function to validate Microsoft Entra JWT tokens against remote JWKS.
function createEntraTokenVerifier(config: AuthorizationConfig): TokenVerifier {
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  const jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`)
  );

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
      audience: [config.clientId, `api://${config.clientId}`],
      issuer,
    });
    return payload;
  };
}

// Generate an Express middleware handler to enforce token authentication, scope checks, and group membership.
export function createAuthorizationMiddleware(
  config: AuthorizationConfig,
  verifyToken?: TokenVerifier
) {
  // Allow test injection of verifyToken to bypass signature checks if needed.
  const validateToken = verifyToken ?? (config.enabled ? createEntraTokenVerifier(config) : async () => ({}));

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Bypass middleware checks if authorization is globally disabled.
    if (!config.enabled) {
      next();
      return;
    }

    // Extract and validate the Bearer token syntax from the authorization header.
    const authorization = req.header('authorization');
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'Bearer access token required' });
      return;
    }

    // Verify token validity and extract payload claims.
    let claims: JWTPayload;
    try {
      claims = await validateToken(match[1]);
    } catch (error: unknown) {
      console.warn('Entra access token validation failed:', error);
      res.status(401).json({ error: 'Invalid or expired access token' });
      return;
    }

    // Check if the token includes the required API scope.
    const scopes = typeof claims.scp === 'string' ? claims.scp.split(' ') : [];
    if (!scopes.includes(config.scope)) {
      res.status(403).json({ error: 'Required API scope is missing' });
      return;
    }

    // Check if the user belongs to the required Azure AD / Entra security group.
    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    const hasAllowedGroup = groups.some(
      (group) => typeof group === 'string' && group.toLowerCase() === config.groupId.toLowerCase()
    );
    if (!hasAllowedGroup) {
      res.status(403).json({ error: '<GROUP_NAME> group membership is required' });
      return;
    }

    // Proceed to the next middleware or route handler upon successful authorization.
    next();
  };
}
```

### Notes

- **Token version:** the issuer check requires **v2.0** tokens. The app registration manifest must have `requestedAccessTokenVersion: 2`; otherwise every request fails with 401.
- **Groups claim:** it only appears when the groups claim is configured (Groups assigned to the application) and the group is assigned to the enterprise app.
- **Scope check:** requiring `scp` rejects app-only tokens, which carry `roles` instead.
- **401 vs 403:** 401 means the caller couldn't be authenticated; 403 means the caller is known but not allowed.

## 4. `src/server.ts` (auth-relevant parts)

Middleware order is what makes this work. Routes registered **after** `createAuthorizationMiddleware` are protected.

```ts
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import { createAuthorizationMiddleware, readAuthorizationConfig } from './auth/authorization.js';

dotenv.config();

export const app = express();
const port = Number(process.env.PORT || 3001);
const authorizationConfig = readAuthorizationConfig();

// 1. CORS first, so browser preflight (OPTIONS) requests succeed without a token.
app.use(cors());

// 2. Public: tells the client whether to start MSAL sign-in.
app.get('/api/auth-config', (_req: Request, res: Response) => {
  res.json({ authorizationEnabled: authorizationConfig.enabled });
});

// 3. Everything registered below requires a valid token, scope and group.
app.use(createAuthorizationMiddleware(authorizationConfig));

// 4. Body parsing after auth, so unauthenticated bodies are never parsed.
app.use(express.json());

const healthCheck = (_req: Request, res: Response): void => {
  res.json({ status: 'ok' });
};
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// ... protected application routes (GET/POST/PUT/DELETE /api/...) ...

export function startServer() {
  return app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

// Start only when run directly, so tests can import `app` without listening on a port.
const isMainModule = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMainModule) {
  startServer();
}
```

### Notes

- Only `/api/auth-config` is public. `/health` and `/api/health` are protected on purpose, and the client uses `/api/health` as its access check. A load balancer, IIS or PM2 probe calling `/health` without a token will get 401.
- `dotenv` doesn't overwrite variables already set in `process.env`. The tests rely on this when they set variables before importing `server.js`.
- `cors()` with no options allows any origin. That's acceptable with Bearer tokens, but you can restrict it, for example `cors({ origin: ['<DEV_URL>', '<PROD_URL>'] })`.

## 5. Tests

The two test files cover different things:

| File | Tests | Token validation |
|---|---|---|
| `authorization.test.js` | Middleware logic and config parsing in isolation | Replaced with a fake verifier that returns chosen claims |
| `server.authorization.test.js` | That `server.ts` wires the middleware so every route except `/api/auth-config` is protected | Real middleware, but no token sent, so it never reaches `jose` |

Neither test checks the real issuer, audience or signature against Entra ID. Do that manually with a real token (see section 6).

Run:

```
npm run build
node --test test/
```

### `test/authorization.test.js`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createAuthorizationMiddleware, readAuthorizationConfig } from '../auth/authorization.js';

const config = {
  enabled: true,
  tenantId: 'tenant-id',
  clientId: 'client-id',
  groupId: 'allowed-group-id',
  scope: '<SCOPE_NAME>',
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

test('authorization configuration defaults to the configured Entra tenant, app, group and scope', () => {
  const defaults = readAuthorizationConfig({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.tenantId, '<TENANT_ID>');
  assert.equal(defaults.clientId, '<CLIENT_ID>');
  assert.equal(defaults.groupId, '<GROUP_ID>');
  assert.equal(defaults.scope, '<SCOPE_NAME>');

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
  assert.deepEqual(await response.json(), { error: '<GROUP_NAME> group membership is required' });
});

test('API access is allowed only with both the delegated scope and configured group', async () => {
  const response = await requestWithClaims({ scp: config.scope, groups: [config.groupId] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
```

### `test/server.authorization.test.js`

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Set before importing server.js; dotenv won't overwrite these.
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
```

- Add new protected routes to the `for` list as the API grows.
- Other route tests that don't need auth (such as validation tests in `server.test.js`) should set `process.env.AUTHORIZATION_ENABLED = 'false'` before importing `server.js`. Keep them in a separate file, because `server.js` reads the config once when it's imported.

## 6. Verify with a real token

1. Set `AUTHORIZATION_ENABLED=true` and restart the API.
2. Sign in through the client, open DevTools → Network, select an `/api/...` request and copy the Bearer token.
3. Decode it at https://jwt.ms and confirm:

| Claim | Expected |
|---|---|
| `ver` | `"2.0"` |
| `iss` | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |
| `aud` | `<CLIENT_ID>` |
| `scp` | contains `<SCOPE_NAME>` |
| `groups` | contains `<GROUP_ID>` |

4. A group member gets 200; a non-member gets 403.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| 401 "Bearer access token required" | Client isn't sending the header, or the route is called directly without a token |
| 401 "Invalid or expired access token", issuer error in console | Token is v1; set `requestedAccessTokenVersion: 2` |
| 401, audience error in console | Client sent a Microsoft Graph token or the ID token instead of a token for `api://<CLIENT_ID>/<SCOPE_NAME>`, or `ENTRA_CLIENT_ID` points to the wrong app |
| 403 "Required API scope is missing" | `ENTRA_API_SCOPE` doesn't match the scope name in Entra or the scope the client requests |
| 403 group membership required | Group not assigned to the enterprise app, user not a direct member, or "Emit groups as role claims" is ticked |
| Every route open | `AUTHORIZATION_ENABLED=false` |
| Fallback to an old app when `.env` is missing | Hardcoded defaults in `authorization.ts` not updated |

## Optional hardening

- **Refuse to start with auth off in production.** Add to `readAuthorizationConfig`:

  ```ts
  if (!config.enabled && environment.NODE_ENV === 'production') {
    throw new Error('Authorization cannot be disabled in production');
  }
  ```

- **Keep the caller's identity for auditing.** Before `next()` in the middleware:

  ```ts
  res.locals.user = {
    oid: claims.oid,
    name: claims.name,
    username: claims.preferred_username,
  };
  ```

- **Detect group overage.** If `groups` is missing but `claims._claim_names` exists, Entra ID left out the groups claim. Log it to tell it apart from a genuine non-member. Using "Groups assigned to the application" normally prevents this.
