import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createBlackoutDate,
  getBlackoutDates,
  normalizeBlackoutDateSort,
  parseBlackoutDate,
  updateBlackoutDate,
} from '../services/blackoutDateService.js';

test('parseBlackoutDate accepts only valid supported types and SQL Server dates', () => {
  assert.deepEqual(parseBlackoutDate({ TypeID: 2, BlackoutDate: '2026-10-28' }), {
    TypeID: 2,
    BlackoutDate: new Date('2026-10-28T00:00:00.000Z'),
  });
  assert.equal(parseBlackoutDate({ TypeID: 3, BlackoutDate: '2026-10-28' }), null);
  assert.equal(parseBlackoutDate({ TypeID: 1, BlackoutDate: '2026-02-30' }), null);
  assert.equal(parseBlackoutDate({ TypeID: 1, BlackoutDate: '1700-01-01' }), null);
});

test('normalizeBlackoutDateSort restricts fields and directions', () => {
  assert.deepEqual(normalizeBlackoutDateSort('TypeID', 'asc'), { field: 'TypeID', direction: 'asc' });
  assert.deepEqual(normalizeBlackoutDateSort('DROP TABLE', 'asc; DELETE'), { field: 'BlackoutDate', direction: 'desc' });
});

test('getBlackoutDates maps results, clamps pagination, and applies safe sorting', async () => {
  const inputs = new Map();
  let listQuery = '';
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { inputs.set(name, value); },
        async query(query) {
          if (query.includes('COUNT(*)')) return { recordset: [{ Total: 21 }] };
          listQuery = query;
          return { recordset: [{ BlackoutDateID: 22, TypeID: 2, BlackoutDate: new Date('2026-10-28T00:00:00.000Z') }] };
        },
      };
    },
  });

  const result = await getBlackoutDates('99', '20', 'TypeID', 'asc', poolFactory);
  assert.equal(inputs.get('offset'), 20);
  assert.equal(inputs.get('pageSize'), 20);
  assert.match(listQuery, /ORDER BY \[TypeID\] ASC, \[BlackoutDateID\] ASC/);
  assert.deepEqual(result, {
    data: [{ BlackoutDateID: 22, TypeID: 2, BlackoutDate: '2026-10-28' }],
    pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
  });
});

test('getBlackoutDates falls back to safe default sorting for invalid query values', async () => {
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

  await getBlackoutDates(1, 20, '[date]; DROP TABLE', 'asc; DELETE', poolFactory);
  assert.match(listQuery, /ORDER BY \[BlackoutDate\] DESC, \[BlackoutDateID\] DESC/);
});

test('createBlackoutDate binds values and maps the inserted record', async () => {
  const inputs = new Map();
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { inputs.set(name, value); },
        async query(query) {
          assert.match(query, /INSERT INTO \[dbo\]\.\[BlackoutDates\]/);
          return { recordset: [{ BlackoutDateID: 4, TypeID: 1, BlackoutDate: new Date('2026-12-01T00:00:00.000Z') }] };
        },
      };
    },
  });
  const date = new Date('2026-12-01T00:00:00.000Z');

  assert.deepEqual(await createBlackoutDate({ TypeID: 1, BlackoutDate: date }, poolFactory), {
    BlackoutDateID: 4,
    TypeID: 1,
    BlackoutDate: '2026-12-01',
  });
  assert.equal(inputs.get('typeId'), 1);
  assert.equal(inputs.get('blackoutDate'), date);
});

test('updateBlackoutDate returns null when no row matches the ID', async () => {
  let boundId;
  const poolFactory = async () => ({
    request() {
      return {
        input(name, _type, value) { if (name === 'blackoutDateId') boundId = value; },
        async query(query) {
          assert.match(query, /UPDATE \[dbo\]\.\[BlackoutDates\]/);
          return { recordset: [] };
        },
      };
    },
  });

  const updated = await updateBlackoutDate(78, {
    TypeID: 2,
    BlackoutDate: new Date('2026-12-01T00:00:00.000Z'),
  }, poolFactory);
  assert.equal(boundId, 78);
  assert.equal(updated, null);
});
