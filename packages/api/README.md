# Permit Admin API

The API is a TypeScript Express service that exposes permit data from SQL Server
to the Permit Admin app.

## Responsibilities

- Starts an Express server on port `3001` by default.
- Enables CORS and JSON request handling.
- Provides `GET /health` for a lightweight status check.
- Provides `GET /api/permits` for filtered, sorted, paginated permits.
- Provides `POST /api/permits` for new open-burn and campfire applications.
- Provides `PUT /api/permits/:id` for updating editable permit details.
- Provides `GET /api/permit-periods` for the current Open Burn permit period options.
- Calls the existing `dbo.colsp_ListPermits` stored procedure through `mssql`.
- Calls `dbo.colsp_SubmitOpenBurnPermitApplication` or
    `dbo.colsp_SubmitCampfirePermitApplication` when creating a permit.

## Configuration

Copy `.env.example` to `.env` and set the database connection values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port for the API |
| `DB_HOST` | `localhost` | SQL Server host |
| `DB_PORT` | `1433` | SQL Server port |
| `DB_NAME` | none | Database name |
| `DB_USER` | none | Database user |
| `DB_PASSWORD` | none | Database password |
| `DB_ENCRYPT` | `true` | Enable encrypted SQL connections |
| `DB_TRUST_SERVER_CERTIFICATE` | `true` | Trust the SQL Server certificate |

The database must provide `dbo.colsp_ListPermits` with `systemId`, `startDate`,
and `endDate` parameters, plus the two submission procedures and the checked-in
`colsp_GetPermitPeriods` and `colsp_UpdatePermit` procedures.

## Implementation

- `server.ts` owns Express setup, request normalization, routes, and server startup.
- `config/db.ts` builds the `mssql` connection configuration and exposes the SQL client.
- `services/permitService.ts` executes the stored procedure, maps nullable database fields,
    validates query values, sorts rows, calculates pagination metadata, and binds new
    permit applications to the appropriate submission procedure.
- `sql/colsp_UpdatePermit.sql` contains the table-aligned update procedure definition
    used by `updatePermit`.
- `sql/colsp_GetPermitPeriods.sql` contains the procedure used to return all relevant
    Open Burn and Campfire period definitions.
- `tests/` covers query normalization, database defaults, service behavior, and the health route.

Sorting is restricted to the known permit fields and defaults to `PermitDate` descending.
Supported page sizes are `10`, `25`, `100`, `200`, and `500`; invalid page sizes fall
back to `10`. Requested pages are clamped to the available range.

## Commands

Run from the repository root or this package directory:

```bash
npm run dev       # watch and run with tsx
npm run build     # compile TypeScript to dist/
npm test          # run API tests
npm start         # run the compiled server
```

## Endpoint example

```text
GET /api/permits?page=1&pageSize=20&sortField=PermitDate&sortDirection=desc
```

The response contains `data`, `pagination`, and the normalized `sort` settings.

## Create permit endpoint

`POST /api/permits` accepts JSON with these required fields:

| Field | Description |
| --- | --- |
| `permitType` | `open-burn` or `campfire` |
| `permitPeriod` | Integer permit period identifier |
| `streetNumber`, `streetName` | Permit address |
| `firstName`, `lastName` | Applicant name |
| `phoneNumber`, `email` | Applicant contact details |
| `requestedDate` | Requested date in ISO format, such as `2026-08-25` |
| `permitStartTime`, `permitEndTime` | Required integer time values for campfire permits |

Example open-burn request:

```json
{
    "permitType": "open-burn",
    "permitPeriod": 14,
    "streetNumber": "1234",
    "streetName": "Main St",
    "firstName": "Ted",
    "lastName": "Corpus",
    "phoneNumber": "123-123-1234",
    "email": "ted@example.com",
    "requestedDate": "2026-08-25"
}
```

The response contains `eligibility` and `permit` result objects. A non-null
`permit` indicates that the application was created or an existing matching permit
was returned. When no permit is available, the eligibility response explains why.

## Update permit endpoint

`PUT /api/permits/:id` executes `dbo.colsp_UpdatePermit` with the applicant,
contact, address, date, status, permit type, and period values. The endpoint returns
`204` when the update succeeds.

Open Burn period options are loaded through `dbo.colsp_GetPermitPeriods` and filtered
to `TypeID = 1` by the client. Campfire permits use period `14` and do not require a
period selection; their start time must be an integer from `0` through `21`, with the
end time exactly three hours later.
