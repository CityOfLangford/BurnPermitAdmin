import { getSqlPool, sql } from '../config/db.js';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
export function normalizeBlackoutDateSort(field, direction) {
    return {
        field: field === 'TypeID' ? 'TypeID' : 'BlackoutDate',
        direction: direction === 'asc' ? 'asc' : 'desc',
    };
}
export function parseBlackoutDate(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const { TypeID, BlackoutDate } = value;
    if (TypeID !== 1 && TypeID !== 2)
        return null;
    if (typeof BlackoutDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(BlackoutDate))
        return null;
    const date = new Date(`${BlackoutDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== BlackoutDate || BlackoutDate < '1753-01-01')
        return null;
    return { TypeID, BlackoutDate: date };
}
function mapBlackoutDate(row) {
    const rawDate = row.BlackoutDate;
    const date = rawDate instanceof Date
        ? rawDate.toISOString().slice(0, 10)
        : typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawDate)
            ? rawDate.slice(0, 10)
            : null;
    const id = Number(row.BlackoutDateID);
    const typeId = Number(row.TypeID);
    if (!Number.isInteger(id) || !Number.isInteger(typeId) || date === null) {
        throw new Error('Database returned an invalid blackout date record');
    }
    return { BlackoutDateID: id, TypeID: typeId, BlackoutDate: date };
}
export async function getBlackoutDates(pageValue, pageSizeValue, sortFieldValue, sortDirectionValue, poolFactory = getSqlPool) {
    const parsedPage = Number(pageValue);
    const parsedPageSize = Number(pageSizeValue);
    const { field: sortField, direction: sortDirection } = normalizeBlackoutDateSort(sortFieldValue, sortDirectionValue);
    const pageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const pool = await poolFactory();
    const countResult = await pool.request().query('SELECT COUNT(*) AS Total FROM [dbo].[BlackoutDates]');
    const total = Number(countResult.recordset?.[0]?.Total ?? 0);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const request = pool.request();
    request.input('offset', sql.Int, (safePage - 1) * pageSize);
    request.input('pageSize', sql.Int, pageSize);
    const orderByColumn = sortField === 'TypeID' ? '[TypeID]' : '[BlackoutDate]';
    const result = await request.query(`
    SELECT [BlackoutDateID], [TypeID], [BlackoutDate]
    FROM [dbo].[BlackoutDates]
    ORDER BY ${orderByColumn} ${sortDirection.toUpperCase()}, [BlackoutDateID] ${sortDirection.toUpperCase()}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);
    return {
        data: (result.recordset ?? []).map(mapBlackoutDate),
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
export async function createBlackoutDate(value, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('typeId', sql.Int, value.TypeID);
    request.input('blackoutDate', sql.Date, value.BlackoutDate);
    const result = await request.query(`
    INSERT INTO [dbo].[BlackoutDates] ([TypeID], [BlackoutDate])
    OUTPUT INSERTED.[BlackoutDateID], INSERTED.[TypeID], INSERTED.[BlackoutDate]
    VALUES (@typeId, @blackoutDate)
  `);
    const row = result.recordset?.[0];
    if (!row)
        throw new Error('Database did not return the created blackout date');
    return mapBlackoutDate(row);
}
export async function updateBlackoutDate(id, value, poolFactory = getSqlPool) {
    const pool = await poolFactory();
    const request = pool.request();
    request.input('blackoutDateId', sql.Int, id);
    request.input('typeId', sql.Int, value.TypeID);
    request.input('blackoutDate', sql.Date, value.BlackoutDate);
    const result = await request.query(`
    UPDATE [dbo].[BlackoutDates]
    SET [TypeID] = @typeId, [BlackoutDate] = @blackoutDate
    OUTPUT INSERTED.[BlackoutDateID], INSERTED.[TypeID], INSERTED.[BlackoutDate]
    WHERE [BlackoutDateID] = @blackoutDateId
  `);
    const row = result.recordset?.[0];
    return row ? mapBlackoutDate(row) : null;
}
