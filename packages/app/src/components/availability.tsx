import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../auth/apiFetch';
import { ADMIN_PAGE_SIZE, emptyPagination, localDateTimeInput, responseError, type PaginatedResponse, type Pagination } from './adminData';

type SystemAvailableDate = {
  ID: number;
  typeID: number | null;
  dateSysAvailableChange: string | null;
  flagSystemAvailable: boolean | null;
  comments: string | null;
  dateOfEntry: string | null;
};

type AvailabilityDraft = {
  dateSysAvailableChange: string;
  flagSystemAvailable: boolean;
  comments: string;
};

function currentDateTime(): string {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function emptyDraft(): AvailabilityDraft {
  return { dateSysAvailableChange: currentDateTime(), flagSystemAvailable: true, comments: '' };
}

function formatAvailabilityDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function Availability() {
  const [rows, setRows] = useState<SystemAvailableDate[]>([]);
  const [pagination, setPagination] = useState<Pagination>(() => emptyPagination());
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<SystemAvailableDate | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<AvailabilityDraft>(emptyDraft);

  const loadDates = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(ADMIN_PAGE_SIZE) });
      const response = await apiFetch(`/api/system-available-dates?${params.toString()}`);
      if (!response.ok) throw new Error(await responseError(response, 'Unable to load availability dates'));
      const payload = await response.json() as PaginatedResponse<SystemAvailableDate>;
      setRows(payload.data);
      setPagination(payload.pagination);
      setPage(payload.pagination.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load availability dates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDates();
  }, [page]);

  const openNewDate = (): void => {
    setEditorOpen(true);
    setEditingDate(null);
    setDeleteConfirmOpen(false);
    setDraft(emptyDraft());
    setModalError(null);
  };

  const openEditDate = (date: SystemAvailableDate): void => {
    setEditorOpen(true);
    setEditingDate(date);
    setDeleteConfirmOpen(false);
    setDraft({
      dateSysAvailableChange: date.dateSysAvailableChange ? localDateTimeInput(date.dateSysAvailableChange) : currentDateTime(),
      flagSystemAvailable: date.flagSystemAvailable ?? false,
      comments: date.comments ?? '',
    });
    setModalError(null);
  };

  const closeEditor = (): void => {
    if (!saving) {
      setEditorOpen(false);
      setEditingDate(null);
      setDeleteConfirmOpen(false);
      setModalError(null);
    }
  };

  const saveDate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      const response = await apiFetch(editingDate ? `/api/system-available-dates/${editingDate.ID}` : '/api/system-available-dates', {
        method: editingDate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeID: 2,
          ...draft,
          dateSysAvailableChange: new Date(draft.dateSysAvailableChange).toISOString(),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Unable to save availability date'));

      setEditorOpen(false);
      setEditingDate(null);
      setDeleteConfirmOpen(false);
      if (!editingDate && page !== 1) setPage(1);
      else await loadDates();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Unable to save availability date');
    } finally {
      setSaving(false);
    }
  };

  const deleteDate = async (): Promise<void> => {
    if (!editingDate) return;
    setSaving(true);
    setModalError(null);
    try {
      const response = await apiFetch(`/api/system-available-dates/${editingDate.ID}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await responseError(response, 'Unable to delete availability date'));
      setEditorOpen(false);
      setEditingDate(null);
      setDeleteConfirmOpen(false);
      if (page > 1 && rows.length === 1) setPage((current) => current - 1);
      else await loadDates();
    } catch (deleteError) {
      setModalError(deleteError instanceof Error ? deleteError.message : 'Unable to delete availability date');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-shell" aria-labelledby="page-title">
      <header className="toolbar">
        <div>
          <h1 id="page-title">Availability (Campfire)</h1>
          <button type="button" className="secondary-button refresh-button" onClick={() => void loadDates()} disabled={loading} aria-label="Refresh availability dates">⟳</button>
        </div>
        <div className="toolbar-right">
          <button type="button" className="new-permit-button" onClick={openNewDate}><span aria-hidden="true">+</span> New availability date</button>
        </div>
      </header>

      {error ? <div className="error-panel" role="alert">{error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Permit Type</th><th>Date of Change</th><th>System Availability</th><th>Comments</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="loading-cell">Loading availability dates...</td></tr>
              : rows.length === 0 ? <tr><td colSpan={4} className="empty-cell">No availability dates found.</td></tr>
                : rows.map((row) => (
                  <tr key={row.ID} className="permit-row" onClick={() => openEditDate(row)}>
                    <td>{row.typeID === 2 ? '⛺ Campfire' : row.typeID ?? '—'}</td>
                    <td>{formatAvailabilityDate(row.dateSysAvailableChange)}</td>
                    <td>{row.flagSystemAvailable === true ? 'On' : row.flagSystemAvailable === false ? 'Off' : '—'}</td>
                    <td>{row.comments || '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <div className="pagination-row">
        <span className="summary">Showing {rows.length} of {pagination.total} availability dates</span>
        <div className="pager">
          <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={loading || !pagination.hasPreviousPage}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || !pagination.hasNextPage}>Next</button>
        </div>
      </div>

      {editorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <section className="permit-modal" role="dialog" aria-modal="true" aria-labelledby="availability-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="modal-kicker">Campfire availability</p><h2 id="availability-title">{editingDate ? 'Edit availability date' : 'New availability date'}</h2></div>
              <button type="button" className="close-button" aria-label="Close availability form" onClick={closeEditor}>×</button>
            </div>
            <form onSubmit={saveDate}>
              <div className="form-grid">
                <label>Date of change<input type="datetime-local" value={draft.dateSysAvailableChange} onChange={(event) => setDraft((current) => ({ ...current, dateSysAvailableChange: event.target.value }))} required /></label>
                <label>System availability<select value={draft.flagSystemAvailable ? 'true' : 'false'} onChange={(event) => setDraft((current) => ({ ...current, flagSystemAvailable: event.target.value === 'true' }))}><option value="true">On</option><option value="false">Off</option></select></label>
                <label className="full-width-field">Comments<textarea maxLength={255} rows={3} value={draft.comments} onChange={(event) => setDraft((current) => ({ ...current, comments: event.target.value }))} /></label>
              </div>
              {modalError ? <div className="error-panel modal-error" role="alert">{modalError}</div> : null}
              <div className="modal-actions">
                {editingDate && deleteConfirmOpen ? (
                  <>
                    <span className="delete-confirmation">Delete this availability date?</span>
                    <button type="button" className="danger-button" onClick={() => void deleteDate()} disabled={saving}>Confirm delete</button>
                    <button type="button" className="secondary-button" onClick={() => setDeleteConfirmOpen(false)} disabled={saving}>Keep date</button>
                  </>
                ) : editingDate ? (
                  <button type="button" className="danger-button" onClick={() => setDeleteConfirmOpen(true)} disabled={saving}>Delete</button>
                ) : null}
                <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancel</button>
                <button type="submit" className="submit-button" disabled={saving}>{saving ? 'Saving...' : 'Save availability'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
