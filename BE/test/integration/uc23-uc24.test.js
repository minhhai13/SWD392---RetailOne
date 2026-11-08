const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, RUN } = require('../helpers/harness');
const poRepo = require('../../src/repositories/purchaseOrder.repository');

let h;
let cats;
let pos; // { id, status, cat }
let manager;
let warehouse;
const PO = '/api/inventory/purchase-orders';
const list = (query = '', token = warehouse.token) => h.api('GET', `${PO}?q=${RUN}${query ? `&${query}` : ''}`, { token });
const ids = (res) => res.body.data.items.map((i) => i.id);

before(async () => {
  h = await setup();
  await h.standardActors();
  manager = h.actors.manager;
  warehouse = h.actors.warehouse;
  cats = [await h.makeCatalog({ prices: [1000, 2500] }), await h.makeCatalog({ prices: [500] }), await h.makeCatalog({ prices: [70000] })];
  pos = [];
  const add = async (cat, qtys, who = warehouse) => {
    const res = await h.createPo(who.token, cat, qtys);
    assert.equal(res.status, 201);
    pos.push({ id: res.body.data.id, cat, status: 'PENDING' });
    return res.body.data.id;
  };
  await add(cats[0], [1, 1]); // 0 PENDING  total 3500
  await add(cats[0], [5]); // 1 PENDING  total 5000
  const approved = await add(cats[1], [3], manager); // 2 -> APPROVED total 1500
  await h.api('PATCH', `${PO}/${approved}/approve`, { token: manager.token });
  pos[2].status = 'APPROVED';
  const canceled = await add(cats[2], [2]); // 3 -> CANCELED total 140000
  await h.api('PATCH', `${PO}/${canceled}/cancel`, { token: manager.token, body: { reason: 'supplier cannot deliver' } });
  pos[3].status = 'CANCELED';
  const received = await h.insertPoRaw({ catalog: cats[2], status: 'RECEIVED', createdBy: manager.staffId, approvedBy: manager.staffId }); // 4 RECEIVED
  pos.push({ id: received, status: 'RECEIVED', cat: cats[2] });
});
after(() => h.teardown());

// UC23 -----------------------------------------------------------------------------------------------------
test('23-01 default list is newest first (createdAt DESC, id DESC) with the SRS columns', async () => {
  const res = await list();
  assert.equal(res.status, 200);
  const got = ids(res);
  assert.deepEqual(got, pos.map((p) => p.id).sort((a, b) => b - a));
  const row = res.body.data.items.find((i) => i.id === pos[0].id);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'createdBy', 'createdByName', 'id', 'itemCount', 'poCode', 'status', 'supplierId', 'supplierName', 'totalAmount']);
  assert.equal(row.supplierName, cats[0].supplierName);
  assert.equal(row.createdByName, 'Test warehouse');
  assert.equal(row.totalAmount, 3500);
  assert.equal(row.itemCount, 2);
  assert.equal(res.body.data.pagination.total, 5);
  assert.equal(res.body.data.filters.sortBy, 'createdAt');
  assert.equal(res.body.data.filters.sortDir, 'desc');
  assert.equal((await list('', manager.token)).status, 200);
});

test('23-02 status filter (PENDING/APPROVED/RECEIVED/CANCELED) and invalid status', async () => {
  for (const status of ['PENDING', 'APPROVED', 'RECEIVED', 'CANCELED']) {
    const res = await list(`status=${status}`);
    assert.deepEqual(ids(res).sort(), pos.filter((p) => p.status === status).map((p) => p.id).sort(), status);
  }
  assert.equal((await list('status=pending')).body.data.items.length, 2);
  for (const bad of ['DRAFT', 'Approved%27--', 'WaitingForDelivery']) {
    const res = await list(`status=${bad}`);
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.code, 'INVALID_STATUS');
  }
  assert.equal((await list('status=PENDING&status=APPROVED')).status, 400);
});

test('23-03 date range filter (inclusive "to") and validation', async () => {
  const [{ today }] = await h.query("SELECT CONVERT(VARCHAR(10), SYSDATETIME(), 23) AS today");
  const [{ tomorrow }] = await h.query("SELECT CONVERT(VARCHAR(10), DATEADD(DAY, 1, SYSDATETIME()), 23) AS tomorrow");
  const [{ yesterday }] = await h.query("SELECT CONVERT(VARCHAR(10), DATEADD(DAY, -1, SYSDATETIME()), 23) AS yesterday");
  assert.equal((await list(`from=${today}&to=${today}`)).body.data.pagination.total, 5);
  assert.equal((await list(`from=${yesterday}&to=${tomorrow}`)).body.data.pagination.total, 5);
  const future = await list(`from=${tomorrow}`);
  assert.equal(future.status, 200);
  assert.equal(future.body.data.items.length, 0);
  assert.equal((await list(`to=${yesterday}`)).body.data.items.length, 0);
  assert.equal((await list(`from=${today}`)).body.data.pagination.total, 5);
  for (const q of ['from=2026-13-40', 'from=abc', 'to=2026-02-30', 'from=2026-1-1', `from=${tomorrow}&to=${yesterday}`]) {
    const res = await list(q);
    assert.equal(res.status, 400, q);
    assert.ok(['INVALID_DATE', 'INVALID_DATE_RANGE'].includes(res.body.code), q);
  }
});

test('23-04 search by PO code / PO id / supplier name; wildcard and SQL metacharacters are treated literally', async () => {
  const first = pos[0];
  const row = (await h.poRow(first.id));
  const byCode = await h.api('GET', `${PO}?q=${row.poCode}`, { token: warehouse.token });
  assert.deepEqual(ids(byCode), [first.id]);
  const byCodeLower = await h.api('GET', `${PO}?q=${row.poCode.toLowerCase()}`, { token: warehouse.token });
  assert.deepEqual(ids(byCodeLower), [first.id]);
  const byId = await h.api('GET', `${PO}?q=${first.id}`, { token: warehouse.token });
  assert.ok(ids(byId).includes(first.id));
  const bySupplier = await h.api('GET', `${PO}?q=${encodeURIComponent(cats[1].supplierName)}`, { token: warehouse.token });
  assert.deepEqual(ids(bySupplier), [pos[2].id]);
  const partial = await h.api('GET', `${PO}?q=${encodeURIComponent(cats[1].supplierName.toLowerCase().slice(3, 14))}`, { token: warehouse.token });
  assert.ok(ids(partial).includes(pos[2].id));

  const total = (await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrders'))[0].n;
  for (const q of ['%', '_', '[a-z]', '%25_', "'; DROP TABLE dbo.PurchaseOrders; --", '\\']) {
    const res = await h.api('GET', `${PO}?q=${encodeURIComponent(q)}`, { token: warehouse.token });
    assert.equal(res.status, 200, q);
    assert.equal(res.body.data.items.length, 0, `q=${q} must not behave as a pattern`);
  }
  assert.equal((await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrders'))[0].n, total);
  assert.equal((await h.api('GET', `${PO}?q=${'x'.repeat(101)}`, { token: warehouse.token })).status, 400);
});

test('23-05 sort by the four SRS columns in both directions; anything else is rejected', async () => {
  const cmp = { createdAt: (a, b) => new Date(a.createdAt) - new Date(b.createdAt), supplierName: (a, b) => (a.supplierName < b.supplierName ? -1 : a.supplierName > b.supplierName ? 1 : 0), totalAmount: (a, b) => a.totalAmount - b.totalAmount, status: (a, b) => (a.status < b.status ? -1 : a.status > b.status ? 1 : 0) };
  for (const [key, compare] of Object.entries(cmp)) {
    for (const dir of ['asc', 'desc']) {
      const res = await list(`sortBy=${key}&sortDir=${dir}`);
      assert.equal(res.status, 200, `${key} ${dir}`);
      const items = res.body.data.items;
      for (let i = 1; i < items.length; i += 1) {
        const c = compare(items[i - 1], items[i]);
        assert.ok(dir === 'asc' ? c <= 0 : c >= 0, `${key} ${dir} at ${i}`);
        if (c === 0) assert.ok(items[i - 1].id > items[i].id, 'ties broken by id DESC');
      }
    }
  }
  for (const q of ['sortBy=poCode', 'sortBy=createdBy', 'sortBy=id;DROP%20TABLE%20x', 'sortBy=po.createdAt', 'sortBy=createdAt&sortDir=sideways', 'sortBy=createdAt&sortDir=asc;--', 'sortBy=__proto__']) {
    const res = await list(q);
    assert.equal(res.status, 400, q);
    assert.equal(res.body.code, 'INVALID_SORT');
  }
});

test('23-06 pagination', async () => {
  const p1 = await list('pageSize=2&page=1');
  const p2 = await list('pageSize=2&page=2');
  const p3 = await list('pageSize=2&page=3');
  assert.equal(p1.body.data.pagination.total, 5);
  assert.equal(p1.body.data.pagination.totalPages, 3);
  assert.deepEqual([p1, p2, p3].map((r) => r.body.data.items.length), [2, 2, 1]);
  assert.deepEqual([...ids(p1), ...ids(p2), ...ids(p3)], pos.map((p) => p.id).sort((a, b) => b - a));
  const beyond = await list('pageSize=2&page=9');
  assert.equal(beyond.status, 200);
  assert.equal(beyond.body.data.items.length, 0);
  for (const q of ['page=0', 'page=-1', 'page=abc', 'pageSize=0', 'pageSize=101', 'pageSize=1.5']) assert.equal((await list(q)).status, 400, q);
  assert.equal((await list('pageSize=100')).status, 200);
});

test('23-07 no matching records -> 200 with an empty list and a message (E1)', async () => {
  const res = await h.api('GET', `${PO}?q=zz-no-such-supplier-${RUN}`, { token: warehouse.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.data.items, []);
  assert.equal(res.body.data.pagination.total, 0);
  assert.equal(res.body.message, 'No matching purchase orders found');
});

test('23-08 a database error returns 500 DB_ERROR without leaking details (E2)', async () => {
  const original = poRepo.getPurchaseOrders;
  poRepo.getPurchaseOrders = async () => {
    throw Object.assign(new Error("Login failed for user 'sa' on SECRET-HOST"), { name: 'RequestError', number: 4060 });
  };
  try {
    const res = await list();
    assert.equal(res.status, 500);
    assert.equal(res.body.code, 'DB_ERROR');
    assert.equal(JSON.stringify(res.body).includes('SECRET-HOST'), false);
  } finally {
    poRepo.getPurchaseOrders = original;
  }
  assert.equal((await list()).status, 200);
});

const checksum = async () => (await h.query('SELECT (SELECT CHECKSUM_AGG(CHECKSUM(*)) FROM dbo.PurchaseOrders) AS po, (SELECT CHECKSUM_AGG(CHECKSUM(*)) FROM dbo.PurchaseOrderItems) AS items, (SELECT COUNT(*) FROM dbo.PurchaseOrders) AS n'))[0];

test('23-09 / 24-04 UC23 and UC24 are read-only: PO tables and stock are byte-for-byte unchanged', async () => {
  const stockIds = cats.flatMap((c) => c.products.map((p) => p.variantId));
  const before = { c: await checksum(), s: await h.stockOf(stockIds) };
  await list();
  await list('status=PENDING&sortBy=totalAmount');
  for (const p of pos) await h.api('GET', `${PO}/${p.id}`, { token: manager.token });
  await h.api('GET', `${PO}/999999999`, { token: manager.token });
  assert.deepEqual(await checksum(), before.c);
  assert.deepEqual(await h.stockOf(stockIds), before.s);
});

// UC24 -----------------------------------------------------------------------------------------------------
test('24-01 detail returns header, supplier snapshot, items with snapshot price, totals, people and timeline', async () => {
  const res = await h.api('GET', `${PO}/${pos[0].id}`, { token: warehouse.token });
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.id, pos[0].id);
  assert.match(d.poCode, /^PO-\d{6}$/);
  assert.equal(d.status, 'PENDING');
  assert.equal(d.supplier.name, cats[0].supplierName);
  assert.equal(d.supplier.address, 'Test Address 1');
  assert.equal(d.totalAmount, 3500);
  assert.equal(d.createdBy.fullName, 'Test warehouse');
  assert.equal(d.items.length, 2);
  const [i1] = d.items;
  assert.deepEqual([i1.variantId, i1.quantity, i1.costPrice, i1.total, i1.unitName], [cats[0].products[0].variantId, 1, 1000, 1000, 'pcs']);
  assert.ok(i1.productCode && i1.productName);
  assert.deepEqual(d.timeline.map((t) => t.event), ['CREATED']);
  assert.equal(d.timeline[0].by.staffId, warehouse.staffId);
});

test('24-02 not found / invalid id', async () => {
  const nf = await h.api('GET', `${PO}/2147483000`, { token: manager.token });
  assert.equal(nf.status, 404);
  assert.equal(nf.body.code, 'PO_NOT_FOUND');
  for (const bad of ['abc', '0', '-1', '1.5', '99999999999', '1;DROP', '%20']) {
    const res = await h.api('GET', `${PO}/${bad}`, { token: manager.token });
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.code, 'INVALID_ID');
  }
});

test('24-03 detail shows the creation-time supplier snapshot, not the current supplier', async () => {
  await h.query("UPDATE dbo.Suppliers SET name = N'Changed After Order' WHERE id = @id", { id: [h.sql.Int, cats[1].supplierId] });
  const d = (await h.api('GET', `${PO}/${pos[2].id}`, { token: manager.token })).body.data;
  assert.equal(d.supplier.name, cats[1].supplierName);
});

test('24-05 availableActions depend on role and status', async () => {
  const actions = async (p, token) => (await h.api('GET', `${PO}/${p.id}`, { token })).body.data.availableActions;
  assert.deepEqual(await actions(pos[0], manager.token), ['APPROVE', 'CANCEL']);
  assert.deepEqual(await actions(pos[2], manager.token), ['CANCEL']);
  assert.deepEqual(await actions(pos[3], manager.token), []);
  assert.deepEqual(await actions(pos[4], manager.token), []);
  for (const p of pos) assert.deepEqual(await actions(p, warehouse.token), []);
});

test('24-06 timeline is derived from timestamps (created, approved, received, canceled) and is not an audit log', async () => {
  const canceled = (await h.api('GET', `${PO}/${pos[3].id}`, { token: manager.token })).body.data;
  assert.deepEqual(canceled.timeline.map((t) => t.event), ['CREATED', 'CANCELED']);
  assert.equal(canceled.timeline[1].reason, 'supplier cannot deliver');
  assert.equal(canceled.timeline[1].by.staffId, manager.staffId);
  assert.equal(canceled.cancelReason, 'supplier cannot deliver');

  const approved = (await h.api('GET', `${PO}/${pos[2].id}`, { token: manager.token })).body.data;
  assert.deepEqual(approved.timeline.map((t) => t.event), ['CREATED', 'APPROVED']);
  assert.equal(approved.approvedBy.staffId, manager.staffId);

  await h.insertGoodReceipt(pos[2].id, manager.staffId); // what UC31 would write
  const received = (await h.api('GET', `${PO}/${pos[2].id}`, { token: manager.token })).body.data;
  assert.deepEqual(received.timeline.map((t) => t.event), ['CREATED', 'APPROVED', 'RECEIVED']);
  assert.deepEqual(received.availableActions, []); // a receipt exists: cannot cancel
});
