# App Tests

These tests cover the React/Vite application’s pure helpers, entrypoint files, Vite configuration, and request-shaping behavior. They run with Node’s test runner through `tsx`; they do not require a browser or a running API.

## Run the tests

From the repository root:

```bash
npm --workspace packages/permitAdminAPP test
```

From this directory:

```bash
npm test --prefix ..
```

Run a single test file from the app package directory:

```bash
npx tsx --test tests/App.test.js
npx tsx --test tests/main.test.js
npx tsx --test tests/vite.config.test.js
```

The app package script is:

```text
tsx --test tests/*.test.js
```

## Current test files

- `App.test.js` covers date formatting, list query serialization, pagination numbers, sorting, New Permit payloads, Campfire period `14`, Campfire end-time calculation, permit type markers, cancelled status detection, and Open Burn period filtering.
- `main.test.js` verifies that the application entrypoint and stylesheet exist.
- `vite-env.test.js` verifies the Vite client type declaration is present.
- `vite.config.test.js` verifies the development port and API proxy configuration.

## Test boundaries

The current suite is intentionally focused on deterministic application logic and configuration. It does not render the React component tree or exercise browser clicks, native form validation, modal transitions, or real network requests.

For interactive behavior, manually verify these workflows against the running API:

- Open and close the New Permit modal.
- Switch between Open Burn and Campfire and confirm the field positions stay stable.
- Confirm Open Burn shows only TypeID `1` period options.
- Confirm Campfire shows start hours `00:00` through `21:00` and derives the end time three hours later.
- Click a list row, enter edit mode, cancel edits, and save edits.
- Confirm cancelled rows are bold red and permit type markers are displayed.

## Updating tests

When changing a helper or request contract, update `App.test.js` with the smallest focused case that demonstrates the new behavior. Include boundary cases such as an hour of `0`, an hour of `21`, blank optional contact fields, and switching permit types.

When changing rendered markup or interaction behavior, consider adding a component test with a DOM-capable test library. Keep configuration and pure-helper tests separate from browser-level tests so failures remain easy to diagnose.

Run the app test command and production build after changes:

```bash
npm --workspace packages/permitAdminAPP test
npm --workspace packages/permitAdminAPP run build
```

## Useful resources

- [Node.js test runner documentation](https://nodejs.org/api/test.html)
- [React testing overview](https://react.dev/learn/testing)
- [Testing Library documentation](https://testing-library.com/docs/)
- [Testing Library: guiding principles](https://testing-library.com/docs/guiding-principles/)
- [Martin Fowler: Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [MDN: HTML constraint validation](https://developer.mozilla.org/docs/Web/HTML/Constraint_validation)

## Related documentation

- [App package README](../README.md)
- [Repository README](../../../README.md)
