const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/harness');
const poRepo = require('../../src/repositories/purchaseOrder.repository');

let h;
let manager;
let manager2;
let warehouse;
const PO = '/api/inventory/purchase-orders';
const cancel = (id, reason = 'Supplier cannot deliver', token = manager.token) => h.api('PATCH', `${PO}/${id}/cancel`, { token, body: { reason } });
const approve = (id, token = manager.token) => h.api('PATCH', `${PO}/${id}/approve`, { token, body: {} });
const dbError = () => Object.assign(new Error('simulated failure'), { name: 'RequestError', number: 515 });
const newPo = async (cat, qtys = [2, 3]) => (await h.createPo(warehouse.token, cat, qtys)).body.data.id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  h = await setup();
  await h.standardActors();
  ({ manager, manager2, warehouse } = h.actors);
});
after(() => h.teardown());

test('26-01 Manager cancels a PENDING PO: CANCELED + reason + Staff.id + server time (POST-1/2)', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  const res = await cancel(id, '  Supplier out of stock  ');
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.status, 'CANCELED');
  assert.equal(d.cancelReason, 'Supplier out of stock');
  assert.equal(d.canceledBy.staffId, manager.staffId);
  assert.ok(d.canceledAt);
  assert.deepEqual(d.availableActions, []);

  const row = await h.poRow(id);
  assert.equal(row.status, 'CANCELED');
  assert.equal(row.canceledBy, String(manager.staffId));
  assert.equal(row.cancelReason, 'Supplier out of stock');
  const [{ secs }] = await h.query('SELECT DATEDIFF(SECOND, canceledAt, SYSDATETIME()) AS secs FROM dbo.PurchaseOrders WHERE id = @id', { id: [h.sql.Int, id] });
  assert.ok(secs >= 0 && secs < 60);
  assert.equal(row.approvedBy, null);
});

test('26-02 Manager cancels an APPROVED PO: approval info is kept, cancel info is added', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  await approve(id, manager2.token);
  const res = await cancel(id, 'Goods cannot be received', manager.token);
  assert.equal(res.status, 200);
  const row = await h.poRow(id);
  assert.equal(row.status, 'CANCELED');
  assert.equal(row.approvedBy, String(manager2.staffId));
  assert.equal(row.canceledBy, String(manager.staffId));
  assert.deepEqual(res.body.data.timeline.map((t) => t.event), ['CREATED', 'APPROVED', 'CANCELED']);
});

test('26-03 the cancellation reason is mandatory, trimmed and limited to 500 characters (E2)', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  const bad = [undefined, null, '', '   ', '\n\t', 123, {}, [], 'x'.repeat(501)];
  for (const reason of bad) {
    // send the body as-is (the cancel() helper would replace undefined by its default reason)
    const res = await h.api('PATCH', `${PO}/${id}/cancel`, { token: manager.token, body: { reason } });
    assert.equal(res.status, 400, JSON.stringify(reason));
    assert.ok(['REASON_REQUIRED', 'REASON_TOO_LONG'].includes(res.body.code));
  }
  assert.equal((await h.api('PATCH', `${PO}/${id}/cancel`, { token: manager.token })).status, 400); // no body
  assert.equal((await h.poRow(id)).status, 'PENDING');

  const unicode = 'Nhà cung cấp không giao được hàng — hủy đơn 取消';
  const ok = await cancel(id, 'a'.repeat(500 - unicode.length) + unicode); // exactly 500 characters
  assert.equal(ok.status, 200);
  assert.equal((await h.poRow(id)).cancelReason.length, 500);
  const id2 = await newPo(cat);
  assert.equal((await cancel(id2, unicode)).body.data.cancelReason, unicode);
});

test('26-04 RECEIVED and CANCELED POs cannot be canceled (BR-43, E1)', async () => {
  const cat = await h.makeCatalog();
  const receivedId = await h.insertPoRaw({ catalog: cat, status: 'RECEIVED', createdBy: manager.staffId, approvedBy: manager.staffId });
  const canceledId = await newPo(cat);
  await cancel(canceledId);
  for (const [id, status] of [[receivedId, 'RECEIVED'], [canceledId, 'CANCELED']]) {
    const before = await h.poRow(id);
    const res = await cancel(id, 'again', manager2.token);
    assert.equal(res.status, 409, status);
    assert.equal(res.body.code, 'PO_INVALID_STATUS');
    assert.equal(res.body.details.currentStatus, status);
    assert.deepEqual(await h.poRow(id), before);
  }
});

test('26-05 an existing goods receipt blocks cancellation (E1)', async () => {
  const cat = await h.makeCatalog();
  for (const approveFirst of [false, true]) {
    const id = await newPo(cat);
    if (approveFirst) await approve(id);
    await h.insertGoodReceipt(id, manager.staffId);
    const before = await h.poRow(id);
    const res = await cancel(id);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'GOODS_RECEIPT_EXISTS');
    assert.deepEqual(await h.poRow(id), before);
  }
});

test('26-06 concurrency: cancel x cancel -> one 200 + one 409; cancel x approve -> never an inconsistent row', async () => {
  const cat = await h.makeCatalog();
  for (let round = 0; round < 5; round += 1) {
    const id = await newPo(cat, [1]);
    const [a, b] = await Promise.all([cancel(id, 'a', manager.token), cancel(id, 'b', manager2.token)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], `cancel/cancel round ${round}`);
    const winner = a.status === 200 ? { m: manager, reason: 'a' } : { m: manager2, reason: 'b' };
    const row = await h.poRow(id);
    assert.equal(row.canceledBy, String(winner.m.staffId));
    assert.equal(row.cancelReason, winner.reason);
  }
  for (let round = 0; round < 6; round += 1) {
    const id = await newPo(cat, [1]);
    const [c, a] = await Promise.all([cancel(id, 'race', manager.token), approve(id, manager2.token)]);
    assert.equal(c.status, 200, `cancel always ends up applied (round ${round})`);
    assert.ok([200, 409].includes(a.status), `approve ${a.status}`);
    const row = await h.poRow(id);
    assert.equal(row.status, 'CANCELED');
    assert.equal(row.approvedBy === null, a.status === 409, 'approval info only if approve ran first');
    assert.equal(row.canceledBy, String(manager.staffId));
  }
});

test('26-07 a goods receipt being written at the same moment wins: cancel waits for it, then is rejected', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  await approve(id);
  const tx = new h.sql.Transaction(h.pool);
  await tx.begin();
  try {
    await h.insertGoodReceipt(id, manager.staffId, tx); // uncommitted receipt
    let settled = false;
    const pending = cancel(id).then((r) => {
      settled = true;
      return r;
    });
    await sleep(600);
    assert.equal(settled, false, 'cancel must wait while the receipt is in flight');
    await tx.commit();
    const res = await pending;
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'GOODS_RECEIPT_EXISTS');
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {
      /* already finished */
    }
    throw err;
  }
  assert.equal((await h.poRow(id)).status, 'APPROVED');
});

test('26-08 cancel never deletes the PO or its items and never changes inventory (POST-3)', async () => {
  const cat = await h.makeCatalog({ prices: [10, 20] });
  const variantIds = cat.products.map((p) => p.variantId);
  const id = await newPo(cat, [3, 4]);
  const stock = await h.stockOf(variantIds);
  const items = await h.query('SELECT * FROM dbo.PurchaseOrderItems WHERE poId = @id ORDER BY id', { id: [h.sql.Int, id] });
  const total = (await h.poRow(id)).totalAmount;
  assert.equal((await cancel(id)).status, 200);
  assert.equal((await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrders WHERE id = @id', { id: [h.sql.Int, id] }))[0].n, 1);
  assert.deepEqual(await h.query('SELECT * FROM dbo.PurchaseOrderItems WHERE poId = @id ORDER BY id', { id: [h.sql.Int, id] }), items);
  assert.equal((await h.poRow(id)).totalAmount, total);
  assert.deepEqual(await h.stockOf(variantIds), stock);
  assert.equal((await h.api('GET', `${PO}/${id}`, { token: warehouse.token })).body.data.status, 'CANCELED');
});

test('26-09 a canceled PO is locked: cannot be approved, canceled again or reopened', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  await cancel(id);
  assert.equal((await approve(id)).status, 409);
  assert.equal((await cancel(id)).status, 409);
  assert.equal((await h.poRow(id)).status, 'CANCELED');
});

test('26-10 a database failure during cancel rolls back and keeps the previous status (E3)', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  const approvedId = await newPo(cat);
  await approve(approvedId);
  const original = poRepo.updatePurchaseOrderStatus;
  poRepo.updatePurchaseOrderStatus = async (...args) => {
    assert.equal(await original(...args), true);
    throw dbError();
  };
  try {
    for (const poId of [id, approvedId]) {
      const res = await cancel(poId);
      assert.equal(res.status, 500);
      assert.equal(res.body.code, 'DB_ERROR');
    }
  } finally {
    poRepo.updatePurchaseOrderStatus = original;
  }
  assert.equal((await h.poRow(id)).status, 'PENDING');
  const row = await h.poRow(approvedId);
  assert.equal(row.status, 'APPROVED');
  assert.equal(row.canceledBy, null);
  assert.equal(row.cancelReason, null);
  assert.equal((await cancel(id)).status, 200);
});

test('26-11 Manager only; unknown / malformed id', async () => {
  const cat = await h.makeCatalog();
  const id = await newPo(cat);
  assert.equal((await cancel(id, 'x', warehouse.token)).status, 403);
  assert.equal((await cancel(id, 'x', h.actors.cashier.token)).status, 403);
  assert.equal((await h.poRow(id)).status, 'PENDING');
  const nf = await cancel(2147483000);
  assert.equal(nf.status, 404);
  assert.equal(nf.body.code, 'PO_NOT_FOUND');
  for (const bad of ['abc', '0', '-3', '1.5']) assert.equal((await cancel(bad)).status, 400, bad);
});
