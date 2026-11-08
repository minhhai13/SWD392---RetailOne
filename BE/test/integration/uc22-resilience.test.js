// UC22/25/26 error handling around COMMIT + UC22 retry safety (Idempotency-Key).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, RUN } = require('../helpers/harness');
const poRepo = require('../../src/repositories/purchaseOrder.repository');

let h;
let key = 0;
const PO = '/api/inventory/purchase-orders';
const newKey = () => `idem-${RUN}-${(key += 1)}-abcdef`;
const bodyOf = (cat, qtys = [2, 3]) => ({ supplierId: cat.supplierId, items: cat.products.slice(0, qtys.length).map((p, i) => ({ variantId: p.variantId, quantity: qtys[i] })) });
const post = (token, body, k) => h.api('POST', PO, { token, body, headers: k ? { 'Idempotency-Key': k } : undefined });

/** Replace `obj[name]` for the duration of fn(). */
async function patched(obj, name, replacement, fn) {
  const original = obj[name];
  obj[name] = replacement;
  try {
    return await fn();
  } finally {
    obj[name] = original;
  }
}
const readFails = async () => {
  throw Object.assign(new Error('read failed after commit'), { name: 'RequestError', number: 1236 });
};

before(async () => {
  h = await setup();
  await h.standardActors();
});
after(() => h.teardown());

test('22-21 UC22: the PO was COMMITTED but re-reading it fails -> 201 with a minimal body, never a 500', async () => {
  const cat = await h.makeCatalog({ prices: [1000, 2500] });
  const before = await h.countPos();
  const res = await patched(poRepo, 'getPurchaseOrderDetail', readFails, () => post(h.actors.warehouse.token, bodyOf(cat)));
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.meta, { detailLoaded: false });
  assert.equal(res.body.data.status, 'PENDING');
  assert.match(res.body.data.poCode, /^PO-\d{6}$/);
  assert.equal(res.body.data.supplier.id, cat.supplierId);
  assert.match(res.body.message, /GET \/purchase-orders\/:id/);
  assert.equal(await h.countPos(), before + 1, 'exactly one PO, not rolled back');
  const items = await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrderItems WHERE poId = @id', { id: [h.sql.Int, res.body.data.id] });
  assert.equal(items[0].n, 2, 'header and items were saved atomically');
  const detail = await h.api('GET', `${PO}/${res.body.data.id}`, { token: h.actors.warehouse.token });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.totalAmount, 2 * 1000 + 3 * 2500);
});

test('22-22 UC25 / UC26: committed approve and cancel stay successful when the read-back fails', async () => {
  const cat = await h.makeCatalog();
  const approveId = (await h.createPo(h.actors.warehouse.token, cat, [1])).body.data.id;
  const cancelId = (await h.createPo(h.actors.warehouse.token, cat, [1])).body.data.id;
  const manager = h.actors.manager;

  const approved = await patched(poRepo, 'getPurchaseOrderDetail', readFails, () => h.api('PATCH', `${PO}/${approveId}/approve`, { token: manager.token }));
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.body.meta, { detailLoaded: false });
  assert.deepEqual(approved.body.data, { id: approveId, status: 'APPROVED' });
  const row = await h.poRow(approveId);
  assert.equal(row.status, 'APPROVED');
  assert.equal(row.approvedBy, String(manager.staffId));

  const canceled = await patched(poRepo, 'getPurchaseOrderDetail', readFails, () => h.api('PATCH', `${PO}/${cancelId}/cancel`, { token: manager.token, body: { reason: 'post commit' } }));
  assert.equal(canceled.status, 200);
  assert.deepEqual(canceled.body.data, { id: cancelId, status: 'CANCELED', cancelReason: 'post commit' });
  assert.equal((await h.poRow(cancelId)).status, 'CANCELED');
  // a client that retries after this "success" gets a clean state conflict, not a corrupted PO
  assert.equal((await h.api('PATCH', `${PO}/${cancelId}/cancel`, { token: manager.token, body: { reason: 'again' } })).status, 409);
});

test('22-23 a failure BEFORE commit still rolls back (and is a 500); a failing COMMIT reports an unknown outcome without leaving data', async () => {
  const cat = await h.makeCatalog();
  const before = await h.countPos();
  const failing = () => {
    throw new Error('connection lost');
  };
  const created = await patched(h.sql.Transaction.prototype, 'commit', async () => failing(), () => post(h.actors.manager.token, bodyOf(cat, [1])));
  assert.equal(created.status, 500);
  assert.equal(created.body.code, 'COMMIT_OUTCOME_UNKNOWN');
  assert.equal(await h.countPos(), before, 'nothing persisted when COMMIT never happened');

  const poId = (await h.createPo(h.actors.warehouse.token, cat, [1])).body.data.id;
  const approved = await patched(h.sql.Transaction.prototype, 'commit', async () => failing(), () => h.api('PATCH', `${PO}/${poId}/approve`, { token: h.actors.manager.token }));
  assert.equal(approved.status, 500);
  assert.equal((await h.poRow(poId)).status, 'PENDING');
  assert.equal((await h.api('PATCH', `${PO}/${poId}/approve`, { token: h.actors.manager.token })).status, 200); // no stuck lock
});

test('22-24 Idempotency-Key: a retry returns the first PO instead of creating a duplicate', async () => {
  const cat = await h.makeCatalog();
  const k = newKey();
  const before = await h.countPos();
  const first = await post(h.actors.warehouse.token, bodyOf(cat), k);
  const retry = await post(h.actors.warehouse.token, bodyOf(cat), k);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(await h.countPos(), before + 1);
  // same items in a different order and ignored extra fields are the same request
  const reordered = { ...bodyOf(cat), items: [...bodyOf(cat).items].reverse(), totalAmount: 1 };
  assert.equal((await post(h.actors.warehouse.token, reordered, k)).body.data.id, first.body.data.id);
});

test('22-25 Idempotency-Key: same key with a different request is rejected; other staff / no key are independent', async () => {
  const cat = await h.makeCatalog({ prices: [10, 20] });
  const k = newKey();
  assert.equal((await post(h.actors.warehouse.token, bodyOf(cat, [1]), k)).status, 201);
  const reused = await post(h.actors.warehouse.token, bodyOf(cat, [5]), k);
  assert.equal(reused.status, 409);
  assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED');
  const other = await post(h.actors.manager.token, bodyOf(cat, [1]), k); // key is scoped to the acting staff
  assert.equal(other.status, 201);
  const before = await h.countPos();
  const a = await post(h.actors.manager.token, bodyOf(cat, [1]));
  const b = await post(h.actors.manager.token, bodyOf(cat, [1]));
  assert.notEqual(a.body.data.id, b.body.data.id); // no key: two intentional POs
  assert.equal(await h.countPos(), before + 2);
  for (const bad of ['short', 'has space here', 'x'.repeat(200)]) assert.equal((await post(h.actors.manager.token, bodyOf(cat, [1]), bad)).body.code, 'INVALID_IDEMPOTENCY_KEY');
});

test('22-26 concurrent retries with the same key create exactly one PO', async () => {
  const cat = await h.makeCatalog();
  const k = newKey();
  const before = await h.countPos();
  const results = await Promise.all(Array.from({ length: 8 }, () => post(h.actors.warehouse.token, bodyOf(cat), k)));
  assert.ok(results.every((r) => [200, 201].includes(r.status)), results.map((r) => r.status).join());
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(new Set(results.map((r) => r.body.data.id)).size, 1);
  assert.equal(await h.countPos(), before + 1);
  // without a key, concurrent requests are NOT merged (each is an intentional PO) and none fails
  const many = await Promise.all(Array.from({ length: 4 }, () => post(h.actors.manager.token, bodyOf(cat, [1]))));
  assert.ok(many.every((r) => r.status === 201));
  assert.equal(new Set(many.map((r) => r.body.data.id)).size, 4);
});

test('22-27 a failed attempt is not remembered: the same key can be retried once the problem is fixed', async () => {
  const cat = await h.makeCatalog({ supplierStatus: 'Inactive' });
  const k = newKey();
  const before = await h.countPos();
  assert.equal((await post(h.actors.manager.token, bodyOf(cat, [1]), k)).status, 422);
  await h.query("UPDATE dbo.Suppliers SET status = 'Active' WHERE id = @id", { id: [h.sql.Int, cat.supplierId] });
  const ok = await post(h.actors.manager.token, bodyOf(cat, [1]), k);
  assert.equal(ok.status, 201);
  assert.equal(await h.countPos(), before + 1);
});

test('22-28 header + items are atomic under concurrency: every concurrent PO has all its items and the right total', async () => {
  const cat = await h.makeCatalog({ prices: [100, 200, 300] });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => post(h.actors.manager.token, bodyOf(cat, [i + 1, 1, 2]))));
  for (const [i, r] of results.entries()) {
    assert.equal(r.status, 201);
    assert.equal(r.body.data.items.length, 3);
    assert.equal(r.body.data.totalAmount, (i + 1) * 100 + 200 + 600);
  }
  const orphans = await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrders po WHERE NOT EXISTS (SELECT 1 FROM dbo.PurchaseOrderItems i WHERE i.poId = po.id) AND po.supplierId = @s', { s: [h.sql.Int, cat.supplierId] });
  assert.equal(orphans[0].n, 0);
});
