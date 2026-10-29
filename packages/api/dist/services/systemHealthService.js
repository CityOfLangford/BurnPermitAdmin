import { getSqlPool, sql } from '../config/db.js';
const permitSystems = [
    { typeID: 1, name: 'Open Burn', urlVariable: 'OPENBURN_URL' },
    { typeID: 2, name: 'Campfire', urlVariable: 'CAMPFIRE_URL' },
];
function mapFlag(value) {
    if (value === true || value === 1)
        return true;
    if (value === false || value === 0)
        return false;
    if (value === null || value === undefined)
        return null;
    throw new Error('Database returned an invalid system health flag');
}
function mapText(value) {
    if (value === null || value === undefined)
        return null;
    if (typeof value !== 'string')
        throw new Error('Database returned invalid system health text');
    return value;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : 'Unknown database error';
}
function getNestedValue(value, key) {
    if (typeof value !== 'object' || value === null || !(key in value))
        return undefined;
    return value[key];
}
export async function checkBurnPermitApi(baseUrl = process.env.PUBLIC_API_URL ?? 'http://localhost:50100', fetcher = fetch) {
    const url = `${baseUrl.replace(/\/+$/, '')}/api/health`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetcher(url, { signal: controller.signal });
        let payload;
        try {
            payload = await response.json();
        }
        catch {
            payload = null;
        }
        const data = getNestedValue(payload, 'data');
        const uptimeValue = getNestedValue(data, 'uptime');
        const uptime = typeof uptimeValue === 'number' && Number.isFinite(uptimeValue) ? uptimeValue : null;
        const payloadMessage = getNestedValue(payload, 'message');
        const message = typeof payloadMessage === 'string'
            ? payloadMessage
            : response.ok
                ? 'OK'
                : response.statusText || 'API returned an unsuccessful response';
        return {
            status: response.ok ? 'reachable' : 'unreachable',
            url,
            statusCode: response.status,
            uptime,
            message,
        };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown network error';
        return {
            status: 'unreachable',
            url,
            statusCode: null,
            uptime: null,
            message: `Unable to reach BURNPERMITAPI: ${reason}`,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function checkApplicationHeartbeat(system, baseUrl = process.env[system.urlVariable], fetcher = fetch) {
    const url = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/heartbeat.txt` : '';
    if (!url) {
        return {
            status: 'unreachable',
            url: 'Not configured',
            statusCode: null,
            message: `${system.urlVariable} is not configured`,
        };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) {
            return {
                status: 'unreachable',
                url,
                statusCode: response.status,
                message: response.statusText || 'Heartbeat request failed',
            };
        }
        return {
            status: 'reachable',
            url,
            statusCode: response.status,
            message: 'Heartbeat OK',
        };
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown network error';
        return {
            status: 'unreachable',
            url,
            statusCode: null,
            message: `Heartbeat request failed: ${reason}`,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
function unavailableSystem(system, error, heartbeat) {
    return {
        ...system,
        status: 'unavailable',
        error,
        isOpen: null,
        state: null,
        stateMsg: null,
        appReachable: null,
        appMessage: null,
        systemIsActive: null,
        systemIsAvailable: null,
        systemAvailableMsg: null,
        hasPeriod: null,
        periodName: null,
        heartbeat,
    };
}
function mapSystemHealth(system, row, heartbeat) {
    return {
        ...system,
        status: 'available',
        error: null,
        isOpen: mapFlag(row.isOpen),
        state: mapText(row.state),
        stateMsg: mapText(row.stateMsg),
        appReachable: mapFlag(row.appReachable),
        appMessage: mapText(row.appMessage),
        systemIsActive: mapFlag(row.systemIsActive),
        systemIsAvailable: mapFlag(row.systemIsAvailable),
        systemAvailableMsg: mapText(row.systemAvailableMsg),
        hasPeriod: mapFlag(row.hasPeriod),
        periodName: mapText(row.periodName),
        heartbeat,
    };
}
export async function getSystemHealth(poolFactory = getSqlPool, burnPermitApiCheck = checkBurnPermitApi, heartbeatCheck = checkApplicationHeartbeat) {
    const checkedAt = new Date().toISOString();
    const [burnPermitApi, heartbeats] = await Promise.all([
        burnPermitApiCheck(),
        Promise.all(permitSystems.map((system) => heartbeatCheck(system))),
    ]);
    const heartbeatBySystemId = new Map(permitSystems.map((system, index) => [
        system.typeID,
        heartbeats[index],
    ]));
    let pool;
    try {
        pool = await poolFactory();
    }
    catch (error) {
        console.error('Unable to connect to the database for system health checks:', error);
        return {
            checkedAt,
            burnPermitApi,
            database: { status: 'unreachable', message: 'Unable to connect to the database' },
            systems: permitSystems.map((system) => unavailableSystem(system, 'Database is unreachable', heartbeatBySystemId.get(system.typeID))),
        };
    }
    const systems = await Promise.all(permitSystems.map(async (system) => {
        try {
            const request = pool.request();
            request.input('systemId', sql.Int, system.typeID);
            const result = await request.execute('dbo.colsp_IsSystemOpen');
            const row = result.recordset?.[0];
            if (!row)
                throw new Error('Stored procedure returned no system status');
            return mapSystemHealth(system, row, heartbeatBySystemId.get(system.typeID));
        }
        catch (error) {
            console.error(`Unable to check ${system.name} system health:`, error);
            return unavailableSystem(system, getErrorMessage(error), heartbeatBySystemId.get(system.typeID));
        }
    }));
    return {
        checkedAt,
        burnPermitApi,
        database: { status: 'reachable', message: 'Connected' },
        systems,
    };
}
