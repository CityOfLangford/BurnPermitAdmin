import { getSqlPool, sql } from '../config/db.js';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DATE_FIELDS = ['StartDate', 'EndDate', 'BookingStartDate', 'BookingEndDate'];
const sortFields = ['PeriodID', 'Name', 'StartDate', 'EndDate', 'BookingStartDate', 'BookingEndDate', 'TypeID'];
export function normalizePermitPeriodSort(field, direction) {
    return {
        field: sortFields.includes(field) ? field : 'PeriodID',
        direction: direction === 'asc' ? 'asc' : 'desc',
    };
}
function parseSqlDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return null;
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1753-01-01')
        return null;
    return date;
}
export function parseAdminPermitPeriod(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const input = value;
    if (typeof input.Name !== 'string' || input.Name.trim().length === 0 || input.Name.trim().length > 100
        || (input.TypeID !== 1 && input.TypeID !== 2))
        return null;
    const startDate = parseSqlDate(input.StartDate);
    const endDate = parseSqlDate(input.EndDate);
    const bookingStartDate = parseSqlDate(input.BookingStartDate);
    const bookingEndDate = parseSqlDate(input.BookingEndDate);
    if (!startDate || !endDate || !bookingStartDate || !bookingEndDate)
        return null;
    return {
        Name: input.Name.trim(),
        TypeID: input.TypeID,
        StartDate: startDate,
        EndDate: endDate,
        BookingStartDate: bookingStartDate,
        BookingEndDate: bookingEndDate,
    };
}
function mapAdminPermitPeriod(row) {
    const periodID = Number(row.PeriodID);
    const typeID = row.TypeID === null || row.TypeID === undefined ? null : Number(row.TypeID);
    const dates = Object.fromEntries(DATE_FIELDS.map((field) => {
        const raw = row[field];
        const value = raw instanceof Date ? raw.toISOString().slice(0, 10) : typeof raw === 'string' ? raw.slice(0, 10) : null;
        return [field, value];
    }));
    if (!Number.isInteger(periodID) || (typeID !== null && !Number.isInteger(typeID))
        || typeof row.Name !== 'string' || DATE_FIELDS.some((field) => typeof dates[field] !== 'string')) {
        throw new Error('Database returned an invalid permit period record');
    }
    return {
        PeriodID: periodID,
        Name: row.Name,
        TypeID: typeID,
        StartDate: dates.StartDate,
        EndDate: dates.EndDate,
        BookingStartDate: dates.BookingStartDate,
        BookingEndDate: dates.BookingEndDate,
    };
}
export async function getAdminPermitPeriods(pageValue, pageSizeValue, sortFieldValue, sortDirectionValue, typeIDValue, poolFactory = getSqlPool) {
    const requestedPage = Number(pageValue);
    const requestedPageSize = Number(pageSizeValue);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
    const typeID = typeIDValue === '1' || typeIDValue === 1 ? 1 : typeIDValue === '2' || typeIDValue === 2 ? 2 : null;
    const { field, direction } = normalizePermitPeriodSort(sortFieldValue, sortDirectionValue);
    const pool = await poolFactory();
    const countRequest = pool.request();
    countRequest.input('typeID', sql.Int, typeID);
    const countResult = await countRequest.query(`
    SELECT COUNT(*) AS Total
    FROM [dbo].[PermitPeriods]
    WHERE (@typeID IS NULL OR [TypeID] = @typeID)
  `);
    const total = Number(countResult.recordset?.[0]?.Total ?? 0);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const request = pool.request();
    request.input('typeID', sql.Int, typeID);
    request.input('offset', sql.Int, (safePage - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);
    const orderByColumn = `[${field}]`;
    const tieBreaker = field === 'PeriodID' ? '' : `, [PeriodID] ${direction.toUpperCase()}`;
    const result = await request.query(`
    SELECT [PeriodID], [Name], [StartDate], [EndDate], [BookingStartDate], [BookingEndDate], [TypeID]
    FROM [dbo].[PermitPeriods]
    WHERE (@typeID IS NULL OR [TypeID] = @typeID)
    ORDER BY ${orderByColumn} ${direction.toUpperCase()}${tieBreaker}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);
    return {
        data: (result.recordset ?? []).map(mapAdminPermitPeriod),
        pagination: {
            page: safePage,
            pageSize,
            total,
            totalPages,
            hasNextPage: safePage < totalPages,
            hasPreviousPage: safePage > 1,
        },
    };
}
export async function createAdminPermitPeriod(value, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('name', sql.NVarChar(100), value.Name);
    request.input('typeID', sql.Int, value.TypeID);
    for (const field of DATE_FIELDS)
        request.input(field, sql.DateTime, value[field]);
    const result = await request.query(`
    INSERT INTO [dbo].[PermitPeriods] ([Name], [TypeID], [StartDate], [EndDate], [BookingStartDate], [BookingEndDate])
    OUTPUT INSERTED.[PeriodID], INSERTED.[Name], INSERTED.[StartDate], INSERTED.[EndDate], INSERTED.[BookingStartDate], INSERTED.[BookingEndDate], INSERTED.[TypeID]
    VALUES (@name, @typeID, @StartDate, @EndDate, @BookingStartDate, @BookingEndDate)
  `);
    const row = result.recordset?.[0];
    if (!row)
        throw new Error('Database did not return the created permit period');
    return mapAdminPermitPeriod(row);
}
export async function updateAdminPermitPeriod(periodID, value, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('periodID', sql.Int, periodID);
    request.input('name', sql.NVarChar(100), value.Name);
    request.input('typeID', sql.Int, value.TypeID);
    for (const field of DATE_FIELDS)
        request.input(field, sql.DateTime, value[field]);
    const result = await request.query(`
    UPDATE [dbo].[PermitPeriods]
    SET [Name] = @name, [TypeID] = @typeID, [StartDate] = @StartDate, [EndDate] = @EndDate,
        [BookingStartDate] = @BookingStartDate, [BookingEndDate] = @BookingEndDate
    OUTPUT INSERTED.[PeriodID], INSERTED.[Name], INSERTED.[StartDate], INSERTED.[EndDate], INSERTED.[BookingStartDate], INSERTED.[BookingEndDate], INSERTED.[TypeID]
    WHERE [PeriodID] = @periodID
  `);
    const row = result.recordset?.[0];
    return row ? mapAdminPermitPeriod(row) : null;
}
