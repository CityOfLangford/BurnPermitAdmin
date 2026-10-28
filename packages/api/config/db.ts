import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

export const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  options: {
    encrypt: String(process.env.DB_ENCRYPT || 'true').toLowerCase() === 'true',
    trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true',
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  return sql.connect(config);
}

export { sql };
