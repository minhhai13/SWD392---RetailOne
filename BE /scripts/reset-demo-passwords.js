/**
 * Resets the passwords of the DEMO accounts (manager / warehouse / cashier) in a LOCAL *_TEST database.
 * Safety: DB_NAME must end with _TEST, DB_SERVER must be local, only accounts whose Staff.email ends with
 * @demo.retailone.local are touched, and the explicit --yes flag is required (seeding never resets passwords).
 *
 * Usage: npm run db:reset-demo-passwords -- --yes
 * New passwords: SEED_*_PASSWORD from .env, otherwise generated and printed once.
 */
const sql = require('mssql');
const { buildConfig } = require('../src/config/database');
const { assertSafeTarget, resolvePasswords, resetDemoPasswords } = require('./lib/demoSeed');

async function main() {
  const config = buildConfig();
  assertSafeTarget(config);
  if (!process.argv.includes('--yes')) {
    throw new Error(`This will reset the passwords of the demo accounts in ${config.database}. Re-run with --yes to confirm.`);
  }
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    const result = await resetDemoPasswords(pool, resolvePasswords());
    for (const u of result.reset) console.log(`reset  ${u.username} / ${u.password}${u.generated ? '  (generated)' : '  (from .env)'}`);
    for (const s of result.skipped) console.log(`skipped ${s.username}: ${s.reason}`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(`reset-demo-passwords failed: ${err.message}`);
  process.exitCode = 1;
});
