const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/harness');
const poRepo = require('../../src/modules/inventory-management/repositories/purchaseOrder.repository');

let h;
let manager;
let manager2;
let warehouse;
const PO = '/api/inventory/purchase-orders';
const approve = (id, token = manager.token) => h.api('PATCH', `${PO}/${id}/approve`, { token, body: {} });
const dbError = () => Object.assign(new Error('simulated failure'), { name: 'RequestError', number: 515 });
const newPo = async (cat, qtys = [2, 3]) => (await h.createPo(warehouse.token, cat, qtys)).body.data.id;

before(async () => {
  h = await setup();
  await h.standardActors();
  ({ manager, manager2, warehouse } = h.actors);
});
after(() => h.teardown());

test('25-01 Manager approves a PENDING PO: APPROVED + approvedBy = Staff.id from the token + server timestamp (POST-1/2)', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  const before = await h.poRow(id);
  const res = await approve(id);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'APPROVED');
  assert.equal(res.body.data.approvedBy.staffId, manager.staffId);
  assert.deepEqual(res.body.data.timeline.map((t) => t.event), ['CREATED', 'APPROVED']);

  const row = await h.poRow(id);
  assert.equal(row.status, 'APPROVED');
  assert.equal(row.approvedBy, String(manager.staffId));
  assert.ok(row.approvedAt);
  const [{ secs }] = await h.query('SELECT DATEDIFF(SECOND, approvedAt, SYSDATETIME()) AS secs FROM dbo.PurchaseOrders WHERE id = @id', { id: [h.sql.Int, id] });
  assert.ok(secs >= 0 && secs < 60, 'approvedAt is the server time');
  assert.equal(row.canceledBy, null);
  assert.equal(row.createdBy, before.createdBy);
  assert.equal(Number(row.totalAmount), Number(before.totalAmount));
});

test('25-02 only Manager may approve: Warehouse and Cashier get 403 and the PO stays PENDING (BR-42)', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  assert.equal((await approve(id, warehouse.token)).status, 403);
  assert.equal((await approve(id, h.actors.cashier.token)).status, 403);
  assert.equal((await h.poRow(id)).status, 'PENDING');
});

test('25-03 a PO that is no longer PENDING cannot be approved (E1): APPROVED, CANCELED, RECEIVED', async () => {
  const cat = await h.makeCatalog();
  const approvedId = await newPo(cat);
  await approve(approvedId);
  const canceledId = await newPo(cat);
  await h.api('PATCH', `${PO}/${canceledId}/cancel`, { token: manager.token, body: { reason: 'r' } });
  const receivedId = await h.insertPoRaw({ catalog: cat, status: 'RECEIVED', createdBy: manager.staffId, approvedBy: manager.staffId });

  for (const [id, status] of [[approvedId, 'APPROVED'], [canceledId, 'CANCELED'], [receivedId, 'RECEIVED']]) {
    const before = await h.poRow(id);
    const res = await approve(id, manager2.token);
    assert.equal(res.status, 409, status);
    assert.equal(res.body.code, 'PO_INVALID_STATUS');
    assert.equal(res.body.details.currentStatus, status);
    assert.deepEqual(await h.poRow(id), before, 'row unchanged');
  }
});

test('25-04 inactive supplier blocks approval (E2); the PO stays PENDING', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  await h.query("UPDATE dbo.Suppliers SET status = 'Inactive' WHERE id = @id", { id: [h.sql.Int, cat.supplierId] });
  const res = await approve(id);
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'SUPPLIER_INACTIVE');
  const row = await h.poRow(id);
  assert.equal(row.status, 'PENDING');
  assert.equal(row.approvedBy, null);
  assert.equal(row.approvedAt, null);
  await h.query("UPDATE dbo.Suppliers SET status = 'Active' WHERE id = @id", { id: [h.sql.Int, cat.supplierId] });
  assert.equal((await approve(id)).status, 200); // reactivated -> approvable
});

test('25-05 an inactive product (StopSelling / Suspended) in any line blocks approval (E2)', async () => {
  for (const status of ['StopSelling', 'Suspended']) {
    const cat = await h.makeCatalog({ prices: [100, 200] });
    const id = await newPo(cat, [1, 1]);
    await h.query('UPDATE dbo.Products SET status = @s WHERE id = @id', { s: [h.sql.VarChar(20), status], id: [h.sql.BigInt, cat.products[1].productId] });
    const res = await approve(id);
    assert.equal(res.status, 422, status);
    assert.equal(res.body.code, 'PRODUCT_INACTIVE');
    assert.equal(res.body.details.products[0].id, cat.products[1].productId);
    assert.equal((await h.poRow(id)).status, 'PENDING');
  }
});

test('25-06 two Managers approving the same PO at once: exactly one wins, the other gets 409', async () => {
  const cat = await h.makeCatalog();
  for (let round = 0; round < 6; round += 1) {
    const id = await newPo(cat, [1]);
    const [a, b] = await Promise.all([approve(id, manager.token), approve(id, manager2.token)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], `round ${round}: ${a.status}/${b.status}`);
    const winner = a.status === 200 ? manager : manager2;
    assert.equal((await h.poRow(id)).approvedBy, String(winner.staffId));
  }
  const id = await newPo(cat, [1]);
  const many = await Promise.all([manager, manager2, manager, manager2].map((m) => approve(id, m.token)));
  assert.equal(many.filter((r) => r.status === 200).length, 1);
  assert.equal(many.filter((r) => r.status === 409).length, 3);
  assert.ok(many.every((r) => r.status !== 500));
});

test('25-07 approval does not touch inventory, items, totals or goods receipts (POST-3, BR-45)', async () => {
  const cat = await h.makeCatalog({ prices: [10, 20] });
  const variantIds = cat.products.map((p) => p.variantId);
  const id = await newPo(cat, [4, 4]);
  const stock = await h.stockOf(variantIds);
  const items = await h.query('SELECT * FROM dbo.PurchaseOrderItems WHERE poId = @id ORDER BY id', { id: [h.sql.Int, id] });
  assert.equal((await approve(id)).status, 200);
  assert.deepEqual(await h.stockOf(variantIds), stock);
  assert.deepEqual(await h.query('SELECT * FROM dbo.PurchaseOrderItems WHERE poId = @id ORDER BY id', { id: [h.sql.Int, id] }), items);
  assert.equal((await h.query('SELECT COUNT(*) AS n FROM dbo.GoodReceipts WHERE poId = @id', { id: [h.sql.Int, id] }))[0].n, 0);
  assert.equal((await h.query('SELECT COUNT(*) AS n FROM dbo.Batches WHERE variantId IN (@a, @b)', { a: [h.sql.Int, variantIds[0]], b: [h.sql.Int, variantIds[1]] }))[0].n, 0);
});

test('25-08 a database failure during approval rolls back: PO stays PENDING with no approver (E3)', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  const original = poRepo.updatePurchaseOrderStatus;
  // perform the real UPDATE inside the transaction, then fail: the UPDATE must be undone
  poRepo.updatePurchaseOrderStatus = async (...args) => {
    assert.equal(await original(...args), true);
    throw dbError();
  };
  try {
    const res = await approve(id);
    assert.equal(res.status, 500);
    assert.equal(res.body.code, 'DB_ERROR');
  } finally {
    poRepo.updatePurchaseOrderStatus = original;
  }
  const row = await h.poRow(id);
  assert.equal(row.status, 'PENDING');
  assert.equal(row.approvedBy, null);
  assert.equal(row.approvedAt, null);
  assert.equal((await approve(id)).status, 200); // retry works: no stuck lock
});

test('25-09 unknown / malformed id', async () => {
  const nf = await approve(2147483000);
  assert.equal(nf.status, 404);
  assert.equal(nf.body.code, 'PO_NOT_FOUND');
  for (const bad of ['abc', '0', '-3', '1.5', '99999999999']) assert.equal((await approve(bad)).status, 400, bad);
});
