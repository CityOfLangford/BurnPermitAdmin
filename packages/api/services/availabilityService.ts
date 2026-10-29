import { getSqlPool, sql } from '../config/db.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type SystemAvailableDate = {
  ID: number;
  typeID: number | null;
  dateSysAvailableChange: string | null;
  flagSystemAvailable: boolean | null;
  comments: string | null;
  dateOfEntry: string | null;
};

export type SystemAvailableDateInput = {
  typeID: number;
  dateSysAvailableChange: Date;
  flagSystemAvailable: boolean;
  comments: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type SystemAvailableDateListResponse = {
  data: SystemAvailableDate[];
  pagination: Pagination;
};

function mapDateTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapSystemAvailableDate(row: Record<string, unknown>): SystemAvailableDate {
  const id = Number(row.ID);
  const typeID = row.typeID === null || row.typeID === undefined ? null : Number(row.typeID);
  const flagSystemAvailable = row.flagSystemAvailable;
  if (!Number.isInteger(id) || (typeID !== null && !Number.isInteger(typeID))
    || (flagSystemAvailable !== null && flagSystemAvailable !== undefined && typeof flagSystemAvailable !== 'boolean')) {
    throw new Error('Database returned an invalid system availability record');
  }

  return {
    ID: id,
    typeID,
    dateSysAvailableChange: mapDateTime(row.dateSysAvailableChange),
    flagSystemAvailable: typeof flagSystemAvailable === 'boolean' ? flagSystemAvailable : null,
    comments: typeof row.comments === 'string' ? row.comments : null,
    dateOfEntry: mapDateTime(row.dateOfEntry),
  };
}

export function parseSystemAvailableDate(value: unknown): SystemAvailableDateInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const input = value as {
    typeID?: unknown;
    dateSysAvailableChange?: unknown;
    flagSystemAvailable?: unknown;
    comments?: unknown;
  };
  if (input.typeID !== 2 || typeof input.dateSysAvailableChange !== 'string'
    || typeof input.flagSystemAvailable !== 'boolean'
    || (input.comments !== undefined && (typeof input.comments !== 'string' || input.comments.length > 255))) return null;
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(input.dateSysAvailableChange);
  if (!dateParts) return null;

  const [, year, month, day, hour, minute, second = '0'] = dateParts;
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendarDate.getUTCFullYear() !== Number(year) || calendarDate.getUTCMonth() !== Number(month) - 1
    || calendarDate.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;

  const date = new Date(input.dateSysAvailableChange);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) < '1753-01-01') return null;
  return {
    typeID: 2,
    dateSysAvailableChange: date,
    flagSystemAvailable: input.flagSystemAvailable,
    comments: input.comments?.trim() ?? '',
  };
}

function paginationValues(pageValue: unknown, pageSizeValue: unknown): { page: number; pageSize: number } {
  const requestedPage = Number(pageValue);
  const requestedPageSize = Number(pageSizeValue);
  return {
    page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    pageSize: Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE,
  };
}

export async function getSystemAvailableDates(
  pageValue: unknown,
  pageSizeValue: unknown,
  poolFactory: typeof getSqlPool = getSqlPool,
): Promise<SystemAvailableDateListResponse> {
  const { page, pageSize } = paginationValues(pageValue, pageSizeValue);
  const pool = await poolFactory();
  const countResult = await pool.request().query(`
    SELECT COUNT(*) AS Total
    FROM [dbo].[SystemAvailableDates]
    WHERE [typeID] = 2
  `);
  const total = Number(countResult.recordset?.[0]?.Total ?? 0);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const request = pool.request();
  request.input('offset', sql.Int, (safePage - 1) * pageSize);
  request.input('pageSize', sql.Int, pageSize);
  const result = await request.query(`
    SELECT [ID], [typeID], [dateSysAvailableChange], [flagSystemAvailable], [comments], [dateOfEntry]
    FROM [dbo].[SystemAvailableDates]
    WHERE [typeID] = 2
    ORDER BY [dateSysAvailableChange] DESC, [ID] DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return {
    data: (result.recordset ?? []).map(mapSystemAvailableDate),
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

export async function createSystemAvailableDate(
  value: SystemAvailableDateInput,
  poolFactory: typeof getSqlPool = getSqlPool,
): Promise<SystemAvailableDate> {
  const pool = await poolFactory();
  const request = pool.request();
  request.input('typeID', sql.Int, value.typeID);
  request.input('dateSysAvailableChange', sql.DateTime, value.dateSysAvailableChange);
  request.input('flagSystemAvailable', sql.Bit, value.flagSystemAvailable);
  request.input('comments', sql.VarChar(255), value.comments);
  const result = await request.query(`
    INSERT INTO [dbo].[SystemAvailableDates] ([typeID], [dateSysAvailableChange], [flagSystemAvailable], [comments])
    OUTPUT INSERTED.[ID], INSERTED.[typeID], INSERTED.[dateSysAvailableChange], INSERTED.[flagSystemAvailable], INSERTED.[comments], INSERTED.[dateOfEntry]
    VALUES (@typeID, @dateSysAvailableChange, @flagSystemAvailable, @comments)
  `);
  const row = result.recordset?.[0];
  if (!row) throw new Error('Database did not return the created system availability record');
  return mapSystemAvailableDate(row);
}

export async function updateSystemAvailableDate(
  id: number,
  value: SystemAvailableDateInput,
  poolFactory: typeof getSqlPool = getSqlPool,
): Promise<SystemAvailableDate | null> {
  const pool = await poolFactory();
  const request = pool.request();
  request.input('id', sql.Int, id);
  request.input('typeID', sql.Int, value.typeID);
  request.input('dateSysAvailableChange', sql.DateTime, value.dateSysAvailableChange);
  request.input('flagSystemAvailable', sql.Bit, value.flagSystemAvailable);
  request.input('comments', sql.VarChar(255), value.comments);
  const result = await request.query(`
    UPDATE [dbo].[SystemAvailableDates]
    SET [typeID] = @typeID, [dateSysAvailableChange] = @dateSysAvailableChange,
        [flagSystemAvailable] = @flagSystemAvailable, [comments] = @comments
    OUTPUT INSERTED.[ID], INSERTED.[typeID], INSERTED.[dateSysAvailableChange], INSERTED.[flagSystemAvailable], INSERTED.[comments], INSERTED.[dateOfEntry]
    WHERE [ID] = @id AND [typeID] = 2
  `);
  const row = result.recordset?.[0];
  return row ? mapSystemAvailableDate(row) : null;
}

export async function deleteSystemAvailableDate(
  id: number,
  poolFactory: typeof getSqlPool = getSqlPool,
): Promise<boolean> {
  const pool = await poolFactory();
  const request = pool.request();
  request.input('id', sql.Int, id);
  const result = await request.query(`
    DELETE FROM [dbo].[SystemAvailableDates]
    OUTPUT DELETED.[ID]
    WHERE [ID] = @id AND [typeID] = 2
  `);
  return (result.recordset?.length ?? 0) > 0;
}
