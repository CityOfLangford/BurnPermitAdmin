import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../vite.config.ts';

test('Vite config exposes the API proxy and development port', () => {
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.proxy['/api'].target, 'http://localhost:3001');
  assert.equal(config.server.strictPort, false);
});
