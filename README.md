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
cd packages\api
npm run dev
```

In a second terminal, start the app:

```bash
cd packages\app
npm run dev
```

The root `npm run api` and `npm run app` commands are also available.

## Build

Build the API and front end for production:

```bash
npm run build
```

Start the compiled API and static app with PM2 from any working directory:

```bash
pm2 start ecosystem.config.js --env production
```

The API runs two clustered workers. The app runs as one PM2 process on port
`50111`; it serves the production build and proxies `/api/*` to the API on port
`3001`, so PM2 can serve the complete app without IIS. Port `5173` is only used
while the Vite development server is running.

The API reads `packages\api\.env`; the front end's `VITE_ENTRA_*` settings are
embedded at build time from `packages\app\.env`.

## Production routing on IIS

The app build includes an IIS `web.config` that forwards `/api` and `/api/*` to
the API on port `3001` and other requests to the PM2 app on port `50111`.
Configure the IIS site's physical path as `packages\app\dist` and install the
IIS URL Rewrite and Application Request Routing (ARR) modules. Enable proxying
in ARR so IIS can forward requests to the local PM2 processes. The API route
preserves `/api` paths and query strings; both proxy targets use localhost.

## Test

Run all API and app tests from the root:

```bash
npm test
```

Run a single package's tests:

```bash
npm --workspace packages/api test
npm --workspace packages/app test
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
