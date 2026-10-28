import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

test('MSSQL type declarations are present for the API build', () => {
  assert.equal(existsSync(new URL('../types/mssql.d.ts', import.meta.url)), true);
});
