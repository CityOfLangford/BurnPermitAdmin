import { useEffect, useState, type FormEvent } from 'react';
import { ADMIN_PAGE_SIZE, emptyPagination, responseError, type PaginatedResponse, type Pagination } from './adminData';

type Configuration = {
  ConfigurationID: number;
  ConfigurationType: string;
  Name: string;
  Value: string;
  TypeID: number | null;
  comments: string | null;
};

function permitType(typeID: number | null): string {
  return typeID === 1 ? '🍂 Open Burn' : typeID === 2 ? '⛺ Campfire' : typeID === null ? 'All types' : String(typeID);
}

export default function SystemConfigs() {
  const [rows, setRows] = useState<Configuration[]>([]);
  const [pagination, setPagination] = useState<Pagination>(() => emptyPagination());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editingConfiguration, setEditingConfiguration] = useState<Configuration | null>(null);
  const [draftValue, setDraftValue] = useState('');

  const loadConfigurations = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(ADMIN_PAGE_SIZE) });
      const response = await fetch(`/api/configurations?${params.toString()}`);
      if (!response.ok) throw new Error(await responseError(response, 'Unable to load configurations'));
      const payload = await response.json() as PaginatedResponse<Configuration>;
      setRows(payload.data);
      setPagination(payload.pagination);
      setPage(payload.pagination.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfigurations();
  }, [page]);

  const openEditor = (configuration: Configuration): void => {
    setEditingConfiguration(configuration);
    setDraftValue(configuration.Value);
    setModalError(null);
  };

  const closeEditor = (): void => {
    if (!saving) {
      setEditingConfiguration(null);
      setModalError(null);
    }
  };

  const saveConfiguration = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!editingConfiguration) return;
    setSaving(true);
    setModalError(null);
    try {
      const response = await fetch(`/api/configurations/${editingConfiguration.ConfigurationID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Value: draftValue }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Unable to save configuration'));
      const updated = await response.json() as Configuration;
      setRows((current) => current.map((row) => row.ConfigurationID === updated.ConfigurationID ? updated : row));
      setEditingConfiguration(null);
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Unable to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-shell" aria-labelledby="page-title">
      <header className="toolbar">
        <div>
          <h1 id="page-title">Configurations</h1>
          <button type="button" className="secondary-button refresh-button" onClick={() => void loadConfigurations()} disabled={loading} aria-label="Refresh configurations">⟳</button>
        </div>
      </header>
      <div className="warning-panel" role="note">Warning: Do not modify these values unless you know what you are doing.</div>
      {error ? <div className="error-panel" role="alert">{error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Permit Type</th><th>Name</th><th>Value</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} className="loading-cell">Loading configurations...</td></tr>
              : rows.length === 0 ? <tr><td colSpan={3} className="empty-cell">No admin-editable configurations found.</td></tr>
                : rows.map((row) => (
                  <tr key={row.ConfigurationID} className="permit-row" onClick={() => openEditor(row)}>
                    <td>{permitType(row.TypeID)}</td>
                    <td>{row.Name}</td>
                    <td className="configuration-value">{row.Value}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <div className="pagination-row">
        <span className="summary">Showing {rows.length} of {pagination.total} configurations</span>
        <div className="pager">
          <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={loading || !pagination.hasPreviousPage}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || !pagination.hasNextPage}>Next</button>
        </div>
      </div>

      {editingConfiguration ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <section className="permit-modal" role="dialog" aria-modal="true" aria-labelledby="configuration-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="modal-kicker">Admin-editable configuration</p><h2 id="configuration-title">Edit {editingConfiguration.Name}</h2></div>
              <button type="button" className="close-button" aria-label="Close configuration form" onClick={closeEditor}>×</button>
            </div>
            <form onSubmit={saveConfiguration}>
              <div className="form-grid">
                <label className="full-width-field">Value
                  {editingConfiguration.Name.toUpperCase() === 'SYSTEMACTIVE' ? (
                    <select value={draftValue} onChange={(event) => setDraftValue(event.target.value)}><option value="1">1 (Active)</option><option value="0">0 (Inactive)</option></select>
                  ) : (
                    <textarea rows={4} value={draftValue} onChange={(event) => setDraftValue(event.target.value)} />
                  )}
                </label>
              </div>
              {editingConfiguration.comments ? <p className="configuration-comments">{editingConfiguration.comments}</p> : null}
              {modalError ? <div className="error-panel modal-error" role="alert">{modalError}</div> : null}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancel</button>
                <button type="submit" className="submit-button" disabled={saving}>{saving ? 'Saving...' : 'Save value'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
