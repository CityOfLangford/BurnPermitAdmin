import React from 'react';
import ReactDOM from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import App from './App';
import AuthenticationGate from './auth/AuthenticationGate';
import { setApiAuthorizationEnabled } from './auth/apiFetch';
import { getMsalInstance } from './auth/entra';
import './index.css';

export function mountApp(root: HTMLElement | null, authorizationEnabled: boolean): void {
  if (!root) return;

  if (!authorizationEnabled) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    return;
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <MsalProvider instance={getMsalInstance()}>
        <AuthenticationGate>
          <App />
        </AuthenticationGate>
      </MsalProvider>
    </React.StrictMode>
  );
}

if (typeof document !== 'undefined') {
  void fetch('/api/auth-config')
    .then(async (response) => {
      if (!response.ok) throw new Error(`Auth configuration request failed: ${response.status}`);
      const config: unknown = await response.json();
      if (typeof config !== 'object' || config === null || !('authorizationEnabled' in config)
        || typeof config.authorizationEnabled !== 'boolean') {
        throw new Error('Auth configuration response was invalid');
      }

      setApiAuthorizationEnabled(config.authorizationEnabled);

      if (!config.authorizationEnabled) {
        mountApp(document.getElementById('root'), false);
        return;
      }

      await getMsalInstance().initialize();
      mountApp(document.getElementById('root'), true);
    })
    .catch((error: unknown) => {
      console.error('Application authentication configuration failed:', error);
      const root = document.getElementById('root');
      if (root) root.textContent = 'The application could not load its authentication settings. Please contact support.';
    });
}
