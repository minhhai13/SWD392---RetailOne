// Seed idempotency, demo data validity and the guarded demo-password reset (runs against the *_TEST database).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/harness');
const { seedDemo, resetDemoPasswords, resolvePasswords, DEMO_EMAIL_DOMAIN, DEMO_USERS } = require('../../scripts/lib/demoSeed');
const { ROLE_PERMISSIONS } = require('../../src/constants/permissions');

let h;
before(async () => {
  h = await setup();
});
after(() => h.teardown());

const counts = async () =>
  (await h.query(`SELECT (SELECT COUNT(*) FROM dbo.Roles) roles, (SELECT COUNT(*) FROM dbo.Features) features, (SELECT COUNT(*) FROM dbo.RoleFeatures) roleFeatures,
                         (SELECT COUNT(*) FROM dbo.Users) users, (SELECT COUNT(*) FROM dbo.Staff) staff, (SELECT COUNT(*) FROM dbo.Suppliers) suppliers,
                         (SELECT COUNT(*) FROM dbo.Products) products, (SELECT COUNT(*) FROM dbo.ProductVariants) variants, (SELECT COUNT(*) FROM dbo.ProductSuppliers) mappings,
                         (SELECT COUNT(*) FROM dbo.SupplierProductPrices) prices, (SELECT COUNT(*) FROM dbo.InventoryStocks) stocks,
                         (SELECT COUNT(*) FROM dbo.PurchaseOrders) pos, (SELECT COUNT(*) FROM dbo.PurchaseOrderItems) items`))[0];

test('SEED-01 seeding is idempotent: a second and third run create nothing and change nothing', async () => {
  await seedDemo(h.pool, resolvePasswords({}));
  const afterFirst = await counts();
  const second = await seedDemo(h.pool, resolvePasswords({}));
  const third = await seedDemo(h.pool, resolvePasswords({}));
  assert.deepEqual(second, { users: [], suppliers: 0, purchaseOrders: 0 });
  assert.deepEqual(third, { users: [], suppliers: 0, purchaseOrders: 0 });
  assert.deepEqual(await counts(), afterFirst);
});

test('SEED-02 demo data is complete and valid: roles/features, 3 accounts, suppliers, catalog, prices, stock, sample POs', async () => {
  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
    const rows = await h.query('SELECT f.featureKey FROM dbo.RoleFeatures rf JOIN dbo.Roles r ON r.id = rf.roleId JOIN dbo.Features f ON f.id = rf.featureId WHERE r.name = @n ORDER BY f.featureKey', { n: [h.sql.NVarChar(50), role] });
    assert.deepEqual(rows.map((r) => r.featureKey), [...keys].sort(), role);
  }
  const users = await h.query("SELECT u.username, r.name AS role, s.email, s.employmentStatus, u.isActive FROM dbo.Users u JOIN dbo.Roles r ON r.id = u.roleId JOIN dbo.Staff s ON s.userId = u.id WHERE u.username IN ('manager','warehouse','cashier') ORDER BY u.username");
  assert.deepEqual(users.map((u) => [u.username, u.role]), [['cashier', 'Cashier'], ['manager', 'Manager'], ['warehouse', 'Warehouse Staff']]);
  assert.ok(users.every((u) => u.email.endsWith(DEMO_EMAIL_DOMAIN) && u.employmentStatus === 'working' && u.isActive === 'active'));

  const suppliers = await h.query("SELECT status FROM dbo.Suppliers WHERE taxId IN ('0100000001','0100000002','0100000003') ORDER BY taxId");
  assert.deepEqual(suppliers.map((s) => s.status), ['Active', 'Active', 'Inactive']);

  const pos = await h.query(`SELECT po.id, po.status, po.totalAmount, po.approvedBy, po.canceledBy, po.cancelReason, po.supplierName, po.poCode,
                                    (SELECT COUNT(*) FROM dbo.PurchaseOrderItems i WHERE i.poId = po.id) AS items,
                                    (SELECT SUM(i.total) FROM dbo.PurchaseOrderItems i WHERE i.poId = po.id) AS itemSum
                             FROM dbo.PurchaseOrders po WHERE po.note LIKE 'DEMO-SEED:%' ORDER BY po.note`);
  assert.deepEqual(pos.map((p) => p.status).sort(), ['APPROVED', 'CANCELED', 'PENDING', 'PENDING']);
  for (const p of pos) {
    assert.ok(p.items >= 1);
    assert.equal(Number(p.totalAmount), Number(p.itemSum), 'totalAmount equals the sum of the computed item totals');
    assert.match(p.poCode, /^PO-\d{6}$/);
    if (p.status === 'APPROVED' || p.status === 'CANCELED') assert.ok(p.approvedBy);
    if (p.status === 'CANCELED') assert.ok(p.canceledBy && p.cancelReason);
    if (p.status === 'PENDING') assert.equal(p.approvedBy, null);
  }
  // the latest of two RICE price rows wins for the sample PO (92000 older, 95000 newer)
  const rice = await h.query("SELECT TOP 1 i.costPrice FROM dbo.PurchaseOrderItems i JOIN dbo.ProductVariants v ON v.id = i.variantId JOIN dbo.Products p ON p.id = v.productId JOIN dbo.PurchaseOrders po ON po.id = i.poId WHERE p.code = 'DEMO-RICE' AND po.note = 'DEMO-SEED:PENDING-1'");
  assert.equal(Number(rice[0].costPrice), 95000);
  const lowStock = await h.query("SELECT COUNT(*) AS n FROM dbo.InventoryStocks s JOIN dbo.ProductVariants v ON v.id = s.variantId JOIN dbo.Products p ON p.id = v.productId WHERE p.code LIKE 'DEMO-%' AND s.quantityOnHand <= s.minThreshold");
  assert.ok(lowStock[0].n >= 3, 'low-stock candidates for UC22.1');
});

test('SEED-03 the demo data supports every flow: login, list/filter, detail with role-based actions, UC22.1 lookup', async () => {
  const pw = resolvePasswords({});
  const reset = await resetDemoPasswords(h.pool, pw);
  assert.equal(reset.reset.length, 3);
  const login = async (u) => h.login(u, pw[u].password);
  const [mg, wh, cs] = [await login('manager'), await login('warehouse'), await login('cashier')];
  assert.deepEqual([mg.status, wh.status, cs.status], [200, 200, 200]);
  const list = await h.api('GET', '/api/inventory/purchase-orders?q=Demo&status=PENDING', { token: wh.body.data.token });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.items.length >= 2);
  assert.equal((await h.api('GET', '/api/inventory/purchase-orders', { token: cs.body.data.token })).status, 403);
  const detail = await h.api('GET', `/api/inventory/purchase-orders/${list.body.data.items[0].id}`, { token: mg.body.data.token });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.data.availableActions, ['APPROVE', 'CANCEL']);
  const milk = (await h.query("SELECT v.id FROM dbo.ProductVariants v JOIN dbo.Products p ON p.id = v.productId WHERE p.code = 'DEMO-MILK'"))[0].id;
  const sup = await h.api('GET', `/api/inventory/suppliers/by-variants?variantIds=${milk}`, { token: wh.body.data.token });
  assert.equal(sup.body.data.suppliers.length, 2, 'MILK is supplied by two active demo suppliers');
  assert.equal((await h.api('GET', '/api/auth/me', { token: mg.body.data.token })).body.data.permissions.length, 4);
});

test('SEED-04 demo password reset: only demo accounts, never silently by seeding, new password works and old does not', async () => {
  const pw1 = resolvePasswords({});
  await resetDemoPasswords(h.pool, pw1);
  assert.equal((await h.login('manager', pw1.manager.password)).status, 200);

  await seedDemo(h.pool, resolvePasswords({})); // ordinary seed must NOT change passwords
  assert.equal((await h.login('manager', pw1.manager.password)).status, 200);

  const pw2 = resolvePasswords({});
  const result = await resetDemoPasswords(h.pool, pw2);
  assert.deepEqual(result.reset.map((r) => r.username).sort(), ['cashier', 'manager', 'warehouse']);
  assert.equal((await h.login('manager', pw1.manager.password)).status, 401, 'old password no longer works');
  assert.equal((await h.login('manager', pw2.manager.password)).status, 200);

  // a REAL (non-demo) account is never touched, even when asked for by name
  const real = await h.makeActor('real', 'Manager'); // Staff.email is NULL
  const realOld = h.passwords[real.username];
  const skipped = await resetDemoPasswords(h.pool, { [real.username]: { password: 'new-password-123', generated: false } }, [real.username, 'no_such_user']);
  assert.deepEqual(skipped.reset, []);
  assert.deepEqual(skipped.skipped.map((s) => s.reason), ['not a demo account', 'not found']);
  assert.equal((await h.login(real.username, realOld)).status, 200);
  assert.equal((await h.login(real.username, 'new-password-123')).status, 401);
  // an e-mail that merely resembles the demo domain does not qualify
  await h.query("UPDATE dbo.Staff SET email = 'x@demo.retailone.local.evil.com' WHERE id = @id", { id: [h.sql.BigInt, real.staffId] });
  assert.equal((await resetDemoPasswords(h.pool, { [real.username]: { password: 'new-password-123', generated: false } }, [real.username])).reset.length, 0);
  assert.deepEqual(DEMO_USERS.map((u) => u.username), ['manager', 'warehouse', 'cashier']);
});
