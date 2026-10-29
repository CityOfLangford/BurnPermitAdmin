import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const tenantId = import.meta.env?.VITE_ENTRA_TENANT_ID || 'e6daa991-402f-46f2-b53b-09367f7d9ea8';
const clientId = import.meta.env?.VITE_ENTRA_CLIENT_ID || '702e2464-dd84-41db-8bf1-a2cdcf806cb2';

export const apiScope = import.meta.env?.VITE_ENTRA_API_SCOPE || `api://${clientId}/AccessBurnPermitAdmin`;

export function getRedirectUri(origin: string): string {
  return origin.endsWith('/') ? origin : `${origin}/`;
}

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri: getRedirectUri(typeof window === 'undefined' ? 'http://localhost:5173/' : window.location.origin),
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

let instance: PublicClientApplication | undefined;

export function getMsalInstance(): PublicClientApplication {
  instance ??= new PublicClientApplication(msalConfig);
  return instance;
}
