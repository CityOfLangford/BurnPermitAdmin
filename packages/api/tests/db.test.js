import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, sql } from '../config/db.js';

test('database config supplies safe local defaults', () => {
  assert.equal(config.server, process.env.DB_HOST ?? 'localhost');
  assert.equal(config.port, Number(process.env.DB_PORT || 1433));
  assert.equal(config.options.enableArithAbort, true);
  assert.equal(typeof sql.Int, 'function');
});
