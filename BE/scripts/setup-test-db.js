/**
 * Creates an ISOLATED test database from docs/reference/RetailOne_schema_mssql(4).sql.
 *
 * Safety rules (see CLAUDE.md section 3):
 *  - DB_NAME must end with _TEST.
 *  - The schema file's own header (USE master / DROP DATABASE / CREATE DATABASE / USE) is NOT executed.
 *    This script only creates the database if it does not exist, and only when it has no user tables.
 *  - The reference SQL file is read, never modified.
 *
 * Usage: npm run db:setup-test
 */
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { buildConfig } = require('../src/config/database');

const SCHEMA_FILE = path.join(__dirname, '..', 'docs', 'reference', 'RetailOne_schema_mssql(4).sql');

function schemaBatches() {
  const text = fs.readFileSync(SCHEMA_FILE, 'utf8').replace(/^﻿/, '');
  return text
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .filter((b) => !/^USE\s*\[/i.test(b) && !/DROP\s+DATABASE/i.test(b) && !/CREATE\s+DATABASE/i.test(b));
}

async function connectWithRetry(config, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const pool = new sql.ConnectionPool(config);
      await pool.connect();
      return pool;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Cannot connect to SQL Server (${lastError && (lastError.code || lastError.name)})`);
}

async function main() {
  const config = buildConfig();
  const dbName = config.database;
  if (!/^[A-Za-z0-9_]+_TEST$/i.test(dbName)) {
    throw new Error('Refusing to run: DB_NAME must match *_TEST (e.g. RetailOnePOS_TEST).');
  }

  const master = await connectWithRetry({ ...config, database: 'master' });
  const exists = (await master.request().input('n', sql.NVarChar(128), dbName).query('SELECT DB_ID(@n) AS id')).recordset[0].id !== null;
  if (!exists) {
    await master.request().batch(`CREATE DATABASE [${dbName}]`);
    console.log(`Created database ${dbName}`);
  }
  await master.close();

  const pool = await connectWithRetry({ ...config, pool: { max: 1, min: 1 } });
  const tables = (await pool.request().query('SELECT COUNT(*) AS n FROM sys.tables')).recordset[0].n;
  if (tables > 0) {
    await pool.close();
    throw new Error(`Refusing to run: ${dbName} already has ${tables} tables. Drop it manually if you really want a fresh test database.`);
  }

  const batches = schemaBatches();
  for (const batch of batches) {
    await pool.request().batch(batch);
  }
  const after = (await pool.request().query('SELECT COUNT(*) AS n FROM sys.tables')).recordset[0].n;
  console.log(`Executed ${batches.length} batches; ${dbName} now has ${after} tables.`);
  await pool.close();
}

main().catch((err) => {
  console.error(`setup-test-db failed: ${err.message}`);
  process.exitCode = 1;
});
