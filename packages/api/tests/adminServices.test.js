import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createSystemAvailableDate,
  getSystemAvailableDates,
  parseSystemAvailableDate,
  updateSystemAvailableDate,
} from '../services/availabilityService.js';
import {
  getAdminConfigurations,
  parseConfigurationValue,
  updateAdminConfiguration,
} from '../services/configurationService.js';
import {
  createAdminPermitPeriod,
  getAdminPermitPeriods,
  normalizePermitPeriodSort,
  parseAdminPermitPeriod,
  updateAdminPermitPeriod,
} from '../services/permitPeriodAdminService.js';

const periodInput = {
  Name: '2026 Burning Season',
  TypeID: 1,
  StartDate: '2026-01-01',
  EndDate: '2026-12-31',
  BookingStartDate: '2025-12-01',
  BookingEndDate: '2026-11-30',
};

test('system availability input requires campfire type, valid timestamp, status, and bounded comments', () => {
  assert.deepEqual(parseSystemAvailableDate({
    typeID: 2,
    dateSysAvailableChange: '2026-10-28T15:30',
    flagSystemAvailable: false,
    comments: 'Maintenance',
  }), {
    typeID: 2,
    dateSysAvailableChange: new Date('2026-10-28T15:30'),
    flagSystemAvailable: false,
    comments: 'Maintenance',
  });
  assert.equal(parseSystemAvailableDate({
    typeID: 1,
    dateSysAvailableChange: '2026-10-28T15:30',
    flagSystemAvailable: false,
  }), null);
  assert.equal(parseSystemAvailableDate({
    typeID: 2,
    dateSysAvailableChange: '2026-02-30T15:30',
    flagSystemAvailable: false,
  }), null);
  assert.equal(parseSystemAvailableDate({
    typeID: 2,
    dateSysAvailableChange: '2026-10-28T15:30',
    flagSystemAvailable: false,
    comments: 'x'.repeat(256),
  }), null);
});

test('system availability list clamps pages and inserts bind values', async () => {
  const inputs = new Map();
  let listQuery = '';
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { inputs.set(name, value); },
        async query(query) {
          if (query.includes('COUNT(*)')) return { recordset: [{ Total: 21 }] };
          listQuery = query;
          return {
            recordset: [{
              ID: 2,
              typeID: 2,
              dateSysAvailableChange: new Date('2026-10-28T15:30:00.000Z'),
              flagSystemAvailable: false,
              comments: 'Maintenance',
              dateOfEntry: null,
            }],
          };
        },
      };
    },
  });

  const result = await getSystemAvailableDates('99', '20', poolFactory);
  assert.equal(inputs.get('offset'), 20);
  assert.equal(inputs.get('pageSize'), 20);
  assert.match(listQuery, /WHERE \[typeID\] = 2/);
  assert.deepEqual(result.data[0], {
    ID: 2,
    typeID: 2,
    dateSysAvailableChange: '2026-10-28T15:30:00.000Z',
    flagSystemAvailable: false,
    comments: 'Maintenance',
    dateOfEntry: null,
  });
  assert.equal(result.pagination.page, 2);

  const createInputs = new Map();
  const createPool = async () => ({
    request() {
      return {
        input(name, _type, value) { createInputs.set(name, value); },
        async query(query) {
          assert.match(query, /INSERT INTO \[dbo\]\.\[SystemAvailableDates\]/);
          return { recordset: [{ ID: 3, typeID: 2, dateSysAvailableChange: new Date('2026-10-28T15:30:00.000Z'), flagSystemAvailable: true, comments: '', dateOfEntry: null }] };
        },
      };
    },
  });
  const date = new Date('2026-10-28T15:30:00.000Z');
  await createSystemAvailableDate({ typeID: 2, dateSysAvailableChange: date, flagSystemAvailable: true, comments: '' }, createPool);
  assert.equal(createInputs.get('dateSysAvailableChange'), date);
  assert.equal(createInputs.get('flagSystemAvailable'), true);
});

test('system availability update is scoped to campfire rows and reports missing records', async () => {
  let query = '';
  const poolFactory = async () => ({
    request() {
      return {
        input() {},
        async query(value) {
          query = value;
          return { recordset: [] };
        },
      };
    },
  });
  assert.equal(await updateSystemAvailableDate(22, {
    typeID: 2,
    dateSysAvailableChange: new Date('2026-10-28T15:30:00.000Z'),
    flagSystemAvailable: false,
    comments: '',
  }, poolFactory), null);
  assert.match(query, /WHERE \[ID\] = @id AND \[typeID\] = 2/);
});

test('permit periods validate fields, normalize safe sorting, and paginate filtered results', async () => {
  assert.deepEqual(parseAdminPermitPeriod(periodInput), {
    Name: '2026 Burning Season',
    TypeID: 1,
    StartDate: new Date('2026-01-01T00:00:00.000Z'),
    EndDate: new Date('2026-12-31T00:00:00.000Z'),
    BookingStartDate: new Date('2025-12-01T00:00:00.000Z'),
    BookingEndDate: new Date('2026-11-30T00:00:00.000Z'),
  });
  assert.equal(parseAdminPermitPeriod({ ...periodInput, StartDate: '2026-02-30' }), null);
  assert.equal(parseAdminPermitPeriod({ ...periodInput, Name: ' ' }), null);
  assert.deepEqual(normalizePermitPeriodSort('DROP TABLE', 'asc; DELETE'), { field: 'PeriodID', direction: 'desc' });

  const inputs = new Map();
  let query = '';
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { inputs.set(name, value); },
        async query(value) {
          if (value.includes('COUNT(*)')) return { recordset: [{ Total: 2 }] };
          query = value;
          return { recordset: [{ PeriodID: 4, Name: 'Season', TypeID: 1, StartDate: new Date('2026-01-01'), EndDate: new Date('2026-12-31'), BookingStartDate: new Date('2025-12-01'), BookingEndDate: new Date('2026-11-30') }] };
        },
      };
    },
  });
  const result = await getAdminPermitPeriods(3, 1, 'Name', 'asc', '1', poolFactory);
  assert.equal(inputs.get('typeID'), 1);
  assert.equal(inputs.get('offset'), 1);
  assert.match(query, /ORDER BY \[Name\] ASC, \[PeriodID\] ASC/);
  assert.equal(result.pagination.page, 2);
  assert.equal(result.data[0].StartDate, '2026-01-01');
});

test('permit period default sorting does not repeat PeriodID in ORDER BY', async () => {
  let listQuery = '';
  const poolFactory = async () => ({
    request() {
      return {
        input() {},
        async query(query) {
          if (query.includes('COUNT(*)')) return { recordset: [{ Total: 0 }] };
          listQuery = query;
          return { recordset: [] };
        },
      };
    },
  });

  await getAdminPermitPeriods(1, 20, undefined, undefined, undefined, poolFactory);
  assert.match(listQuery, /ORDER BY \[PeriodID\] DESC\s+OFFSET/);
  assert.doesNotMatch(listQuery, /ORDER BY \[PeriodID\] DESC,\s*\[PeriodID\]/);
});

test('permit period create and update bind all dates and return inserted records', async () => {
  const inputs = new Map();
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { inputs.set(name, value); },
        async query(query) {
          assert.match(query, /(?:INSERT INTO|UPDATE) \[dbo\]\.\[PermitPeriods\]/);
          return { recordset: [{ PeriodID: 12, Name: '2026 Burning Season', TypeID: 1, StartDate: new Date('2026-01-01'), EndDate: new Date('2026-12-31'), BookingStartDate: new Date('2025-12-01'), BookingEndDate: new Date('2026-11-30') }] };
        },
      };
    },
  });
  const period = parseAdminPermitPeriod(periodInput);
  assert.ok(period);
  await createAdminPermitPeriod(period, poolFactory);
  assert.equal(inputs.get('name'), '2026 Burning Season');
  assert.equal(inputs.get('StartDate'), period.StartDate);
  await updateAdminPermitPeriod(12, period, poolFactory);
  assert.equal(inputs.get('periodID'), 12);
});

test('configurations only accept string values and update only admin-editable records', async () => {
  assert.equal(parseConfigurationValue({ Value: '' }), '');
  assert.equal(parseConfigurationValue({ Value: 1 }), null);
  const inputs = new Map();
  let updateQuery = '';
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { inputs.set(name, value); },
        async query(query) {
          if (query.includes('COUNT(*)')) return { recordset: [{ Total: 1 }] };
          updateQuery = query;
          return { recordset: [{ ConfigurationID: 2, ConfigurationType: 'AdminEditable', Name: 'SYSTEMACTIVE', Value: '0', TypeID: 2, comments: 'Status switch' }] };
        },
      };
    },
  });
  const list = await getAdminConfigurations(1, 20, poolFactory);
  assert.equal(list.data[0].Name, 'SYSTEMACTIVE');
  const updated = await updateAdminConfiguration(2, '0', poolFactory);
  assert.equal(updated?.Value, '0');
  assert.equal(inputs.get('configurationID'), 2);
  assert.match(updateQuery, /ConfigurationType\] = N'AdminEditable'/);
});
