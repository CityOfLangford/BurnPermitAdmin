import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type AuthorizationConfig = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  groupId: string;
  scope: string;
};

const defaultTenantId = 'e6daa991-402f-46f2-b53b-09367f7d9ea8';
const defaultClientId = '702e2464-dd84-41db-8bf1-a2cdcf806cb2';
const defaultGroupId = 'aee60979-dcc2-4d85-9a1b-ca7fb86da40d';

type TokenVerifier = (token: string) => Promise<JWTPayload>;

export function readAuthorizationConfig(environment: NodeJS.ProcessEnv = process.env): AuthorizationConfig {
  const enabledValue = (environment.AUTHORIZATION_ENABLED ?? environment.AUTHORIZATION_ENABLE ?? 'true')
    .trim()
    .toLowerCase();
  if (enabledValue !== 'true' && enabledValue !== 'false') {
    throw new Error('AUTHORIZATION_ENABLED must be either true or false');
  }

  const config: AuthorizationConfig = {
    enabled: enabledValue === 'true',
    tenantId: environment.ENTRA_TENANT_ID || defaultTenantId,
    clientId: environment.ENTRA_CLIENT_ID || defaultClientId,
    groupId: environment.ENTRA_GROUP_ID || defaultGroupId,
    scope: environment.ENTRA_API_SCOPE ?? 'AccessBurnPermitAdmin',
  };

  if (config.enabled && (!config.tenantId || !config.clientId || !config.groupId || !config.scope)) {
    throw new Error('Entra tenant, client, group, and API scope settings are required when authorization is enabled');
  }

  return config;
}

function createEntraTokenVerifier(config: AuthorizationConfig): TokenVerifier {
  const issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
  const jwks = createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`)
  );

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
      audience: [config.clientId, `api://${config.clientId}`],
      issuer,
    });
    return payload;
  };
}

export function createAuthorizationMiddleware(
  config: AuthorizationConfig,
  verifyToken?: TokenVerifier
) {
  const validateToken = verifyToken ?? (config.enabled ? createEntraTokenVerifier(config) : async () => ({}));

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

    let claims: JWTPayload;
    try {
      claims = await validateToken(match[1]);
    } catch (error: unknown) {
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
    const hasAllowedGroup = groups.some(
      (group) => typeof group === 'string' && group.toLowerCase() === config.groupId.toLowerCase()
    );
    if (!hasAllowedGroup) {
      res.status(403).json({ error: 'BurnPermitAdmins group membership is required' });
      return;
    }

    next();
  };
}
