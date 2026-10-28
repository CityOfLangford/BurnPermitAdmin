# API Tests

These tests cover the Permit Admin API without requiring a live SQL Server connection. Database-dependent service tests inject a small fake pool and assert the procedure name, parameters, and normalized results.

## Run the tests

From the repository root:

```bash
npm --workspace packages/permitAdminAPI test
```

From this directory:

```bash
npm test --prefix ..
```

Run a single test file from the API package directory:

```bash
npx tsx --test tests/permitService.test.js
npx tsx --test tests/server.test.js
```

The API package script is:

```text
tsx --test tests/*.test.js
```

## Current test files

- `db.test.js` verifies safe database configuration defaults and SQL type availability.
- `mssql.test.js` verifies the local MSSQL declaration surface used by the TypeScript build.
- `permitService.test.js` covers integer/date parsing, sort normalization, sorting, pagination, permit-period lookup, open-burn submission, Campfire submission, status conversion, and permit updates.
- `server.test.js` covers query parameter normalization and the `/health` endpoint.

## Test boundaries

Service tests use an injected `poolFactory` rather than connecting to SQL Server. This keeps unit tests deterministic and verifies that the application calls the expected procedures:

- `dbo.colsp_ListPermits`
- `dbo.colsp_GetPermitPeriods`
- `dbo.colsp_SubmitOpenBurnPermitApplication`
- `dbo.colsp_SubmitCampfirePermitApplication`
- `dbo.colsp_UpdatePermit`

The tests do not prove that those procedures exist or that their SQL works against a real database. Apply the SQL scripts in `../sql/` to a test database and run an integration check before deployment.

## Updating tests

When changing a service function:

1. Add or update a focused test in `permitService.test.js`.
2. Assert procedure names and every important bound input.
3. Include valid, invalid, null, and boundary values where applicable.
4. Keep the fake pool isolated from other tests.
5. Run the API test command and API build.

When changing a route, add request/response coverage to `server.test.js`. If route dependencies need to be mocked, introduce a small dependency seam instead of connecting to production services from a unit test.

## Useful resources

- [Node.js test runner documentation](https://nodejs.org/api/test.html)
- [Node.js assertions documentation](https://nodejs.org/api/assert.html)
- [Martin Fowler: Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Martin Fowler: Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html)
- [Microsoft: SQL Server testing guidance](https://learn.microsoft.com/sql/relational-databases/testing/testing-sql-server-databases)

## Related documentation

- [API package README](../README.md)
- [Repository README](../../../README.md)
