const sql = require('mssql');
require('dotenv').config({ quiet: true });

let pool = null;
let connecting = null;

const toBool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes'].includes(String(value).toLowerCase());
};

/** Build the node-mssql config from environment variables. Throws listing variable NAMES only. */
function buildConfig(env = process.env) {
  const required = ['DB_SERVER', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }
  return {
    server: env.DB_SERVER,
    port: Number(env.DB_PORT || 1433),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectionTimeout: Number(env.DB_CONNECTION_TIMEOUT_MS || 15000),
    requestTimeout: Number(env.DB_REQUEST_TIMEOUT_MS || 30000),
    pool: { max: Number(env.DB_POOL_MAX || 10), min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: toBool(env.DB_ENCRYPT, false),
      trustServerCertificate: toBool(env.DB_TRUST_SERVER_CERTIFICATE, true),
      enableArithAbort: true,
    },
  };
}

/** Open (or reuse) the shared connection pool. */
async function connectDB(config = buildConfig()) {
  if (pool && pool.connected) return pool;
  if (connecting) return connecting;
  connecting = (async () => {
    const candidate = new sql.ConnectionPool(config);
    candidate.on('error', (err) => console.error(`[DB] pool error: ${err.code || err.name}`));
    try {
      await candidate.connect();
    } catch (err) {
      // never print the driver error verbatim: it may echo the server/user
      const safe = new Error(`Cannot connect to SQL Server (${err.code || err.name}). Check DB_* environment variables.`);
      safe.code = err.code;
      throw safe;
    } finally {
      connecting = null;
    }
    pool = candidate;
    return pool;
  })();
  return connecting;
}

/** Synchronous accessor used by repositories; connectDB() must have been awaited at start-up. */
function getPool() {
  if (!pool || !pool.connected) {
    const { AppError } = require('../utils/errors');
    throw new AppError(500, 'DB_NOT_CONNECTED', 'Database connection is not available.');
  }
  return pool;
}

/** Build a Request on a transaction (when given) or on the pool. */
function newRequest(executor) {
  return new sql.Request(executor || getPool());
}

/** Lightweight health check: SELECT 1. */
async function ping() {
  const result = await newRequest().query('SELECT 1 AS ok');
  return result.recordset[0].ok === 1;
}

async function closeDB() {
  if (pool) {
    const current = pool;
    pool = null;
    await current.close();
  }
}

module.exports = { sql, buildConfig, connectDB, getPool, newRequest, ping, closeDB };
