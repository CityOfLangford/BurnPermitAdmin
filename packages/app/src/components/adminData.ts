export const ADMIN_PAGE_SIZE = 20;

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: Pagination;
};

export function emptyPagination(pageSize = ADMIN_PAGE_SIZE): Pagination {
  return {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

export async function responseError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json() as { error?: string };
  return payload.error || fallback;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, '/') : value;
}

export function localDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
