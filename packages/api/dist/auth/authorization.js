import { createRemoteJWKSet, jwtVerify } from 'jose';
const defaultTenantId = 'e6daa991-402f-46f2-b53b-09367f7d9ea8';
const defaultClientId = 'd18ed6f1-6ec8-4fa3-9359-222db017c34c';
const defaultGroupId = 'aee60979-dcc2-4d85-9a1b-ca7fb86da40d';
export function readAuthorizationConfig(environment = process.env) {
    const enabledValue = (environment.AUTHORIZATION_ENABLED ?? environment.AUTHORIZATION_ENABLE ?? 'true')
        .trim()
        .toLowerCase();
    if (enabledValue !== 'true' && enabledValue !== 'false') {
        throw new Error('AUTHORIZATION_ENABLED must be either true or false');
    }
    const config = {
        enabled: enabledValue === 'true',
        tenantId: environment.ENTRA_TENANT_ID || defaultTenantId,
        clientId: environment.ENTRA_CLIENT_ID || defaultClientId,
        groupId: environment.ENTRA_GROUP_ID || defaultGroupId,
        scope: environment.ENTRA_API_SCOPE ?? 'access_as_user',
    };
    if (config.enabled && (!config.tenantId || !config.clientId || !config.groupId || !config.scope)) {
        throw new Error('Entra tenant, client, group, and API scope settings are required when authorization is enabled');
    }
    return config;
}
function createEntraTokenVerifier(config) {
    const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
    const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`));
    return async (token) => {
        const { payload } = await jwtVerify(token, jwks, {
            algorithms: ['RS256'],
            audience: [config.clientId, `api://${config.clientId}`],
            issuer,
        });
        return payload;
    };
}
export function createAuthorizationMiddleware(config, verifyToken) {
    const validateToken = verifyToken ?? (config.enabled ? createEntraTokenVerifier(config) : async () => ({}));
    return async (req, res, next) => {
        if (!config.enabled) {
            next();
            return;
        }
        const authorization = req.header('authorization');
        const match = authorization?.match(/^Bearer\s+(.+)$/i);
        if (!match) {
            res.status(401).json({ error: 'Bearer access token required' });
            return;
        }
        let claims;
        try {
            claims = await validateToken(match[1]);
        }
        catch (error) {
            console.warn('Entra access token validation failed:', error);
            res.status(401).json({ error: 'Invalid or expired access token' });
            return;
        }
        const scopes = typeof claims.scp === 'string' ? claims.scp.split(' ') : [];
        if (!scopes.includes(config.scope)) {
            res.status(403).json({ error: 'Required API scope is missing' });
            return;
        }
        const groups = Array.isArray(claims.groups) ? claims.groups : [];
        const hasAllowedGroup = groups.some((group) => typeof group === 'string' && group.toLowerCase() === config.groupId.toLowerCase());
        if (!hasAllowedGroup) {
            res.status(403).json({ error: 'BurnPermitAdmins group membership is required' });
            return;
        }
        next();
    };
}
