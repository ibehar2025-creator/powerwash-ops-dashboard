import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required to run migrations.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

try {
  const schemaPath = path.join(process.cwd(), "server", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
  console.log("Database schema is ready.");
} finally {
  await pool.end();
}
