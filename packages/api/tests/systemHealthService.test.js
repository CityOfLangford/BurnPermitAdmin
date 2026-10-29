import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkApplicationHeartbeat,
  checkBurnPermitApi,
  getSystemHealth,
} from '../services/systemHealthService.js';

const openStatus = {
  isOpen: 1,
  state: 'Open',
  stateMsg: 'Accepting applications',
  appReachable: 1,
  appMessage: 'OK',
  systemIsActive: 1,
  systemIsAvailable: 1,
  systemAvailableMsg: 'Available',
  hasPeriod: 1,
  periodName: '2026 season',
};

test('getSystemHealth checks IsSystemOpen for Open Burn and Campfire', async () => {
  const checkedTypes = [];
  const poolFactory = async () => ({
    request() {
      let typeID;
      return {
        input(name, _type, value) {
          assert.equal(name, 'systemId');
          typeID = value;
          return this;
        },
        async execute(procedure) {
          assert.equal(procedure, 'dbo.colsp_IsSystemOpen');
          checkedTypes.push(typeID);
          return { recordset: [{ ...openStatus, isOpen: typeID === 1 ? 1 : 0 }] };
        },
      };
    },
  });

  const result = await getSystemHealth(poolFactory, async () => ({
    status: 'reachable',
    url: 'http://localhost:50100/api/health',
    statusCode: 200,
    uptime: 1000,
    message: 'OK',
  }), async (system) => ({
    status: 'reachable',
    url: `https://${system.name.toLowerCase().replace(' ', '')}.example/heartbeat.txt`,
    statusCode: 200,
    message: 'Heartbeat OK',
  }));

  assert.equal(result.database.status, 'reachable');
  assert.equal(result.burnPermitApi.status, 'reachable');
  assert.deepEqual(checkedTypes.sort(), [1, 2]);
  assert.deepEqual(result.systems.map(({ name, isOpen, appReachable, state }) => ({
    name,
    isOpen,
    appReachable,
    state,
  })), [
    { name: 'Open Burn', isOpen: true, appReachable: true, state: 'Open' },
    { name: 'Campfire', isOpen: false, appReachable: true, state: 'Open' },
  ]);
});

test('getSystemHealth reports database failures and marks both systems unavailable', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await getSystemHealth(async () => {
      throw new Error('connection refused');
    }, async () => ({
      status: 'unreachable',
      url: 'http://localhost:50100/api/health',
      statusCode: null,
      uptime: null,
      message: 'Unable to reach BurnPermitAPI',
    }), async (system) => ({
      status: 'unreachable',
      url: `https://${system.name.toLowerCase().replace(' ', '')}.example/heartbeat.txt`,
      statusCode: null,
      message: 'Heartbeat failed',
    }));

    assert.equal(result.database.status, 'unreachable');
    assert.deepEqual(result.systems.map(({ name, status }) => ({ name, status })), [
      { name: 'Open Burn', status: 'unavailable' },
      { name: 'Campfire', status: 'unavailable' },
    ]);
  } finally {
    console.error = originalError;
  }
});

test('getSystemHealth includes stored procedure errors in the system diagnostic', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await getSystemHealth(async () => ({
      request() {
        return {
          input(name) {
            assert.equal(name, 'systemId');
            return this;
          },
          async execute() { throw new Error('Could not find stored procedure dbo.colsp_IsSystemOpen'); },
        };
      },
    }), async () => ({
      status: 'reachable',
      url: 'http://localhost:50100/api/health',
      statusCode: 200,
      uptime: null,
      message: 'OK',
    }), async (system) => ({
      status: 'unreachable',
      url: `https://${system.name.toLowerCase().replace(' ', '')}.example/heartbeat.txt`,
      statusCode: 503,
      message: 'Heartbeat request failed',
    }));

    assert.equal(result.database.status, 'reachable');
    assert.equal(result.systems[0].error, 'Could not find stored procedure dbo.colsp_IsSystemOpen');
    assert.equal(result.systems[1].error, 'Could not find stored procedure dbo.colsp_IsSystemOpen');
  } finally {
    console.error = originalError;
  }
});

test('checkBurnPermitApi probes the configured API health route and reads uptime', async () => {
  let requestedUrl;
  const result = await checkBurnPermitApi('https://burnpermit.example/', async (input, init) => {
    requestedUrl = input;
    assert.ok(init.signal);
    return new Response(JSON.stringify({ data: { uptime: 86_400_000 }, message: 'Healthy' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  assert.equal(requestedUrl, 'https://burnpermit.example/api/health');
  assert.deepEqual(result, {
    status: 'reachable',
    url: 'https://burnpermit.example/api/health',
    statusCode: 200,
    uptime: 86_400_000,
    message: 'Healthy',
  });
});

test('checkBurnPermitApi reports an unreachable API without failing the system health response', async () => {
  const result = await checkBurnPermitApi('http://localhost:50100', async () => {
    throw new Error('connection refused');
  });

  assert.equal(result.status, 'unreachable');
  assert.equal(result.statusCode, null);
  assert.match(result.message, /connection refused/);
});

test('checkApplicationHeartbeat considers any successful heartbeat file response reachable', async () => {
  let requestedUrl;
  const result = await checkApplicationHeartbeat(
    { typeID: 2, name: 'Campfire', urlVariable: 'CAMPFIRE_URL' },
    'https://campfire.example/',
    async (input) => {
      requestedUrl = input;
      return new Response('any file contents are fine', { status: 200 });
    },
  );

  assert.equal(requestedUrl, 'https://campfire.example/heartbeat.txt');
  assert.deepEqual(result, {
    status: 'reachable',
    url: 'https://campfire.example/heartbeat.txt',
    statusCode: 200,
    message: 'Heartbeat OK',
  });
});

test('checkApplicationHeartbeat rejects unsuccessful heartbeat file responses', async () => {
  const result = await checkApplicationHeartbeat(
    { typeID: 1, name: 'Open Burn', urlVariable: 'OPENBURN_URL' },
    'https://openburn.example',
    async () => new Response('not found', { status: 404 }),
  );

  assert.equal(result.status, 'unreachable');
  assert.equal(result.statusCode, 404);
});

test('checkApplicationHeartbeat clearly reports an unset app URL', async () => {
  const result = await checkApplicationHeartbeat(
    { typeID: 2, name: 'Campfire', urlVariable: 'CAMPFIRE_URL' },
    '',
  );

  assert.equal(result.status, 'unreachable');
  assert.equal(result.url, 'Not configured');
  assert.match(result.message, /CAMPFIRE_URL is not configured/);
});
