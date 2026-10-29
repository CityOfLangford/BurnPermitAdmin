# Permit Admin

Permit Admin is an npm-workspaces monorepo for viewing and creating burn permits
in a sortable, paginated React table. It consists of an Express API backed by SQL
Server and a Vite-served React client.

## Project structure

- `packages/api` - Express API, SQL Server access, permit mapping, sorting, and pagination.
- `packages/app` - React/Vite user interface for browsing permit data.

See the package READMEs for implementation details:

- [API README](packages/api/README.md)
- [App README](packages/app/README.md)

## Prerequisites

- Node.js 18 or later
- A SQL Server instance containing the permit tables and these stored procedures: `dbo.colsp_ListPermits`, `dbo.colsp_SubmitOpenBurnPermitApplication`, `dbo.colsp_SubmitCampfirePermitApplication`, `dbo.colsp_GetPermitPeriods`, and `dbo.colsp_UpdatePermit`.

## Setup

Install dependencies from the repository root:

```bash
npm install
```

Create the API environment file and set the database values. In Windows Command Prompt:

```bat
copy packages\api\.env.example packages\api\.env
copy packages\app\.env.example packages\app\.env
```

Keep `AUTHORIZATION_ENABLED=true` in the API environment outside isolated local
development and tests. The app uses the existing Entra registration and requires
membership in the `BurnPermitAdmins` group. See the package READMEs for registration
configuration and environment settings.

## Run locally

Start the API and app together:

```bash
npm run dev
```

The API is available at `http://localhost:3001`; the app is available at
`http://localhost:5173`. The app proxies `/api` requests to the API.

To run one workspace independently:

```bash
npm run api
npm run app
```

## Build

Build the front end for production:

```bash
npm run build
```

The API can be compiled separately with `npm --workspace packages/permitAdminAPI run build`.

## Test

Run all API and app tests from the root:

```bash
npm test
```

Run a single package's tests:

```bash
npm --workspace packages/permitAdminAPI test
npm --workspace packages/permitAdminAPP test
```

## API overview

`GET /api/permits` accepts optional `systemId`, `startDate`, and `endDate` filters,
plus `page`, `pageSize`, `sortField`, and `sortDirection` controls. Supported page
sizes are `10`, `25`, `100`, `200`, and `500`.

`POST /api/permits` creates an open-burn or campfire application, and
`PUT /api/permits/:id` updates an existing permit. `GET /api/permit-periods` returns
the period options used by Open Burn forms. The API also exposes `GET /health`.

The API executes `dbo.colsp_ListPermits`, maps the result into the public permit
shape, then applies sorting and pagination in JavaScript. New applications are
checked and saved by the corresponding SQL Server stored procedure.
