declare module 'mssql' {
  export type config = {
    user?: string;
    password?: string;
    server: string;
    port?: number;
    database?: string;
    options?: {
      encrypt?: boolean;
      trustServerCertificate?: boolean;
      enableArithAbort?: boolean;
    };
    pool?: {
      max?: number;
      min?: number;
      idleTimeoutMillis?: number;
    };
  };

  export class ConnectionPool {
    request(): {
      input(name: string, type: unknown, value: unknown): void;
      execute(procName: string): Promise<{
        recordset?: Array<Record<string, unknown>>;
        recordsets?: Array<Array<Record<string, unknown>>>;
      }>;
      query(queryText: string): Promise<{ recordset?: Array<Record<string, unknown>> }>;
    };
  }

  export function connect(config: config): Promise<ConnectionPool>;

  export const Int: unknown;
  export const Date: unknown;
  export const DateTime: unknown;
  export function NVarChar(length?: number): unknown;
}
