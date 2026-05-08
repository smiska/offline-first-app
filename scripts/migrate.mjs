import fs from "fs";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgres://erp:erp@localhost:5432/offline_erp"
});

await pool.query(fs.readFileSync("./sql/schema.sql", "utf8"));
await pool.end();
console.log("migrated");
