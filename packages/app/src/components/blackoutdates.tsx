import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../auth/apiFetch';

type BlackoutDate = {
  BlackoutDateID: number;
  TypeID: number;
  BlackoutDate: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type BlackoutDateResponse = {
  data: BlackoutDate[];
  pagination: Pagination;
};

type BlackoutDateDraft = {
  TypeID: string;
  BlackoutDate: string;
};

type SortField = 'TypeID' | 'BlackoutDate';
type SortDirection = 'asc' | 'desc';

const PAGE_SIZE = 20;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatBlackoutDate(date: string): string {
  const dateOnly = date.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly.replaceAll('-', '/') : date;
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json() as { error?: string };
  return payload.error || fallback;
}

export default function BlackoutDates() {
  const [rows, setRows] = useState<BlackoutDate[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('BlackoutDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<BlackoutDate | null>(null);
  const [draft, setDraft] = useState<BlackoutDateDraft>({ TypeID: '1', BlackoutDate: today() });

  const loadBlackoutDates = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sortField,
        sortDirection,
      });
      const response = await apiFetch(`/api/blackout-dates?${params.toString()}`);
      if (!response.ok) throw new Error(await errorMessage(response, 'Unable to load blackout dates'));
      const payload = await response.json() as BlackoutDateResponse;
      setRows(payload.data);
      setPagination(payload.pagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load blackout dates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBlackoutDates();
  }, [page, sortField, sortDirection]);

  const handleSort = (field: SortField): void => {
    if (sortField === field) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const openNewDate = (): void => {
    setEditorOpen(true);
    setEditingDate(null);
    setDraft({ TypeID: '1', BlackoutDate: today() });
    setModalError(null);
  };

  const refreshBlackoutDates = (): void => {
    if (page !== 1) {
      setPage(1);
      return;
    }

    void loadBlackoutDates();
  };

  const openEditDate = (blackoutDate: BlackoutDate): void => {
    setEditorOpen(true);
    setEditingDate(blackoutDate);
    setDraft({ TypeID: String(blackoutDate.TypeID), BlackoutDate: blackoutDate.BlackoutDate.slice(0, 10) });
    setModalError(null);
  };

  const closeEditor = (): void => {
    if (!saving) {
      setEditorOpen(false);
      setEditingDate(null);
      setModalError(null);
    }
  };

  const saveBlackoutDate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      const response = await apiFetch(editingDate ? `/api/blackout-dates/${editingDate.BlackoutDateID}` : '/api/blackout-dates', {
        method: editingDate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ TypeID: Number(draft.TypeID), BlackoutDate: draft.BlackoutDate }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, 'Unable to save blackout date'));

      setEditorOpen(false);
      setEditingDate(null);
      if (!editingDate && page > 1) {
        setPage(1);
      } else {
        await loadBlackoutDates();
      }
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Unable to save blackout date');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-shell" aria-labelledby="page-title">
      <header className="toolbar">
        <div>
          <h1 id="page-title">Blackout Dates</h1>
          <button type="button" className="secondary-button refresh-button" onClick={refreshBlackoutDates} disabled={loading} aria-label="Refresh blackout dates"> ⟳ </button>
        </div>
        <div className="toolbar-right">
          <button type="button" className="new-permit-button" onClick={openNewDate}>
            <span aria-hidden="true">+</span> New blackout date
          </button>
        </div>
      </header>

      {error ? <div className="error-panel" role="alert">{error}</div> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th aria-sort={sortField === 'TypeID' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="sort-button" onClick={() => handleSort('TypeID')}>
                  Permit Type{sortField === 'TypeID' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
              <th aria-sort={sortField === 'BlackoutDate' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="sort-button" onClick={() => handleSort('BlackoutDate')}>
                  Blackout Date{sortField === 'BlackoutDate' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2} className="loading-cell">Loading blackout dates...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={2} className="empty-cell">No blackout dates found.</td></tr>
            ) : rows.map((row) => (
              <tr key={row.BlackoutDateID} className="permit-row" onClick={() => openEditDate(row)}>
                <td>{row.TypeID === 1 ? '🍂 Open Burn' : row.TypeID === 2 ? '⛺ Campfire' : row.TypeID}</td>
                <td>{formatBlackoutDate(row.BlackoutDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <span className="summary">Showing {rows.length} of {pagination.total} blackout dates</span>
        <div className="pager">
          <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={loading || !pagination.hasPreviousPage}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || !pagination.hasNextPage}>Next</button>
        </div>
      </div>

      {editorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <section className="permit-modal blackout-date-modal" role="dialog" aria-modal="true" aria-labelledby="blackout-date-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-kicker">Blackout date</p>
                <h2 id="blackout-date-title">{editingDate ? 'Edit blackout date' : 'New blackout date'}</h2>
              </div>
              <button type="button" className="close-button" aria-label="Close blackout date form" onClick={closeEditor}>×</button>
            </div>
            <form onSubmit={saveBlackoutDate}>
              <div className="form-grid">
                <label>
                  Permit type
                  <select value={draft.TypeID} onChange={(event) => setDraft((current) => ({ ...current, TypeID: event.target.value }))} required>
                    <option value="1">Open Burn</option>
                    <option value="2">Campfire</option>
                  </select>
                </label>
                <label>
                  Blackout date
                  <input type="date" value={draft.BlackoutDate} onChange={(event) => setDraft((current) => ({ ...current, BlackoutDate: event.target.value }))} required />
                </label>
              </div>
              {modalError ? <div className="error-panel modal-error" role="alert">{modalError}</div> : null}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancel</button>
                <button type="submit" className="submit-button" disabled={saving}>{saving ? 'Saving...' : 'Save blackout date'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
