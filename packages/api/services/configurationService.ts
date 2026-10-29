import { getSqlPool, sql } from '../config/db.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export type AdminConfiguration = {
  ConfigurationID: number;
  ConfigurationType: string;
  Name: string;
  Value: string;
  TypeID: number | null;
  comments: string | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ConfigurationListResponse = {
  data: AdminConfiguration[];
  pagination: Pagination;
};

export function parseConfigurationValue(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const input = value as { Value?: unknown };
  return typeof input.Value === 'string' ? input.Value : null;
}

function mapConfiguration(row: Record<string, unknown>): AdminConfiguration {
  const configurationID = Number(row.ConfigurationID);
  const typeID = row.TypeID === null || row.TypeID === undefined ? null : Number(row.TypeID);
  if (!Number.isInteger(configurationID) || (typeID !== null && !Number.isInteger(typeID))
    || typeof row.ConfigurationType !== 'string' || typeof row.Name !== 'string' || typeof row.Value !== 'string') {
    throw new Error('Database returned an invalid configuration record');
  }

  return {
    ConfigurationID: configurationID,
    ConfigurationType: row.ConfigurationType,
    Name: row.Name,
    Value: row.Value,
    TypeID: typeID,
    comments: typeof row.comments === 'string' ? row.comments : null,
  };
}

export async function getAdminConfigurations(
  pageValue: unknown,
  pageSizeValue: unknown,
  poolFactory: typeof getSqlPool = getSqlPool,
): Promise<ConfigurationListResponse> {
  const requestedPage = Number(pageValue);
  const requestedPageSize = Number(pageSizeValue);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
    ? Math.min(requestedPageSize, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const pool = await poolFactory();
  const countResult = await pool.request().query(`
    SELECT COUNT(*) AS Total
    FROM [dbo].[Configurations]
    WHERE [ConfigurationType] = N'AdminEditable'
  `);
  const total = Number(countResult.recordset?.[0]?.Total ?? 0);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const request = pool.request();
  request.input('offset', sql.Int, (safePage - 1) * pageSize);
  request.input('pageSize', sql.Int, pageSize);
  const result = await request.query(`
    SELECT [ConfigurationID], [ConfigurationType], [Name], [Value], [TypeID], [comments]
    FROM [dbo].[Configurations]
    WHERE [ConfigurationType] = N'AdminEditable'
    ORDER BY [ConfigurationID] DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  return {
    data: (result.recordset ?? []).map(mapConfiguration),
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

export async function updateAdminConfiguration(
  configurationID: number,
  value: string,
  poolFactory: typeof getSqlPool = getSqlPool,
): Promise<AdminConfiguration | null> {
  const pool = await poolFactory();
  const request = pool.request();
  request.input('configurationID', sql.Int, configurationID);
  request.input('value', sql.NVarChar(sql.MAX), value);
  const result = await request.query(`
    UPDATE [dbo].[Configurations]
    SET [Value] = CASE WHEN UPPER([Name]) = N'SYSTEMACTIVE'
      THEN CASE WHEN @value = N'1' THEN N'1' ELSE N'0' END
      ELSE @value
    END
    OUTPUT INSERTED.[ConfigurationID], INSERTED.[ConfigurationType], INSERTED.[Name], INSERTED.[Value], INSERTED.[TypeID], INSERTED.[comments]
    WHERE [ConfigurationID] = @configurationID
      AND [ConfigurationType] = N'AdminEditable'
  `);
  const row = result.recordset?.[0];
  return row ? mapConfiguration(row) : null;
}
