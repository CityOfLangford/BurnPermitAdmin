import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { apiFetch } from './apiFetch';
import { apiScope } from './entra';

export default function AuthenticationGate({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const [error, setError] = useState<string | null>(null);
  const [authorizedAccountId, setAuthorizedAccountId] = useState<string | null>(null);
  const redirectStarted = useRef(false);
  const account = instance.getActiveAccount() ?? accounts[0];

  useEffect(() => {
    if (inProgress !== InteractionStatus.None || account || redirectStarted.current) return;

    redirectStarted.current = true;
    void instance.loginRedirect({ scopes: [apiScope] }).catch((loginError: unknown) => {
      console.error('Entra sign-in failed:', loginError);
      setError('Sign-in could not be started. Please refresh the page or contact support.');
    });
  }, [account, inProgress, instance]);

  useEffect(() => {
    if (!account || inProgress !== InteractionStatus.None) return;

    instance.setActiveAccount(account);
    let active = true;
    void apiFetch('/api/health')
      .then((response) => {
        if (!response.ok) {
          if (response.status === 403) {
            return response.json().then((body: unknown) => {
              const apiError = typeof body === 'object' && body !== null && 'error' in body
                && typeof body.error === 'string'
                ? body.error
                : '';
              if (!active) return;

              if (apiError === 'BurnPermitAdmins group membership is required') {
                setError('Your account could not be verified as a member of BurnPermitAdmins. Confirm the group assignment and Entra access-token group claims.');
              } else if (apiError === 'Required API scope is missing') {
                setError('Your sign-in is missing the Permit Admin API permission. Sign in again or contact support.');
              } else {
                setError('The API denied access. Please contact support.');
              }
            });
          }
          if (active) setError('Your access could not be verified. Please sign in again or contact support.');
          return;
        }
        if (active) setAuthorizedAccountId(account.homeAccountId);
      })
      .catch((authorizationError: unknown) => {
        console.error('Entra authorization check failed:', authorizationError);
        if (active) setError('Your access could not be verified. Please refresh the page or contact support.');
      });

    return () => {
      active = false;
    };
  }, [account, inProgress, instance]);

  if (error) return <p role="alert">{error}</p>;
  if (!account) return <p role="status">Redirecting to Microsoft sign-in…</p>;
  if (authorizedAccountId !== account.homeAccountId) return <p role="status">Verifying BurnPermitAdmins access…</p>;

  return children;
}
