import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

test('Vite environment declarations are present for the frontend build', () => {
  assert.equal(existsSync(new URL('../src/vite-env.d.ts', import.meta.url)), true);
});
