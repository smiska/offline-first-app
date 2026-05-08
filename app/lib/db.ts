import pg from "pg";
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgres://erp:erp@localhost:5432/offline_erp"
});
