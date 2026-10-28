import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPermitApplication, buildPermitQueryParams, formatDate, formatPermitType, getCampfireEndTime, getPageNumbers, getOpenBurnPeriods, isCancelledStatus, printPermit, shouldShowTopPagination, toggleSort } from '../src/App.tsx';

test('formatDate handles empty, invalid, and valid dates', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate('not-a-date'), 'not-a-date');
  assert.equal(formatDate('2024-01-02'), new Date('2024-01-02').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
});

test('buildPermitQueryParams serializes the current table state', () => {
  assert.equal(buildPermitQueryParams(2, 50, 'Applicant', 'asc').toString(), 'page=2&pageSize=50&sortField=Applicant&sortDirection=asc');
});

test('getPageNumbers handles empty and multi-page results', () => {
  assert.deepEqual(getPageNumbers(0), []);
  assert.deepEqual(getPageNumbers(3), [1, 2, 3]);
  assert.deepEqual(getPageNumbers(179, 1), [1, 2, 3, 4, 5, 'ellipsis', 179]);
  assert.deepEqual(getPageNumbers(179, 90), [1, 'ellipsis', 89, 90, 91, 'ellipsis', 179]);
  assert.deepEqual(getPageNumbers(179, 179), [1, 'ellipsis', 175, 176, 177, 178, 179]);
});

test('top pagination is hidden for requests of 10 rows or fewer', () => {
  assert.equal(shouldShowTopPagination(10), false);
  assert.equal(shouldShowTopPagination(25), true);
});

test('toggleSort flips the current column and resets a new column to ascending', () => {
  assert.deepEqual(toggleSort('Applicant', 'asc', 'Applicant'), { field: 'Applicant', direction: 'desc' });
  assert.deepEqual(toggleSort('Applicant', 'desc', 'PermitDate'), { field: 'PermitDate', direction: 'asc' });
});

test('buildPermitApplication creates the open-burn request payload', () => {
  assert.deepEqual(buildPermitApplication({
    permitType: 'open-burn',
    permitPeriod: '14',
    streetNumber: ' 1234 ',
    streetName: ' Main St ',
    firstName: ' Ted ',
    lastName: ' Corpus ',
    phoneNumber: '123-123-1234',
    email: 'ted@example.com',
    requestedDate: '2026-08-25',
    permitStartTime: '21',
    permitEndTime: '22',
  }), {
    permitType: 'open-burn',
    permitPeriod: 14,
    streetNumber: '1234',
    streetName: 'Main St',
    firstName: 'Ted',
    lastName: 'Corpus',
    phoneNumber: '123-123-1234',
    email: 'ted@example.com',
    requestedDate: '2026-08-25',
  });
});

test('buildPermitApplication includes times for campfire applications', () => {
  const application = buildPermitApplication({
    permitType: 'campfire',
    permitPeriod: '14',
    streetNumber: '1234',
    streetName: 'Main St',
    firstName: 'Ted',
    lastName: 'Corpus',
    phoneNumber: '123-123-1234',
    email: 'ted@example.com',
    requestedDate: '2026-08-25',
    permitStartTime: '21',
    permitEndTime: '22',
  });

  assert.equal(application.permitStartTime, 21);
  assert.equal(application.permitEndTime, 22);
});

test('buildPermitApplication always uses Campfire period 14', () => {
  const application = buildPermitApplication({
    permitType: 'campfire',
    permitPeriod: '37',
    streetNumber: '1234',
    streetName: 'Main St',
    firstName: 'Ted',
    lastName: 'Corpus',
    phoneNumber: '',
    email: '',
    requestedDate: '2026-08-25',
    permitStartTime: '18',
    permitEndTime: '21',
  });

  assert.equal(application.permitPeriod, 14);
});

test('getCampfireEndTime allows every valid start hour and derives a three-hour end', () => {
  assert.equal(getCampfireEndTime('0'), '3');
  assert.equal(getCampfireEndTime('21'), '24');
  assert.equal(getCampfireEndTime('-1'), '');
  assert.equal(getCampfireEndTime('22'), '');
});

test('formatPermitType prefixes permit types for the list', () => {
  assert.equal(formatPermitType({ TypeID: 2, PermitID: 1, PermitDate: null, PermitNumber: null, Applicant: null, PermitAddress: null, PermitType: 'Campfire', PermitStatus: null }), '🏕️ Campfire');
  assert.equal(formatPermitType({ TypeID: 1, PermitID: 2, PermitDate: null, PermitNumber: null, Applicant: null, PermitAddress: null, PermitType: 'Open Burn', PermitStatus: null }), '🍂 Open Burn');
});

test('isCancelledStatus recognizes cancelled list rows', () => {
  assert.equal(isCancelledStatus('Cancelled'), true);
  assert.equal(isCancelledStatus('Granted'), false);
});

test('printPermit delegates to the browser print dialog', () => {
  const originalWindow = globalThis.window;
  let printCalled = false;
  globalThis.window = { print: () => { printCalled = true; } };

  try {
    printPermit();
    assert.equal(printCalled, true);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('getOpenBurnPeriods excludes Campfire periods from the selector', () => {
  assert.deepEqual(getOpenBurnPeriods([
    { PeriodID: 14, Name: 'Campfire Period', StartDate: null, EndDate: null, TypeID: 2 },
    { PeriodID: 37, Name: 'fall 2024', StartDate: null, EndDate: null, TypeID: 1 },
  ]).map((period) => period.PeriodID), [37]);
});
