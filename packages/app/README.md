# Permit Admin App

The app is a React and Vite front end for browsing and creating burn permits through
the Permit Admin API.

## User interface

The main screen presents permits in a responsive table with:

- Permit date, number, applicant, address, type, and status columns
- Column sorting with ascending and descending directions
- Page-size choices of `10`, `25`, `100`, `200`, and `500`
- Pagination controls and a result-count summary
- Loading, empty, and API error states
- A New permit modal for open-burn and campfire applications
- Clickable permit rows with read-only detail views
- Edit, cancel, and save actions for existing permits

Dates are formatted for the user's locale, and missing values are displayed as an
em dash.

The New permit form collects applicant contact information, address, permit period,
and requested date. Open Burn permits select a period from the API-provided list.
Selecting Campfire displays a start-time selector for every hour from `00:00` through
`21:00`; the end time is derived three hours later. A successful submission closes the
modal and refreshes the permit table; an ineligible submission keeps the form open and
displays the API response.

The main list prefixes Campfire and Open Burn types with visual markers and displays
cancelled statuses in bold red. Clicking a row opens a read-only detail view. Edit
enables the fields, Cancel discards changes, and Save persists them through the API.

## Pages and implementation

- `src/App.tsx` provides the application layout, sidebar navigation, and hash-based
  page selection. All Permits is the default page.
- `src/components/AllPermits.tsx` owns the All Permits table state, API request lifecycle,
  sorting controls, pagination, modal state, form serialization, and submission feedback.
- `src/components/campfire.tsx`, `src/components/openburn.tsx`,
  `src/components/blackoutdates.tsx`, `src/components/periods.tsx`,
  `src/components/availability.tsx`, and `src/components/systemconfigs.tsx` provide
  separate shells for the corresponding management pages.
- `src/components/PageShell.tsx` provides shared page framing for those components.
- `src/index.css` provides the table layout, responsive behavior, modal form, and
  loading/error presentation.
- `src/main.tsx` mounts the React application.
- `vite.config.ts` configures the development server and proxies `/api` to
  `http://localhost:3001`.
- `tests/App.test.js` tests date formatting, query serialization, page generation,
  sort toggling, new permit payload construction, Campfire time derivation, and
  Open Burn period filtering.

The client sends `page`, `pageSize`, `sortField`, and `sortDirection` with each
permit request. The API's pagination response determines the available page buttons
and whether Previous or Next is enabled.

## Commands

Run from the repository root or this package directory:

```bash
npm run dev      # start Vite on port 5173
npm run build    # create the production build
npm test         # run app tests
npm run preview  # preview the production build on port 4173
```

These commands run from `packages\app`. From the repository root, use
`npm --workspace packages/app run dev`, `npm --workspace packages/app run build`,
or `npm --workspace packages/app test`.

The app expects the API to be running at `http://localhost:3001` during development.
Copy `.env.example` to `.env` before running or building the client. The app uses
the single-tenant Entra registration and requests the `AccessBurnPermitAdmin` API
scope. It does not render the application until the protected API health check
confirms group authorization. Production builds must receive the corresponding
`VITE_ENTRA_*` variables.

The PM2 app process runs `serve.mjs`, which serves the production build on port
50111 and proxies `/api` requests to the API on port 3001. The production build
also copies `public/web.config` into `dist`. On IIS, install URL Rewrite and ARR,
enable proxying in ARR, and set the site's physical path to the app's `dist`
directory. The IIS rules forward `/api` requests to the API on port 3001 and all
other requests to the PM2 app on port 50111.
