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
          if (active) setError(response.status === 403
            ? 'Your account is not a member of BurnPermitAdmins.'
            : 'Your access could not be verified. Please sign in again or contact support.');
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
