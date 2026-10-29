import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const tenantId = import.meta.env?.VITE_ENTRA_TENANT_ID || 'e6daa991-402f-46f2-b53b-09367f7d9ea8';
const clientId = import.meta.env?.VITE_ENTRA_CLIENT_ID || 'd18ed6f1-6ec8-4fa3-9359-222db017c34c';

export const apiScope = import.meta.env?.VITE_ENTRA_API_SCOPE || `api://${clientId}/access_as_user`;

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
