import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { getMsalInstance, apiScope } from './entra';

let authorizationEnabled = true;

export function setApiAuthorizationEnabled(enabled: boolean): void {
  authorizationEnabled = enabled;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!authorizationEnabled) {
    return fetch(input, init);
  }

  const instance = getMsalInstance();
  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];

  if (!account) {
    throw new Error('You must sign in before calling the Permit Admin API');
  }

  let accessToken: string;
  try {
    const result = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
    accessToken = result.accessToken;
  } catch (error: unknown) {
    if (error instanceof InteractionRequiredAuthError) {
      await instance.acquireTokenRedirect({ account, scopes: [apiScope] });
      throw new Error('Redirecting to sign in');
    }
    throw error;
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}
