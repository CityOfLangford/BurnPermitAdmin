import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../auth/apiFetch';
import { responseError } from './adminData';

type SystemHealth = {
  typeID: number;
  name: string;
  status: 'available' | 'unavailable';
  error: string | null;
  isOpen: boolean | null;
  state: string | null;
  stateMsg: string | null;
  appReachable: boolean | null;
  appMessage: string | null;
  systemIsActive: boolean | null;
  systemIsAvailable: boolean | null;
  systemAvailableMsg: string | null;
  hasPeriod: boolean | null;
  periodName: string | null;
  heartbeat: {
    status: 'reachable' | 'unreachable';
    url: string;
    statusCode: number | null;
    message: string;
  };
};

type SystemHealthResponse = {
  checkedAt: string;
  burnPermitApi: {
    status: 'reachable' | 'unreachable';
    url: string;
    statusCode: number | null;
    uptime: number | null;
    message: string;
  };
  database: {
    status: 'reachable' | 'unreachable';
    message: string;
  };
  systems: SystemHealth[];
};

function appStatusLabel(system: SystemHealth): string {
  return system.heartbeat.status === 'reachable' ? 'Reachable' : 'UNreachable';
}

function appStatusClass(system: SystemHealth): string {
  return system.heartbeat.status === 'reachable' ? 'Health-OK' : 'Health-Error';
}

function systemOpenLabel(system: SystemHealth): string {
  if (system.status === 'unavailable' || system.isOpen === null) return 'Sys state unavail.';
  return system.isOpen ? 'System Open' : 'System Closed';
}

function systemOpenClass(system: SystemHealth): string {
  if (system.status === 'unavailable' || system.isOpen === null) return 'Health-Unknown';
  return system.isOpen ? 'Health-OK' : 'Health-Closed';
}

function HealthDetails({ system }: { system: SystemHealth }) {
  return (
    <details className="health-system-details">
      <summary aria-label={`${system.name} health details`}>Details</summary>
      <div className="health-details-panel">
        <div><strong>Application:</strong> {appStatusLabel(system)}</div>
        <div><strong>Heartbeat:</strong> {system.heartbeat.url}</div>
        <div><strong>Heartbeat status:</strong> {system.heartbeat.statusCode ?? 'No response'} — {system.heartbeat.message}</div>
        <div><strong>State:</strong> {system.state ?? 'Unavailable'}{system.stateMsg ? ` — ${system.stateMsg}` : ''}</div>
        <div><strong>Active:</strong> {system.systemIsActive === null ? 'Unknown' : system.systemIsActive ? 'Yes' : 'No'}</div>
        <div><strong>Available:</strong> {system.systemAvailableMsg ?? 'Unknown'}</div>
        <div><strong>Period:</strong> {system.hasPeriod === null ? 'Unknown' : system.hasPeriod ? system.periodName ?? 'Current period' : 'No current period'}</div>
        {system.appMessage ? <div><strong>App message:</strong> {system.appMessage}</div> : null}
        {system.error ? <div role="alert"><strong>Health check:</strong> {system.error}</div> : null}
      </div>
    </details>
  );
}

export default function HealthFooter() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/system-health');
      if (!response.ok) throw new Error(await responseError(response, 'Unable to check application health'));
      setHealth(await response.json() as SystemHealthResponse);
    } catch (healthError) {
      setError(healthError instanceof Error ? healthError.message : 'Unable to check application health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return (
    <footer className="health-footer" aria-label="Application health status">
      <div className="health-footer-content">
        <strong className="health-footer-title">Application health</strong>
        {loading && !health ? <span className="health-unknown">Checking…</span> : null}
        {error ? <span className="health-error" role="status">Health check API: Unreachable</span> : null}
        {error ? <span className="health-error" role="status">Health check failed: {error}</span> : null}
        {health ? (
          <>
            <div className={`health-system-check ${health.burnPermitApi.status === 'reachable' ? 'health-ok' : 'health-error'}`}>
              <span>API: {health.burnPermitApi.status === 'reachable' ? 'Available' : 'Unreachable'}</span>
              <details className="health-system-details">
                <summary aria-label="API health details">Details</summary>
                <div className="health-details-panel">
                  <div><strong>Endpoint:</strong> {health.burnPermitApi.url}</div>
                  <div><strong>HTTP status:</strong> {health.burnPermitApi.statusCode ?? 'No response'}</div>
                  <div><strong>Uptime:</strong> {health.burnPermitApi.uptime === null ? 'N/A' : `${(health.burnPermitApi.uptime / (1000 * 60 * 60 * 24)).toFixed(1)} days`}</div>
                  <div><strong>Message:</strong> {health.burnPermitApi.message}</div>
                </div>
              </details>
            </div>
            <span className={health.database.status === 'reachable' ? 'health-ok' : 'health-error'}>
              Database: {health.database.status === 'reachable' ? 'Connected' : 'Unreachable'}
            </span>
            {health.systems.map((system) => (
              <div className="health-system-check" key={system.typeID}>
                <strong className="health-service-name">{system.name}:</strong>
                <span className={`${appStatusClass(system)} health-app-status`}>{appStatusLabel(system)}</span>
                <span className={`${systemOpenClass(system)} health-open-status`}>{systemOpenLabel(system)}</span>
                <HealthDetails system={system} />
              </div>
            ))}
            <span className="health-checked-at">
              Checked {new Date(health.checkedAt).toLocaleTimeString()}
            </span>
          </>
        ) : null}
        <button type="button" className="health-refresh" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      </div>
    </footer>
  );
}
