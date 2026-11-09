/**
 * Idempotent demo seed for a LOCAL *_TEST database: roles/features/role-features, 3 demo accounts, suppliers, products,
 * variants, supplier prices, stock and sample purchase orders (PENDING / APPROVED / CANCELED).
 * Re-running creates nothing new and never changes existing passwords (use `npm run db:reset-demo-passwords`).
 *
 * Passwords: SEED_MANAGER_PASSWORD / SEED_WAREHOUSE_PASSWORD / SEED_CASHIER_PASSWORD from .env (min 8 chars),
 * otherwise generated randomly and printed ONCE to your terminal.
 */
const sql = require('mssql');
const { buildConfig } = require('../src/config/database');
const { assertSafeTarget, resolvePasswords, seedDemo } = require('./lib/demoSeed');

async function main() {
  const config = buildConfig();
  assertSafeTarget(config);
  const pool = await new sql.ConnectionPool(config).connect();
  try {
    const created = await seedDemo(pool, resolvePasswords());
    if (created.users.length) {
      console.log('Created demo accounts (passwords are shown only now):');
      for (const u of created.users) console.log(`  ${u.username} / ${u.password}${u.generated ? '  (generated)' : '  (from .env)'}`);
    } else {
      console.log('Demo accounts already exist; their passwords were NOT changed.');
    }
    console.log(`New suppliers: ${created.suppliers}; new sample purchase orders: ${created.purchaseOrders}.`);
  } finally {
    await pool.close();
  }
}

main().catch((err) => {
  console.error(`seed-dev failed: ${err.message}`);
  process.exitCode = 1;
});
