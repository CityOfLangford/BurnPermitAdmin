import { getSqlPool, sql } from '../config/db.js';
const ALLOWED_PAGE_SIZES = [10, 25, 100, 200, 500];
const DEFAULT_SORT_FIELD = 'PermitDate';
const DEFAULT_SORT_DIRECTION = 'desc';
const permitStatusIds = {
    granted: 1,
};
export function parsePermitStatus(value) {
    if (typeof value === 'number' && Number.isInteger(value))
        return value;
    const numericValue = Number(value);
    if (Number.isInteger(numericValue))
        return numericValue;
    const mappedValue = permitStatusIds[String(value).trim().toLowerCase()];
    if (mappedValue !== undefined)
        return mappedValue;
    throw new Error(`Unsupported permit status: ${value}`);
}
const fieldMap = {
    PermitDate: 'PermitDate',
    PermitNumber: 'PermitNumber',
    Applicant: 'Applicant',
    PermitAddress: 'PermitAddress',
    PermitType: 'PermitType',
    PermitStatus: 'PermitStatus',
};
export function parseOptionalInt(value, fallback) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
export function parseOptionalDate(value) {
    if (!value)
        return undefined;
    const dateValue = new Date(value);
    return Number.isNaN(dateValue.getTime()) ? undefined : dateValue.toISOString().slice(0, 10);
}
export function normalizeSort(sortField, sortDirection) {
    const safeField = (fieldMap[String(sortField ?? DEFAULT_SORT_FIELD)] ?? DEFAULT_SORT_FIELD);
    const normalizedDirection = sortDirection === 'asc' ? 'asc' : 'desc';
    return { safeField, normalizedDirection };
}
export function applySorting(rows, sortField, sortDirection) {
    const { safeField, normalizedDirection } = normalizeSort(sortField, sortDirection);
    return [...rows].sort((a, b) => {
        const left = a[safeField] ?? '';
        const right = b[safeField] ?? '';
        const leftValue = String(left);
        const rightValue = String(right);
        const result = leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0;
        return normalizedDirection === 'asc' ? result : -result;
    });
}
export async function getPermits(params = {}, poolFactory = getSqlPool) {
    const systemId = parseOptionalInt(params.systemId ?? null, null);
    const startDate = parseOptionalDate(params.startDate ?? undefined);
    const endDate = parseOptionalDate(params.endDate ?? undefined);
    const page = Math.max(parseOptionalInt(params.page ?? 1, 1) ?? 1, 1);
    const requestedPageSize = parseOptionalInt(params.pageSize ?? 20, 20) ?? 20;
    const pageSize = ALLOWED_PAGE_SIZES.includes(requestedPageSize)
        ? requestedPageSize
        : 20;
    const { safeField, normalizedDirection } = normalizeSort(params.sortField, params.sortDirection);
    const pool = await poolFactory();
    const request = pool.request();
    request.input('systemId', sql.Int, systemId ?? null);
    request.input('startDate', sql.Date, startDate ?? null);
    request.input('endDate', sql.Date, endDate ?? null);
    const result = await request.execute('dbo.colsp_ListPermits');
    const rows = (result.recordset ?? []).map((row) => ({
        PermitID: typeof row.PermitID === 'number' ? row.PermitID : null,
        PeriodID: typeof row.PeriodID === 'number' ? row.PeriodID : null,
        TypeID: typeof row.TypeID === 'number' ? row.TypeID : null,
        PermitDate: typeof row.PermitDate === 'string' || row.PermitDate instanceof Date ? (row.PermitDate instanceof Date ? row.PermitDate.toISOString().slice(0, 10) : new Date(row.PermitDate).toISOString().slice(0, 10)) : null,
        PermitStartTime: typeof row.PermitStartTime === 'number' ? row.PermitStartTime : null,
        PermitEndTime: typeof row.PermitEndTime === 'number' ? row.PermitEndTime : null,
        FirstName: typeof row.FirstName === 'string' ? row.FirstName : null,
        LastName: typeof row.LastName === 'string' ? row.LastName : null,
        PhoneNumber: typeof row.PhoneNumber === 'string' ? row.PhoneNumber : null,
        Email: typeof row.Email === 'string' ? row.Email : null,
        PermitNumber: typeof row.PermitNumber === 'string' ? row.PermitNumber : null,
        Applicant: typeof row.Applicant === 'string' ? row.Applicant : null,
        PermitAddress: typeof row.PermitAddress === 'string' ? row.PermitAddress : null,
        PermitType: typeof row.PermitType === 'string' ? row.PermitType : null,
        PermitStatus: typeof row.PermitStatus === 'string' ? row.PermitStatus : null,
    }));
    const search = params.search?.trim().toLocaleLowerCase();
    const matchingRows = search
        ? rows.filter((row) => [row.PermitNumber, row.Applicant, row.PermitAddress]
            .some((value) => value?.toLocaleLowerCase().includes(search)))
        : rows;
    const sortedRows = applySorting(matchingRows, safeField, normalizedDirection);
    const total = sortedRows.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * pageSize;
    const pagedRows = sortedRows.slice(startIndex, startIndex + pageSize);
    return {
        data: pagedRows,
        pagination: {
            page: safePage,
            pageSize,
            total,
            totalPages,
            hasNextPage: safePage < totalPages,
            hasPreviousPage: safePage > 1,
        },
        sort: {
            field: safeField,
            direction: normalizedDirection,
        },
    };
}
export async function getPermitPeriods(systemId = 1, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('systemID', sql.Int, systemId);
    const result = await request.execute('dbo.colsp_GetPermitPeriods');
    return (result.recordset ?? []).map((row) => ({
        PeriodID: Number(row.PeriodID),
        Name: typeof row.Name === 'string' ? row.Name : null,
        StartDate: row.StartDate instanceof Date ? row.StartDate.toISOString().slice(0, 10) : typeof row.StartDate === 'string' ? row.StartDate : null,
        EndDate: row.EndDate instanceof Date ? row.EndDate.toISOString().slice(0, 10) : typeof row.EndDate === 'string' ? row.EndDate : null,
        BookingStartDate: row.BookingStartDate instanceof Date ? row.BookingStartDate.toISOString().slice(0, 10) : typeof row.BookingStartDate === 'string' ? row.BookingStartDate : null,
        BookingEndDate: row.BookingEndDate instanceof Date ? row.BookingEndDate.toISOString().slice(0, 10) : typeof row.BookingEndDate === 'string' ? row.BookingEndDate : null,
        TypeID: typeof row.TypeID === 'number' ? row.TypeID : null,
    })).filter((period) => Number.isInteger(period.PeriodID));
}
export async function submitPermit(application, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('permitPeriod', sql.Int, application.permitPeriod);
    request.input('streetNumber', sql.NVarChar(10), application.streetNumber);
    request.input('streetName', sql.NVarChar(100), application.streetName);
    request.input('firstName', sql.NVarChar(50), application.firstName);
    request.input('lastName', sql.NVarChar(50), application.lastName);
    request.input('phoneNumber', sql.NVarChar(20), application.phoneNumber);
    request.input('email', sql.NVarChar(255), application.email);
    request.input('requestedDate', sql.Date, application.requestedDate);
    const procedure = application.permitType === 'campfire'
        ? 'dbo.colsp_SubmitCampfirePermitApplication'
        : 'dbo.colsp_SubmitOpenBurnPermitApplication';
    if (application.permitType === 'campfire') {
        request.input('permitStartTime', sql.Int, application.permitStartTime);
        request.input('permitEndTime', sql.Int, application.permitEndTime);
    }
    const result = await request.execute(procedure);
    const recordsets = result.recordsets ?? [];
    const firstRecordset = recordsets[0];
    const secondRecordset = recordsets[1];
    return {
        eligibility: firstRecordset?.[0] ?? null,
        permit: secondRecordset?.[0] ?? null,
    };
}
export async function updatePermit(permit, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('permitID', sql.Int, permit.permitId);
    request.input('firstName', sql.NVarChar(50), permit.firstName);
    request.input('lastName', sql.NVarChar(50), permit.lastName);
    request.input('phoneNumber', sql.NVarChar(20), permit.phoneNumber);
    request.input('email', sql.NVarChar(255), permit.email);
    request.input('streetNumber', sql.NVarChar(10), permit.streetNumber);
    request.input('streetName', sql.NVarChar(100), permit.streetName);
    request.input('permitDate', sql.DateTime, permit.permitDate);
    request.input('permitStatus', sql.Int, parsePermitStatus(permit.permitStatus));
    request.input('periodID', sql.Int, permit.permitPeriod);
    const typeID = typeof permit.permitType === 'number'
        ? permit.permitType
        : Number(permit.permitType) || (permit.permitType.toLowerCase().includes('camp') ? 2 : 1);
    request.input('typeID', sql.Int, typeID);
    request.input('permitStartTime', sql.Int, permit.permitStartTime ?? null);
    request.input('permitEndTime', sql.Int, permit.permitEndTime ?? null);
    await request.execute('dbo.colsp_UpdatePermit');
}
