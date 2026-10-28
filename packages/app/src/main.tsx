import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

export function mountApp(root: HTMLElement | null): void {
  if (!root) return;
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (typeof document !== 'undefined') {
  mountApp(document.getElementById('root'));
}
