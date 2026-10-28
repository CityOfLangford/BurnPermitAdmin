import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

test('the application entrypoint and stylesheet are present', () => {
  assert.equal(existsSync(new URL('../src/main.tsx', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/index.css', import.meta.url)), true);
});
