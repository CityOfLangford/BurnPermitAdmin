import assert from 'node:assert/strict';
import { test } from 'node:test';
import config from '../vite.config.ts';

test('Vite config exposes the API proxy and development port', () => {
  assert.equal(config.server.port, 5173);
  assert.equal(config.server.proxy['/api'].target, 'http://127.0.0.1:3001');
  assert.equal(config.server.strictPort, false);
});

test('Vite production preview proxies API requests to the API service', () => {
  assert.equal(config.preview.proxy['/api'].target, 'http://127.0.0.1:3001');
});
