import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, "../../sql/schema.sql");

const connectionString =
  process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL ||
  "postgres://erp:erp@localhost:5432/offline_erp";

export const testPool = new pg.Pool({ connectionString });

export async function applySchema() {
  const sql = fs.readFileSync(schemaPath, "utf8");
  await testPool.query(sql);
}

export async function resetTables() {
  await testPool.query("TRUNCATE integration_jobs, events, aggregate_versions RESTART IDENTITY CASCADE");
}

export async function closePool() {
  await testPool.end();
}
