# Entra ID App Registration Setup – SPA + API with Group Authorization

Guide for setting up a React SPA (MSAL) and an Express API (`jose`) secured with Entra ID access tokens and group membership.

Replace the `<PLACEHOLDERS>` with real values. The **Reference** column records the values used for Burn Permit Admin.

## Values to collect

| Placeholder | Description | Reference (Burn Permit Admin) |
|---|---|---|
| `<APP_NAME>` | App registration display name | Burn Permit Admin |
| `<TENANT_ID>` | Directory (tenant) ID | `e6daa991-402f-46f2-b53b-09367f7d9ea8` |
| `<CLIENT_ID>` | Application (client) ID | `702e2464-dd84-41db-8bf1-a2cdcf806cb2` |
| `<GROUP_NAME>` | Security group allowed to use the app | BurnPermitAdmins |
| `<GROUP_ID>` | Group object ID | `aee60979-dcc2-4d85-9a1b-ca7fb86da40d` |
| `<SCOPE_NAME>` | Delegated API scope | `AccessBurnPermitAdmin` |
| `<DEV_URL>` | Local dev URL | `http://localhost:5173/` |
| `<TEST_URL>` | Test site URL | `https://dev-burnadmin.langford.ca` |
| `<PROD_URL>` | Production URL | `https://burn-admin.langford.ca` |

## How it works

1. The React app signs the user in with MSAL and requests an access token for `api://<CLIENT_ID>/<SCOPE_NAME>`.
2. The React app sends that token to the API in the `Authorization: Bearer <token>` header.
3. The API uses `jose` to verify the token's signature (from Entra's public keys), issuer, audience and expiry.
4. The API then checks that `scp` contains `<SCOPE_NAME>` (403 if missing) and that `groups` contains `<GROUP_ID>` (403 if missing).

One app registration serves as both the SPA client and the API. Use a separate API registration only if other clients will call the API.

## 1. Create the app registration

**Entra admin center → Entra ID → App registrations → + New registration**

- [ ] Name: `<APP_NAME>`
- [ ] Supported account types: **Single tenant** (`AzureADMyOrg`)
- [ ] Redirect URI: platform **Single-page application (SPA)**, URI `<DEV_URL>`
- [ ] Record `<CLIENT_ID>` and `<TENANT_ID>` from **Overview**

> Create a new registration rather than reusing an old one. The same redirect URIs can exist on several registrations without conflict.

## 2. Authentication

**App registration → Authentication**

- [ ] Platform: **Single-page application** only. Don't add a Web platform.
- [ ] Add every redirect URI the app uses:
  - [ ] `<DEV_URL>` (include the trailing slash if MSAL's `redirectUri` uses one, because the match is exact)
  - [ ] `<TEST_URL>`
  - [ ] `<PROD_URL>`
- [ ] Leave implicit grant (access tokens and ID tokens) **unchecked**

> Plain `http` is only accepted for `localhost`. Network addresses such as `http://10.x.x.x:5173` fail with **AADSTS50011** unless registered, and need `https`.

## 3. Certificates & secrets

- [ ] Leave this **empty**. A SPA with a token-validating API needs no client secret.

## 4. Expose an API

**App registration → Expose an API**

- [ ] Application ID URI: **Add** and accept `api://<CLIENT_ID>`
- [ ] **+ Add a scope**:

| Field | Value |
|---|---|
| Scope name | `<SCOPE_NAME>` |
| Who can consent | Admins and users |
| Admin consent display name | Access `<APP_NAME>` API |
| Admin consent description | Allows the app to access the `<APP_NAME>` API on behalf of the signed-in user. |
| User consent display name | Access `<APP_NAME>` |
| User consent description | Allows the app to access `<APP_NAME>` on your behalf. |
| State | Enabled |

- [ ] Optional: **+ Add a client application** with `<CLIENT_ID>` and tick the scope, so users don't see a consent prompt

> The scope name appears in the token's `scp` claim and must exactly match `ENTRA_API_SCOPE` on the server and the scope requested by the client. To rename a scope later, disable it, save, delete it, then create the new one.

## 5. Manifest

**App registration → Manifest**

- [ ] Set the access token version to 2:
  - New format: `"api": { "requestedAccessTokenVersion": 2 }`
  - Old format: `"accessTokenAcceptedVersion": 2`

> If this stays `null`, Entra issues v1 tokens with issuer `https://sts.windows.net/<TENANT_ID>/`, and the API's v2.0 issuer check fails with 401.

## 6. Token configuration (groups claim)

**App registration → Token configuration → + Add groups claim**

- [ ] Group types: **Groups assigned to the application** only
  - Leave **Security groups**, **Directory roles** and **All groups** unchecked
- [ ] Token properties (ID, Access, SAML): **Group ID**
- [ ] **Emit groups as role claims**: leave unchecked, because the server reads `groups`, not `roles`
- [ ] Check the manifest: `"groupMembershipClaims": "ApplicationGroup"`

> "Groups assigned to the application" avoids the groups overage problem. Users in more than ≈200 groups otherwise get no `groups` claim and fail the check.

## 7. API permissions

**App registration → API permissions**

| API | Permission | Type | Purpose |
|---|---|---|---|
| Microsoft Graph | `openid` | Delegated | Sign-in |
| Microsoft Graph | `profile` or `User.Read` | Delegated | User's name and username |
| `<APP_NAME>` (APIs my organization uses) | `<SCOPE_NAME>` | Delegated | Call the API |

- [ ] **+ Add a permission → APIs my organization uses → `<APP_NAME>` → Delegated → `<SCOPE_NAME>`** (only appears after step 4)
- [ ] Do **not** add `GroupMember.Read.All`, SharePoint or any Application permissions
- [ ] **Grant admin consent for `<TENANT>`**. If the button is greyed out or fails, ask an Azure admin to grant it once.

## 8. Enterprise application (group assignment)

The enterprise app (service principal) is created automatically with the registration.

**Open it:** App registration → **Overview** → **Managed application in local directory** link
(or **Entra ID → Enterprise apps → All applications**, clearing the Application type filter)

- [ ] **Users and groups → + Add user/group → Users and groups → None Selected**
  - [ ] Search for and select `<GROUP_NAME>` → **Select**
  - [ ] Role: **Default Access** → **Assign**
- [ ] **Properties → Assignment required? = Yes → Save**

> - Assigning groups requires Entra ID P1/P2.
> - You need Application Administrator, Cloud Application Administrator, or owner of the app.
> - Users must be **direct** members of the group; nested group membership is not honoured.
> - Without this assignment, the `groups` claim is empty and every user gets 403.

## 9. Server configuration (API)

`packages/api/.env`

```
AUTHORIZATION_ENABLED=true
ENTRA_TENANT_ID=<TENANT_ID>
ENTRA_CLIENT_ID=<CLIENT_ID>
ENTRA_GROUP_ID=<GROUP_ID>
ENTRA_API_SCOPE=<SCOPE_NAME>
```

- [ ] Update the hardcoded defaults in `auth/authorization.ts` (`defaultClientId`, scope default) so a missing `.env` doesn't fall back to an old app
- [ ] Update the expected defaults in `authorization.test.js` and run the tests
- [ ] Keep `.env` in `.gitignore`
- [ ] Never run production with `AUTHORIZATION_ENABLED=false`

What the middleware checks:

| Check | Failure |
|---|---|
| `Authorization: Bearer` header present | 401 |
| Signature valid (RS256, Entra JWKS) | 401 |
| `iss` = `https://login.microsoftonline.com/<TENANT_ID>/v2.0` | 401 |
| `aud` = `<CLIENT_ID>` or `api://<CLIENT_ID>` | 401 |
| Token not expired | 401 |
| `scp` contains `<SCOPE_NAME>` | 403 |
| `groups` contains `<GROUP_ID>` | 403 |

## 10. Client configuration (React / MSAL)

`packages/app/.env`

```
VITE_ENTRA_TENANT_ID=<TENANT_ID>
VITE_ENTRA_CLIENT_ID=<CLIENT_ID>
VITE_ENTRA_API_SCOPE=api://<CLIENT_ID>/<SCOPE_NAME>
```

- [ ] Update the fallbacks in `auth/entra.ts` to the new client ID and scope
- [ ] MSAL `redirectUri` must exactly match a registered SPA redirect URI (trailing slash included)
- [ ] `apiFetch` sends `result.accessToken`, **not** the ID token
- [ ] Restart Vite after changing `.env` (it only reads `.env` at startup)
- [ ] Clear session storage or close the tab to drop accounts cached from an old app

> **Dependency note:** keep `@azure/msal-browser` and `@azure/msal-react` on matching major versions. In an npm workspace, `mssql` → `tedious` → `@azure/identity` can hoist a newer `msal-browser` to the root, causing `"AccountEntity" is not exported`. Fix it from the workspace root:
>
> ```
> npm install @azure/msal-browser@latest @azure/msal-react@latest -w packages/app
> npm ls @azure/msal-browser @azure/msal-react
> ```
>
> Then delete `packages/app/node_modules/.vite` and restart Vite.

## 11. Verify

- [ ] Open `<DEV_URL>`; you're redirected to Microsoft sign-in and back
- [ ] DevTools → Network → an `/api/...` request → copy the Bearer token → decode it at https://jwt.ms
- [ ] Confirm the claims:

| Claim | Expected |
|---|---|
| `ver` | `"2.0"` |
| `iss` | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` |
| `aud` | `<CLIENT_ID>` |
| `scp` | `<SCOPE_NAME>` |
| `groups` | contains `<GROUP_ID>` |

- [ ] A group member gets 200; a non-member gets 403 (or is blocked at sign-in by Assignment required)

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| 401 on every call, issuer error | Token version is v1; set `requestedAccessTokenVersion: 2` |
| 401, audience error | Client is sending a Graph token or the ID token, not a token for `api://<CLIENT_ID>/<SCOPE_NAME>` |
| 403 "Required API scope is missing" | Scope name mismatch between Entra, the server `.env` and the client |
| 403 group membership required | Group not assigned to the enterprise app, user not a direct member, or "Emit groups as role claims" ticked |
| AADSTS50011 | Redirect URI not registered (check trailing slash, port, http vs https) |
| "Need admin approval" | Tenant blocks user consent; an admin must grant consent |
| Sign-in uses the old app | Fallback client ID in code or stale session storage |

## Retiring an old registration

- [ ] Confirm nothing still uses it (check sign-in logs on the enterprise app)
- [ ] Delete its client secrets first
- [ ] Remove high-privilege permissions (for example SharePoint `Sites.FullControl.All`, `GroupMember.Read.All`)
- [ ] Delete the registration
