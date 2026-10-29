import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiFetch } from '../auth/apiFetch';

type PermitField = 'PermitDate' | 'PermitNumber' | 'Applicant' | 'PermitAddress' | 'PermitType' | 'PermitStatus';
type SortDirection = 'asc' | 'desc';

type PermitRow = {
  PermitID: number | null;
  PeriodID?: number | null;
  TypeID?: number | null;
  PermitDate: string | null;
  PermitStartTime?: number | null;
  PermitEndTime?: number | null;
  FirstName?: string | null;
  LastName?: string | null;
  PhoneNumber?: string | null;
  Email?: string | null;
  PermitNumber: string | null;
  Applicant: string | null;
  PermitAddress: string | null;
  PermitType: string | null;
  PermitStatus: string | null;
};

type PermitDetailsDraft = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  streetNumber: string;
  streetName: string;
  permitDate: string;
  permitStatus: string;
  permitType: string;
  permitPeriod: string;
  permitStartTime: string;
  permitEndTime: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type PermitApiResponse = {
  data: PermitRow[];
  pagination: Pagination;
  sort: {
    field: PermitField;
    direction: SortDirection;
  };
};

type PermitPeriod = {
  PeriodID: number;
  Name: string | null;
  StartDate: string | null;
  EndDate: string | null;
  TypeID: number | null;
};

type PermitType = 'open-burn' | 'campfire';

export function getOpenBurnPeriods(periods: PermitPeriod[]): PermitPeriod[] {
  return periods.filter((period) => period.TypeID === 1);
}

type PermitForm = {
  permitType: PermitType;
  permitPeriod: string;
  streetNumber: string;
  streetName: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  requestedDate: string;
  permitStartTime: string;
  permitEndTime: string;
};

const CAMPFIRE_START_TIMES = Array.from({ length: 22 }, (_value, hour) => hour);

export function getCampfireEndTime(startTime: string): string {
  const startHour = Number(startTime);
  return Number.isInteger(startHour) && startHour >= 0 && startHour <= 21 ? String(startHour + 3) : '';
}

export function buildPermitApplication(form: PermitForm): Record<string, string | number> {
  const application: Record<string, string | number> = {
    permitType: form.permitType,
    permitPeriod: form.permitType === 'campfire' ? 14 : Number(form.permitPeriod),
    streetNumber: form.streetNumber.trim(),
    streetName: form.streetName.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    phoneNumber: form.phoneNumber.trim(),
    email: form.email.trim(),
    requestedDate: form.requestedDate,
  };

  if (form.permitType === 'campfire') {
    application.permitStartTime = Number(form.permitStartTime);
    application.permitEndTime = Number(form.permitEndTime);
  }

  return application;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyPermitForm(): PermitForm {
  return {
    permitType: 'open-burn',
    permitPeriod: '1',
    streetNumber: '',
    streetName: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    requestedDate: today(),
    permitStartTime: '0',
    permitEndTime: '3',
  };
}

const PAGE_SIZES = [10, 25, 100, 200, 500] as const;
const columns: Array<{ key: PermitField; label: string }> = [
  { key: 'PermitDate', label: 'Permit Date' },
  { key: 'PermitNumber', label: 'Permit Number' },
  { key: 'Applicant', label: 'Name' },
  { key: 'PermitAddress', label: 'Address' },
  { key: 'PermitType', label: 'Permit Type' },
  { key: 'PermitStatus', label: 'Status' },
];

export function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function buildPermitQueryParams(page: number, pageSize: number, sortField: PermitField, sortDirection: SortDirection, systemId?: number): URLSearchParams {
  return new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sortField,
    sortDirection,
    ...(systemId === undefined ? {} : { systemId: String(systemId) }),
  });
}

export type PageIndicator = number | 'ellipsis';

export function getPageNumbers(totalPages: number, currentPage = 1): PageIndicator[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_value, index) => index + 1);

  const page = Math.min(Math.max(currentPage, 1), totalPages);
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  if (page >= totalPages - 3) return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}

export function shouldShowTopPagination(pageSize: number): boolean {
  return pageSize > 10;
}

export function toggleSort(currentField: PermitField, currentDirection: SortDirection, nextField: PermitField): { field: PermitField; direction: SortDirection } {
  if (currentField === nextField) {
    return { field: currentField, direction: currentDirection === 'asc' ? 'desc' : 'asc' };
  }
  return { field: nextField, direction: 'asc' };
}

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  pageNumbers: PageIndicator[];
  loading: boolean;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPageSizeChange: (pageSize: number) => void;
  onPageChange: (page: number) => void;
  onPrevious: () => void;
  onNext: () => void;
};

function PaginationControls({ page, pageSize, pageNumbers, loading, hasPreviousPage, hasNextPage, onPageSizeChange, onPageChange, onPrevious, onNext }: PaginationControlsProps) {
  return (
    <div className="pagination-row">
      <label className="page-size-control">
        Rows per page
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div className="pager">
        <button type="button" disabled={!hasPreviousPage || loading} onClick={onPrevious}>Previous</button>
        <div className="page-indicator">
          {pageNumbers.map((pageNumber, index) => (
            pageNumber === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="page-ellipsis" aria-hidden="true">...</span>
            ) : (
              <button key={pageNumber} type="button" className={pageNumber === page ? 'active-page' : ''} aria-current={pageNumber === page ? 'page' : undefined} onClick={() => onPageChange(pageNumber)} disabled={loading}>{pageNumber}</button>
            )
          ))}
        </div>
        <button type="button" disabled={!hasNextPage || loading} onClick={onNext}>Next</button>
      </div>
    </div>
  );
}

export function formatPermitType(row: PermitRow): string {
  const isCampfire = row.TypeID === 2 || row.PermitType?.toLowerCase().includes('camp');
  return `${isCampfire ? '🏕️ Campfire' : '🍂 Open Burn'}`;
}

export function isCancelledStatus(status: string | null): boolean {
  return status?.trim().toLowerCase() === 'cancelled';
}

export function printPermit(): void {
  window.print();
}

function permitDraftFromRow(permit: PermitRow): PermitDetailsDraft {
  const applicantParts = permit.Applicant?.split(' ') || [];
  const addressParts = permit.PermitAddress?.split(' ') || [];
  const status = permit.PermitStatus?.toLowerCase() === 'granted' ? '1' : permit.PermitStatus || '0';
  const type = permit.TypeID ? String(permit.TypeID) : permit.PermitType?.toLowerCase().includes('camp') ? '2' : '1';

  return {
    firstName: permit.FirstName || applicantParts[0] || '',
    lastName: permit.LastName || applicantParts.slice(1).join(' '),
    phoneNumber: permit.PhoneNumber || '',
    email: permit.Email || '',
    streetNumber: addressParts[0] || '',
    streetName: permit.PermitAddress?.replace(`${addressParts[0]} `, '') || '',
    permitDate: permit.PermitDate || '',
    permitStatus: status,
    permitType: type,
    permitPeriod: String(permit.PeriodID || (type === '2' ? 14 : '')),
    permitStartTime: permit.PermitStartTime === null || permit.PermitStartTime === undefined ? '' : String(permit.PermitStartTime),
    permitEndTime: permit.PermitStartTime === null || permit.PermitStartTime === undefined ? '' : getCampfireEndTime(String(permit.PermitStartTime)),
  };
}

type PermitDetailsProps = {
  permit: PermitRow;
  permitPeriods: PermitPeriod[];
  onBack: () => void;
  onSaved: (permit: PermitRow) => void;
};

function PermitDetails({ permit, permitPeriods, onBack, onSaved }: PermitDetailsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PermitDetailsDraft>(() => permitDraftFromRow(permit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const permitPeriodName = permitPeriods.find((period) => period.PeriodID === Number(draft.permitPeriod))?.Name
    || (draft.permitPeriod ? `Period ${draft.permitPeriod}` : '—');
  const openBurnPeriods = getOpenBurnPeriods(permitPeriods);

  const updateDraft = (field: keyof PermitDetailsDraft, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (permit.PermitID === null) return;
    setSaving(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/permits/${permit.PermitID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permitId: permit.PermitID,
          ...draft,
          permitStatus: Number(draft.permitStatus),
          permitType: Number(draft.permitType),
          permitPeriod: draft.permitType === '2' ? 14 : Number(draft.permitPeriod),
          permitStartTime: draft.permitStartTime === '' ? null : Number(draft.permitStartTime),
          permitEndTime: draft.permitEndTime === '' ? null : Number(draft.permitEndTime),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || 'Unable to save permit');
      }

      onSaved({
        ...permit,
        Applicant: `${draft.firstName} ${draft.lastName}`.trim(),
        PermitAddress: `${draft.streetNumber} ${draft.streetName}`.trim(),
        PermitDate: draft.permitDate,
        PermitStatus: draft.permitStatus === '1' ? 'Granted' : 'Cancelled',
        PermitType: draft.permitType === '2' ? 'Campfire' : 'Open Burn',
        TypeID: Number(draft.permitType),
        PeriodID: draft.permitType === '2' ? 14 : Number(draft.permitPeriod),
        PermitStartTime: draft.permitStartTime === '' ? null : Number(draft.permitStartTime),
        PermitEndTime: draft.permitEndTime === '' ? null : Number(draft.permitEndTime),
        FirstName: draft.firstName,
        LastName: draft.lastName,
        PhoneNumber: draft.phoneNumber,
        Email: draft.email,
      });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save permit');
    } finally {
      setSaving(false);
    }
  };

  const displayValue = (value: string | null): string => value || '—';

  return (
    <div className="permit-details-page">
      <header className="details-header">
        <button type="button" className="back-button" onClick={onBack}>← Back to permits</button>
        <div className="details-actions">
          {editing ? (
            <>
              <button type="button" className="secondary-button" onClick={() => { setDraft(permitDraftFromRow(permit)); setError(null); setEditing(false); }} disabled={saving}>Cancel</button>
              <button type="submit" form="permit-details-form" className="submit-button" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </>
          ) : (
            <>
              <button type="button" className="print-button" onClick={printPermit}>Generate Permit PDF</button>
              <button type="button" className="submit-button" onClick={(event) => { event.preventDefault(); setDraft(permitDraftFromRow(permit)); setError(null); setEditing(true); }}>Edit</button>
            </>
          )}
        </div>
      </header>

      <div className="details-title-row">
        <h1>{displayValue(permit.PermitNumber)}</h1>
        <span>ID#{displayValue(permit.PermitID === null ? null : String(permit.PermitID))}</span>
      </div>

      <form id="permit-details-form" onSubmit={save}>
        <div className="details-grid">
          <section className="details-section">
            <h2>Contact Details</h2>
            <DetailField label="First name" value={editing ? draft.firstName : permitDraftFromRow(permit).firstName} editing={editing} onChange={(value) => updateDraft('firstName', value)} />
            <DetailField label="Last name" value={editing ? draft.lastName : permitDraftFromRow(permit).lastName} editing={editing} onChange={(value) => updateDraft('lastName', value)} />
            <DetailField label="Email" value={editing ? draft.email : permit.Email || ''} editing={editing} required={false} onChange={(value) => updateDraft('email', value)} />
            <DetailField label="Phone number" value={editing ? draft.phoneNumber : permit.PhoneNumber || ''} editing={editing} required={false} onChange={(value) => updateDraft('phoneNumber', value)} />
          </section>
          <section className="details-section">
            <h2>Address Information</h2>
            <DetailField label="Street number" value={editing ? draft.streetNumber : permitDraftFromRow(permit).streetNumber} editing={editing} onChange={(value) => updateDraft('streetNumber', value)} />
            <DetailField label="Street name" value={editing ? draft.streetName : permitDraftFromRow(permit).streetName} editing={editing} onChange={(value) => updateDraft('streetName', value)} />
          </section>
          <section className="details-section permit-details-section">
            <h2>Permit Details</h2>
            <div className="permit-details-columns">
              <div>
                {editing ? (
                  <label className="detail-field"><span>Permit type</span><select value={draft.permitType} onChange={(event) => updateDraft('permitType', event.target.value)} required><option value="2">Campfire</option><option value="1">Open Burn</option></select></label>
                ) : <DetailField label="Permit type" value={permit.PermitType} editing={false} onChange={() => undefined} />}
                {editing ? (
                  <label className="detail-field"><span>Status</span><select value={draft.permitStatus} onChange={(event) => updateDraft('permitStatus', event.target.value)}><option value="1">Granted</option><option value="0">Cancelled</option></select></label>
                ) : <DetailField label="Status" value={permit.PermitStatus} editing={false} onChange={() => undefined} />}
              </div>
              <div>
                <DetailField label="Permit date" value={editing ? draft.permitDate : permit.PermitDate} editing={editing} type="date" onChange={(value) => updateDraft('permitDate', value)} />
                {draft.permitType === '1' ? (
                  editing ? (
                    <label className="detail-field"><span>Permit period</span><select value={draft.permitPeriod} onChange={(event) => updateDraft('permitPeriod', event.target.value)} required>
                      {openBurnPeriods.map((period) => <option key={period.PeriodID} value={period.PeriodID}>{period.Name || `Period ${period.PeriodID}`}</option>)}
                    </select></label>
                  ) : <DetailField label="Permit period" value={permitPeriodName} editing={false} onChange={() => undefined} />
                ) : draft.permitType === '2' ? (
                  <div className="permit-time-row">
                    {editing ? (
                      <label className="detail-field">
                        <span>Start time</span>
                        <select value={draft.permitStartTime} onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, permitStartTime: value, permitEndTime: getCampfireEndTime(value) })); }} required>
                          {CAMPFIRE_START_TIMES.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                        </select>
                      </label>
                    ) : <DetailField label="Start time" value={draft.permitStartTime ? `${draft.permitStartTime}:00` : null} editing={false} onChange={() => undefined} />}
                    <DetailField label="End time" value={draft.permitEndTime ? `${draft.permitEndTime}:00` : null} editing={false} onChange={() => undefined} />
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </form>
      {error ? <div className="error-panel details-error">{error}</div> : null}
    </div>
  );
}

function DetailField({ label, value, editing, type = 'text', required = true, onChange }: { label: string; value: string | null; editing: boolean; type?: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="detail-field">
      <span>{label}</span>
      {editing ? <input type={type} value={value || ''} onChange={(event) => onChange(event.target.value)} required={required} /> : <strong>{value || '—'}</strong>}
    </label>
  );
}

type AllPermitsProps = {
  systemId?: number;
  title?: string;
};

export default function AllPermits({ systemId, title = 'All Burn Permits' }: AllPermitsProps) {
  const [rows, setRows] = useState<PermitRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortField, setSortField] = useState<PermitField>('PermitDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isNewPermitOpen, setIsNewPermitOpen] = useState<boolean>(false);
  const [permitForm, setPermitForm] = useState<PermitForm>(emptyPermitForm);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedPermit, setSelectedPermit] = useState<PermitRow | null>(null);
  const [permitPeriods, setPermitPeriods] = useState<PermitPeriod[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  });

  const fetchPermits = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      const params = buildPermitQueryParams(page, pageSize, sortField, sortDirection, systemId);

      const response = await apiFetch(`/api/permits?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Unable to load permits');
      }

      const payload = (await response.json()) as PermitApiResponse;
      setRows(payload.data || []);
      setPagination(payload.pagination || { page: 1, pageSize, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Unable to load permits';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPermits();
  }, [page, pageSize, sortField, sortDirection, systemId]);

  useEffect(() => {
    void apiFetch(`/api/permit-periods${systemId === undefined ? '' : `?systemId=${systemId}`}`)
      .then(async (response) => response.ok ? response.json() as Promise<PermitPeriod[]> : [])
      .then((periods) => {
        setPermitPeriods(periods);
        if (periods.length > 0) {
          setPermitForm((current) => current.permitType === 'open-burn' && !periods.some((period) => String(period.PeriodID) === current.permitPeriod)
            ? { ...current, permitPeriod: String(periods[0].PeriodID) }
            : current);
        }
      })
      .catch(() => setPermitPeriods([]));
  }, [systemId]);

  const handleSort = (field: PermitField): void => {
    const nextSort = toggleSort(sortField, sortDirection, field);
    setSortField(nextSort.field);
    setSortDirection(nextSort.direction);
  };

  const refreshPermits = (): void => {
    if (page !== 1) {
      setPage(1);
      return;
    }

    void fetchPermits();
  };

  const updateForm = (field: keyof PermitForm, value: string): void => {
    setPermitForm((current) => ({ ...current, [field]: value }));
  };

  const closeNewPermit = (): void => {
    if (!submitting) {
      setIsNewPermitOpen(false);
      setSubmitError(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await apiFetch('/api/permits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPermitApplication(permitForm)),
      });
      const payload = (await response.json()) as { error?: string; eligibility?: { responseMessage?: string }; permit?: Record<string, unknown> | null };
      if (!response.ok) throw new Error(payload.error || 'Unable to create permit');
      if (!payload.permit) {
        throw new Error(payload.eligibility?.responseMessage || 'Permit could not be created');
      }

      setPermitForm(emptyPermitForm());
      setIsNewPermitOpen(false);
      await fetchPermits();
    } catch (submitLoadError) {
      setSubmitError(submitLoadError instanceof Error ? submitLoadError.message : 'Unable to create permit');
    } finally {
      setSubmitting(false);
    }
  };

  const pageNumbers = useMemo<PageIndicator[]>(() => {
    return getPageNumbers(pagination.totalPages, page);
  }, [pagination.totalPages, page]);

  if (selectedPermit) {
    return (
      <PermitDetails permit={selectedPermit} permitPeriods={permitPeriods} onBack={() => setSelectedPermit(null)} onSaved={(permit) => { setSelectedPermit(permit); setRows((current) => current.map((row) => row.PermitID === permit.PermitID ? permit : row)); }} />
    );
  }

  return (
    <div className="page-shell">
      <header className="toolbar">
        <div>
          <h1>{title}</h1>
          <button type="button" className="secondary-button refresh-button" onClick={refreshPermits} disabled={loading}> ⟳ </button>
        </div>
        <div className="toolbar-right">
          <button type="button" className="new-permit-button" onClick={() => setIsNewPermitOpen(true)}>
            <span aria-hidden="true">+</span> New permit
          </button>
        </div>
      </header>

      {error ? <div className="error-panel">{error}</div> : null}

      {shouldShowTopPagination(pageSize) ? (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          pageNumbers={pageNumbers}
          loading={loading}
          hasPreviousPage={pagination.hasPreviousPage}
          hasNextPage={pagination.hasNextPage}
          onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
          onPageChange={setPage}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => current + 1)}
        />
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>
                  <button type="button" className="sort-button" onClick={() => handleSort(column.key)}>
                    {column.label}
                    {sortField === column.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="loading-cell">
                  Loading permits...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  No permits found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.PermitNumber}-${row.PermitDate}`} className="permit-row" onClick={() => setSelectedPermit(row)}>
                  <td>{formatDate(row.PermitDate)}</td>
                  <td>{row.PermitNumber || '—'}</td>
                  <td>{row.Applicant || '—'}</td>
                  <td>{row.PermitAddress || '—'}</td>
                  <td>{row.PermitType ? formatPermitType(row) : '—'}</td>
                  <td className={isCancelledStatus(row.PermitStatus) ? 'cancelled-status' : ''}>{row.PermitStatus || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        pageNumbers={pageNumbers}
        loading={loading}
        hasPreviousPage={pagination.hasPreviousPage}
        hasNextPage={pagination.hasNextPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onPageChange={setPage}
        onPrevious={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />

      <div className="summary">Showing {rows.length} of {pagination.total} permits</div>

      {isNewPermitOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeNewPermit}>
          <section className="permit-modal" role="dialog" aria-modal="true" aria-labelledby="new-permit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="modal-kicker">Permit application</p>
                <h2 id="new-permit-title">New permit</h2>
              </div>
              <button type="button" className="close-button" aria-label="Close new permit form" onClick={closeNewPermit}>×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  Permit type
                  <select value={permitForm.permitType} onChange={(event) => updateForm('permitType', event.target.value)}>
                    <option value="open-burn">Open burn</option>
                    <option value="campfire">Campfire</option>
                  </select>
                </label>
                {permitForm.permitType === 'open-burn' ? (
                  <label>
                    Permit period
                    <select value={permitForm.permitPeriod} onChange={(event) => updateForm('permitPeriod', event.target.value)} required>
                      {getOpenBurnPeriods(permitPeriods).map((period) => <option key={period.PeriodID} value={period.PeriodID}>{period.Name || `Period ${period.PeriodID}`}</option>)}
                    </select>
                  </label>
                ) : <div className="form-grid-placeholder" aria-hidden="true" />}
                <label>
                  Permit date
                  <input type="date" value={permitForm.requestedDate} onChange={(event) => updateForm('requestedDate', event.target.value)} required />
                </label>
                {permitForm.permitType === 'campfire' ? (
                  <div className="modal-time-fields">
                    <label>
                      Start time
                      <select value={permitForm.permitStartTime} onChange={(event) => { const value = event.target.value; setPermitForm((current) => ({ ...current, permitStartTime: value, permitEndTime: getCampfireEndTime(value) })); }} required>
                        {CAMPFIRE_START_TIMES.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                      </select>
                    </label>
                    <label>
                      End time
                      <input type="text" value={`${permitForm.permitEndTime}:00`} readOnly aria-readonly="true" />
                    </label>
                  </div>
                ) : <div className="form-grid-placeholder" aria-hidden="true" />}
                <label>
                  First name
                  <input value={permitForm.firstName} onChange={(event) => updateForm('firstName', event.target.value)} required />
                </label>
                <label>
                  Last name
                  <input value={permitForm.lastName} onChange={(event) => updateForm('lastName', event.target.value)} required />
                </label>
                <label>
                  Email
                  <input type="email" value={permitForm.email} onChange={(event) => updateForm('email', event.target.value)} required />
                </label>
                <label>
                  Phone number
                  <input type="tel" value={permitForm.phoneNumber} onChange={(event) => updateForm('phoneNumber', event.target.value)} required />
                </label>
                <label>
                  Street number
                  <input value={permitForm.streetNumber} onChange={(event) => updateForm('streetNumber', event.target.value)} required />
                </label>
                <label>
                  Street name
                  <input value={permitForm.streetName} onChange={(event) => updateForm('streetName', event.target.value)} required />
                </label>
              </div>

              {submitError ? <div className="error-panel modal-error">{submitError}</div> : null}
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeNewPermit} disabled={submitting}>Cancel</button>
                <button type="submit" className="submit-button" disabled={submitting}>{submitting ? 'Creating...' : 'Create permit'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      </div>
  );
}
