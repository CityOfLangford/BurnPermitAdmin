import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../auth/apiFetch';
import { ADMIN_PAGE_SIZE, emptyPagination, formatDate, responseError, type PaginatedResponse, type Pagination } from './adminData';

type PermitPeriod = {
  PeriodID: number;
  Name: string;
  StartDate: string;
  EndDate: string;
  BookingStartDate: string;
  BookingEndDate: string;
  TypeID: number | null;
};

type PeriodDraft = {
  Name: string;
  TypeID: string;
  StartDate: string;
  EndDate: string;
  BookingStartDate: string;
  BookingEndDate: string;
};

type SortField = 'PeriodID' | 'Name' | 'StartDate' | 'EndDate' | 'BookingStartDate' | 'BookingEndDate' | 'TypeID';
type SortDirection = 'asc' | 'desc';

const periodFields: Array<{ key: SortField; label: string }> = [
  { key: 'TypeID', label: 'Permit Type' },
  { key: 'Name', label: 'Name' },
  { key: 'StartDate', label: 'Start Date' },
  { key: 'EndDate', label: 'End Date' },
  { key: 'BookingStartDate', label: 'Booking Start Date' },
  { key: 'BookingEndDate', label: 'Booking End Date' },
];

function emptyDraft(): PeriodDraft {
  return { Name: '', TypeID: '1', StartDate: '', EndDate: '', BookingStartDate: '', BookingEndDate: '' };
}

function periodDraft(period: PermitPeriod): PeriodDraft {
  return {
    Name: period.Name,
    TypeID: String(period.TypeID ?? 1),
    StartDate: period.StartDate.slice(0, 10),
    EndDate: period.EndDate.slice(0, 10),
    BookingStartDate: period.BookingStartDate.slice(0, 10),
    BookingEndDate: period.BookingEndDate.slice(0, 10),
  };
}

function permitType(typeID: number | null): string {
  return typeID === 1 ? '🍂 Open Burn' : typeID === 2 ? '⛺ Campfire' : typeID === null ? '—' : String(typeID);
}

export default function Periods() {
  const [rows, setRows] = useState<PermitPeriod[]>([]);
  const [pagination, setPagination] = useState<Pagination>(() => emptyPagination());
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('PeriodID');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<PermitPeriod | null>(null);
  const [draft, setDraft] = useState<PeriodDraft>(emptyDraft);

  const loadPeriods = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(ADMIN_PAGE_SIZE),
        sortField,
        sortDirection,
        ...(typeFilter ? { typeID: typeFilter } : {}),
      });
      const response = await apiFetch(`/api/periods?${params.toString()}`);
      if (!response.ok) throw new Error(await responseError(response, 'Unable to load permit periods'));
      const payload = await response.json() as PaginatedResponse<PermitPeriod>;
      setRows(payload.data);
      setPagination(payload.pagination);
      setPage(payload.pagination.page);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load permit periods');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPeriods();
  }, [page, sortField, sortDirection, typeFilter]);

  const openNewPeriod = (): void => {
    setEditingPeriod(null);
    setDraft(emptyDraft());
    setModalError(null);
    setEditorOpen(true);
  };

  const openEditPeriod = (period: PermitPeriod): void => {
    setEditingPeriod(period);
    setDraft(periodDraft(period));
    setModalError(null);
    setEditorOpen(true);
  };

  const closeEditor = (): void => {
    if (!saving) {
      setEditorOpen(false);
      setEditingPeriod(null);
      setModalError(null);
    }
  };

  const handleSort = (field: SortField): void => {
    if (sortField === field) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const savePeriod = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      const response = await apiFetch(editingPeriod ? `/api/periods/${editingPeriod.PeriodID}` : '/api/periods', {
        method: editingPeriod ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, TypeID: Number(draft.TypeID) }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Unable to save permit period'));
      setEditorOpen(false);
      setEditingPeriod(null);
      if (!editingPeriod && page !== 1) setPage(1);
      else await loadPeriods();
    } catch (saveError) {
      setModalError(saveError instanceof Error ? saveError.message : 'Unable to save permit period');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-shell" aria-labelledby="page-title">
      <header className="toolbar">
        <div>
          <h1 id="page-title">Permit Periods</h1>
          <button type="button" className="secondary-button refresh-button" onClick={() => void loadPeriods()} disabled={loading} aria-label="Refresh permit periods">⟳</button>
        </div>
        <div className="toolbar-right">
          <button type="button" className="new-permit-button" onClick={openNewPeriod}><span aria-hidden="true">+</span> New period</button>
        </div>
      </header>

      {error ? <div className="error-panel" role="alert">{error}</div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr>{periodFields.map(({ key, label }) => (
            <th key={key} aria-sort={sortField === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className="sort-button" onClick={() => handleSort(key)}>
                {label}{sortField === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            </th>
          ))}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="loading-cell">Loading permit periods...</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="empty-cell">No permit periods found.</td></tr>
                : rows.map((row) => (
                  <tr key={row.PeriodID} className="permit-row" onClick={() => openEditPeriod(row)}>
                    <td>{permitType(row.TypeID)}</td>
                    <td>{row.Name}</td>
                    <td>{formatDate(row.StartDate)}</td>
                    <td>{formatDate(row.EndDate)}</td>
                    <td>{formatDate(row.BookingStartDate)}</td>
                    <td>{formatDate(row.BookingEndDate)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <div className="pagination-row">
        <span className="summary">Showing {rows.length} of {pagination.total} permit periods</span>
        <div className="pager">
          <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={loading || !pagination.hasPreviousPage}>Previous</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={loading || !pagination.hasNextPage}>Next</button>
        </div>
      </div>

      {editorOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <section className="permit-modal" role="dialog" aria-modal="true" aria-labelledby="period-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div><p className="modal-kicker">Permit period</p><h2 id="period-title">{editingPeriod ? 'Edit permit period' : 'New permit period'}</h2></div>
              <button type="button" className="close-button" aria-label="Close permit period form" onClick={closeEditor}>×</button>
            </div>
            <form onSubmit={savePeriod}>
              <div className="form-grid">
                <label>Permit type<select value={draft.TypeID} onChange={(event) => setDraft((current) => ({ ...current, TypeID: event.target.value }))} required><option value="1">Open Burn</option><option value="2">Campfire</option></select></label>
                <label>Period name<input type="text" maxLength={100} value={draft.Name} onChange={(event) => setDraft((current) => ({ ...current, Name: event.target.value }))} required /></label>
                <label>Period start date<input type="date" value={draft.StartDate} onChange={(event) => setDraft((current) => ({ ...current, StartDate: event.target.value }))} required /></label>
                <label>Period end date<input type="date" value={draft.EndDate} onChange={(event) => setDraft((current) => ({ ...current, EndDate: event.target.value }))} required /></label>
                <label>Booking start date<input type="date" value={draft.BookingStartDate} onChange={(event) => setDraft((current) => ({ ...current, BookingStartDate: event.target.value }))} required /></label>
                <label>Booking end date<input type="date" value={draft.BookingEndDate} onChange={(event) => setDraft((current) => ({ ...current, BookingEndDate: event.target.value }))} required /></label>
              </div>
              {modalError ? <div className="error-panel modal-error" role="alert">{modalError}</div> : null}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Cancel</button>
                <button type="submit" className="submit-button" disabled={saving}>{saving ? 'Saving...' : 'Save period'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
