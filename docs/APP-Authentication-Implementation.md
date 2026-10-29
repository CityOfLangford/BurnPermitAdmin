# App Authentication – Implementation Guide (React + Vite + MSAL)

How the React app signs users in with Entra ID, gets an access token for the API, and checks access before showing the app.

**Prerequisites:**

- App registration, enterprise app and group assignment: [Entra-App-Registration-Setup.md](Entra-App-Registration-Setup.md)
- API token validation: [API-Authentication-Implementation.md](API-Authentication-Implementation.md)

Replace the `<PLACEHOLDERS>` with real values.

| Placeholder | Description |
|---|---|
| `<TENANT_ID>` | Directory (tenant) ID |
| `<CLIENT_ID>` | Application (client) ID of the app registration |
| `<SCOPE_NAME>` | Delegated API scope name (from **Expose an API**) |
| `<GROUP_NAME>` | Display name of the allowed group (used in messages only) |
| `<APP_PACKAGE>` | Workspace folder of the React app (for example `packages/app`) |
| `<DEV_URL>` | Local dev URL, for example `http://localhost:5173/` |
| `<PROD_URL>` | Production URL |
| `<API_PORT>` | Local API port, for example `3001` |

## How it works

1. `main.tsx` calls the public `/api/auth-config` endpoint to ask whether authorization is enabled.
2. **Disabled:** the app renders directly, and `apiFetch` sends plain requests.
3. **Enabled:** MSAL is initialized, and the app is wrapped in `MsalProvider` and `AuthenticationGate`.
4. `AuthenticationGate` redirects to Microsoft sign-in if there's no account.
5. After sign-in, it calls `/api/health` through `apiFetch` as an access check. The **server** decides:
   - 200 → the app is shown
   - 403 → "not a member of `<GROUP_NAME>`"
   - anything else → a generic "access could not be verified" message
6. Every API call goes through `apiFetch`, which gets an access token silently and adds `Authorization: Bearer <token>`.

The client never decides on group membership itself. Hiding the app is only a convenience; the API enforces access.

## File layout

```
<APP_PACKAGE>/
  .env
  vite.config.ts
  src/
    main.tsx
    vite-env.d.ts
    auth/
      entra.ts
      apiFetch.ts
      AuthenticationGate.tsx
  tests/
    auth.test.js
    vite.config.test.js
    vite-env.test.js
    main.test.js
```

## 1. Install

```
cd <APP_PACKAGE>
npm install @azure/msal-browser@latest @azure/msal-react@latest
```

> Keep `@azure/msal-browser` and `@azure/msal-react` on **matching major versions**. In an npm workspace, the API's `mssql` → `tedious` → `@azure/identity` can hoist a different `msal-browser` to the root `node_modules`, causing errors such as `"AccountEntity" is not exported`. Install both from the workspace root together and check:
>
> ```
> npm install @azure/msal-browser@latest @azure/msal-react@latest -w <APP_PACKAGE>
> npm ls @azure/msal-browser @azure/msal-react
> ```
>
> There should be no `invalid` lines. Afterwards, delete `<APP_PACKAGE>/node_modules/.vite` and restart Vite.

## 2. `.env`

```
VITE_ENTRA_TENANT_ID=<TENANT_ID>
VITE_ENTRA_CLIENT_ID=<CLIENT_ID>
VITE_ENTRA_API_SCOPE=api://<CLIENT_ID>/<SCOPE_NAME>
```

- Only variables prefixed with `VITE_` reach the browser code.
- These values are **built into the bundle** and visible to anyone. They are identifiers, not secrets. Never put secrets in this file.
- `VITE_ENTRA_API_SCOPE` is the **full** scope URI. (The API's `ENTRA_API_SCOPE` is the scope name only.)
- Vite reads `.env` only at startup. Restart `npm run dev` after changes, and rebuild for production.

## 3. `src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENTRA_TENANT_ID?: string;
  readonly VITE_ENTRA_CLIENT_ID?: string;
  readonly VITE_ENTRA_API_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

The `ImportMetaEnv` block is optional. It gives type checking and autocomplete for the `VITE_` variables.

## 4. `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:<API_PORT>',
        changeOrigin: true,
      },
    },
  },
});
```

- The proxy lets the app call `/api/...` on its own origin during development, so no CORS setup is needed locally.
- The port must match the registered redirect URI. With `strictPort: false`, Vite silently moves to another port if 5173 is busy, and sign-in then fails with **AADSTS50011**. Set `strictPort: true` if you'd rather get an error.
- Use `@vitejs/plugin-react` 5.x or later with Vite 8. The 4.x plugin only supports Vite 4–7.

## 5. `src/auth/entra.ts`

```ts
import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

// Fallbacks used when .env values are missing. Keep these in sync with the app registration.
const tenantId = import.meta.env?.VITE_ENTRA_TENANT_ID || '<TENANT_ID>';
const clientId = import.meta.env?.VITE_ENTRA_CLIENT_ID || '<CLIENT_ID>';
export const apiScope = import.meta.env?.VITE_ENTRA_API_SCOPE || `api://${clientId}/<SCOPE_NAME>`;

// Redirect URIs must match the registration exactly, including the trailing slash.
export function getRedirectUri(origin: string): string {
  return origin.endsWith('/') ? origin : `${origin}/`;
}

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: getRedirectUri(typeof window === 'undefined' ? '<DEV_URL>' : window.location.origin),
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

let instance: PublicClientApplication | undefined;

// Created on first use, so tests can import this module without starting MSAL.
export function getMsalInstance(): PublicClientApplication {
  instance ??= new PublicClientApplication(msalConfig);
  return instance;
}
```

### Notes

- **Authority** uses the tenant ID, which limits sign-in to your organization (single tenant).
- **Redirect URI** is built from `window.location.origin`, so the same build works on every registered URL (dev, test, production). Each origin must be registered as an **SPA** redirect URI. Network addresses such as `http://10.x.x.x:5173` aren't registered and fail.
- **`sessionStorage`** clears tokens when the tab closes and isn't shared between tabs. Use `localStorage` if users should stay signed in across tabs, at the cost of tokens persisting longer on the device.

## 6. `src/auth/apiFetch.ts`

```ts
import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { getMsalInstance, apiScope } from './entra';

let authorizationEnabled = true;

export function setApiAuthorizationEnabled(enabled: boolean): void {
  authorizationEnabled = enabled;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!authorizationEnabled) {
    return fetch(input, init);
  }

  const instance = getMsalInstance();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  if (!account) {
    throw new Error('You must sign in before calling the API');
  }

  let accessToken: string;
  try {
    // Uses the cached token, or refreshes it silently when it's about to expire.
    const result = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
    accessToken = result.accessToken;
  } catch (error: unknown) {
    if (error instanceof InteractionRequiredAuthError) {
      // Session expired, consent needed, or MFA required: send the user to sign in.
      await instance.acquireTokenRedirect({ account, scopes: [apiScope] });
      throw new Error('Redirecting to sign in');
    }
    throw error;
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}
```

### Notes

- Send `result.accessToken`, **never** `result.idToken`. The ID token's audience and claims fail the API's checks.
- Request only `apiScope` here. A token can be for one resource only, so Microsoft Graph scopes need a separate token request.
- **Every** API call in components must use `apiFetch`, not `fetch`. A plain `fetch` to a protected route returns 401. The one exception is `/api/auth-config` in `main.tsx`, which is public.

## 7. `src/auth/AuthenticationGate.tsx`

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { apiFetch } from './apiFetch';
import { apiScope } from './entra';

export default function AuthenticationGate({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const [error, setError] = useState<string | null>(null);
  const [authorizedAccountId, setAuthorizedAccountId] = useState<string | null>(null);
  const redirectStarted = useRef(false);
  const account = instance.getActiveAccount() ?? accounts[0];

  // 1. No signed-in account: start the redirect once, after MSAL is idle.
  useEffect(() => {
    if (inProgress !== InteractionStatus.None || account || redirectStarted.current) return;
    redirectStarted.current = true;
    void instance.loginRedirect({ scopes: [apiScope] }).catch((loginError: unknown) => {
      console.error('Entra sign-in failed:', loginError);
      setError('Sign-in could not be started. Please refresh the page or contact support.');
    });
  }, [account, inProgress, instance]);

  // 2. Signed in: ask the API whether this user is allowed.
  useEffect(() => {
    if (!account || inProgress !== InteractionStatus.None) return;
    instance.setActiveAccount(account);
    let active = true;

    void apiFetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          if (active) setError(response.status === 403
            ? 'Your account is not a member of <GROUP_NAME>.'
            : 'Your access could not be verified. Please sign in again or contact support.');
          return;
        }
        if (active) setAuthorizedAccountId(account.homeAccountId);
      })
      .catch((authorizationError: unknown) => {
        console.error('Entra authorization check failed:', authorizationError);
        if (active) setError('Your access could not be verified. Please refresh the page or contact support.');
      });

    return () => {
      active = false;
    };
  }, [account, inProgress, instance]);

  if (error) return <p role="alert">{error}</p>;
  if (!account) return <p role="status">Redirecting to Microsoft sign-in...</p>;
  if (authorizedAccountId !== account.homeAccountId) return <p role="status">Verifying <GROUP_NAME> access...</p>;
  return children;
}
```

### Notes

- **`inProgress` check:** MSAL throws `interaction_in_progress` if a second login starts while a redirect is being processed. Waiting for `InteractionStatus.None` prevents this.
- **`redirectStarted` ref:** stops a second redirect under React `StrictMode`, which runs effects twice in development.
- **`/api/health` as the access check:** reuses the API's own scope and group checks, so the client and server can't disagree.
- **Messages:** use plain `...` or save the file as UTF-8. A `…` character saved in the wrong encoding shows up as `â€¦`.

## 8. `src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import App from './App';
import AuthenticationGate from './auth/AuthenticationGate';
import { setApiAuthorizationEnabled } from './auth/apiFetch';
import { getMsalInstance } from './auth/entra';
import './index.css';

export function mountApp(root: HTMLElement | null, authorizationEnabled: boolean): void {
  if (!root) return;

  if (!authorizationEnabled) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    return;
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <MsalProvider instance={getMsalInstance()}>
        <AuthenticationGate>
          <App />
        </AuthenticationGate>
      </MsalProvider>
    </React.StrictMode>
  );
}

if (typeof document !== 'undefined') {
  // Public endpoint: plain fetch, no token.
  void fetch('/api/auth-config')
    .then(async (response) => {
      if (!response.ok) throw new Error(`Auth configuration request failed: ${response.status}`);
      const config: unknown = await response.json();
      if (typeof config !== 'object' || config === null || !('authorizationEnabled' in config)
        || typeof config.authorizationEnabled !== 'boolean') {
        throw new Error('Auth configuration response was invalid');
      }

      setApiAuthorizationEnabled(config.authorizationEnabled);

      if (!config.authorizationEnabled) {
        mountApp(document.getElementById('root'), false);
        return;
      }

      // Must finish before rendering. MsalProvider then handles the redirect response.
      await getMsalInstance().initialize();
      mountApp(document.getElementById('root'), true);
    })
    .catch((error: unknown) => {
      console.error('Application authentication configuration failed:', error);
      const root = document.getElementById('root');
      if (root) root.textContent = 'The application could not load its authentication settings. Please contact support.';
    });
}
```

### Notes

- The server's `AUTHORIZATION_ENABLED` setting controls the client too, so the two can't get out of step.
- `initialize()` must complete before any other MSAL call.
- The `typeof document` guard lets tests import this module in Node without starting the app.

## 9. Automated tests

The tests use Node's test runner through `tsx`, so they run without a browser or a running API.

`package.json` script:

```json
"scripts": {
  "test": "tsx --test tests/*.test.js"
}
```

Run:

```
npm --workspace <APP_PACKAGE> test
npx tsx --test tests/auth.test.js
```

### `tests/auth.test.js`

Auth tests kept separate from the app's helper tests (`App.test.js`), so auth failures are easy to spot.

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiFetch, setApiAuthorizationEnabled } from '../src/auth/apiFetch.ts';
import { getRedirectUri } from '../src/auth/entra.ts';

test('apiFetch makes ordinary requests when API authorization is disabled', async () => {
  const originalFetch = globalThis.fetch;
  const expectedResponse = new Response('ok', { status: 200 });
  let called = false;

  globalThis.fetch = async (input, init) => {
    called = true;
    assert.equal(input, '/api/example');
    assert.deepEqual(init, { method: 'GET' });
    return expectedResponse;
  };

  try {
    setApiAuthorizationEnabled(false);
    assert.equal(await apiFetch('/api/example', { method: 'GET' }), expectedResponse);
    assert.equal(called, true);
  } finally {
    setApiAuthorizationEnabled(true);
    globalThis.fetch = originalFetch;
  }
});

test('getRedirectUri exactly matches the Entra-registered root redirect URI', () => {
  assert.equal(getRedirectUri('<PROD_URL_WITHOUT_SLASH>'), '<PROD_URL_WITHOUT_SLASH>/');
  assert.equal(getRedirectUri('<DEV_URL>'), '<DEV_URL>');
});
```

`<PROD_URL_WITHOUT_SLASH>` is the production URL without the trailing slash, for example `https://app.example.com`.

### `tests/vite.config.test.js`

Protects the dev port (must match the redirect URI) and the API proxy.

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../vite.config.ts';

test('Vite config exposes the API proxy and development port', () => {
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.proxy['/api'].target, 'http://localhost:<API_PORT>');
  assert.equal(config.server.strictPort, false);
});
```

If you set `strictPort: true`, update the last assertion.

### `tests/vite-env.test.js` and `tests/main.test.js`

```js
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

test('Vite environment declarations are present for the frontend build', () => {
  assert.equal(existsSync(new URL('../src/vite-env.d.ts', import.meta.url)), true);
});
```

```js
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

test('the application entrypoint and stylesheet are present', () => {
  assert.equal(existsSync(new URL('../src/main.tsx', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/index.css', import.meta.url)), true);
});
```

### What the automated tests don't cover

They check `apiFetch` with authorization **off** and the redirect URI format. They don't cover:

- Sign-in redirects, token acquisition, or the `Bearer` header being added (these need real MSAL and a browser)
- `AuthenticationGate` rendering and its 403 message
- Real tokens accepted by the API

To test `apiFetch` with authorization **on**, refactor it to accept the MSAL instance as a parameter (the same way the API middleware accepts `verifyToken`), then pass a fake object with `getActiveAccount` and `acquireTokenSilent`. Component tests for `AuthenticationGate` need a DOM test library such as Testing Library with a mocked `useMsal`.

Until then, use the manual checks below.

## 10. Manual test checklist

Start the API with `AUTHORIZATION_ENABLED=true`, then `npm run dev`. Use `<DEV_URL>`, not the network address.

| # | Scenario | Expected |
|---|---|---|
| 1 | Open `<DEV_URL>` in a fresh tab | Redirect to Microsoft sign-in, then back to the app |
| 2 | DevTools → Network → `/api/auth-config` | 200, `{ "authorizationEnabled": true }`, no `Authorization` header |
| 3 | DevTools → Network → `/api/health` | 200, request has `Authorization: Bearer …` |
| 4 | Decode that token at https://jwt.ms | `ver` `2.0`, `aud` `<CLIENT_ID>`, `scp` `<SCOPE_NAME>`, `groups` contains the group ID |
| 5 | Use the app (load lists, save changes) | All `/api/...` calls succeed and carry the Bearer header |
| 6 | Sign in as a user **not** in `<GROUP_NAME>` | Blocked at sign-in (Assignment required) or "not a member of `<GROUP_NAME>`" |
| 7 | Leave the tab open past token expiry (≈60–90 min), then act | Token refreshes silently; no error |
| 8 | Close the tab and reopen | Signs in again (sessionStorage cleared); usually no password prompt |
| 9 | Server `AUTHORIZATION_ENABLED=false`, restart both | App loads without sign-in; requests have no Bearer header |
| 10 | Stop the API and reload | "could not load its authentication settings" message |

Then run the build:

```
npm --workspace <APP_PACKAGE> test
npm --workspace <APP_PACKAGE> run build
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| AADSTS50011 redirect URI mismatch | Origin not registered as an SPA redirect URI; trailing slash, port, or http/https mismatch; using a network address; Vite moved to another port |
| AADSTS65001 / "Need admin approval" | Consent not granted for the API scope; ask an admin to grant it |
| Sign-in uses an old app | Fallback IDs in `entra.ts` or `.env` not updated, or Vite not restarted; clear sessionStorage |
| `interaction_in_progress` | A second login started during a redirect; check the `inProgress` guard |
| Endless redirect loop | Redirect URI points to a route that doesn't load the app, or `initialize()` isn't awaited |
| 401 from API | `idToken` sent instead of `accessToken`, wrong `VITE_ENTRA_API_SCOPE`, or a component uses `fetch` instead of `apiFetch` |
| 403 "Required API scope is missing" | Client scope doesn't match the API's `ENTRA_API_SCOPE` |
| "not a member of `<GROUP_NAME>`" | Group not assigned to the enterprise app, or user not a direct member |
| `"AccountEntity" is not exported` | Mismatched `msal-browser`/`msal-react` versions (see section 1) |
| `â€¦` in messages | File not saved as UTF-8 |
