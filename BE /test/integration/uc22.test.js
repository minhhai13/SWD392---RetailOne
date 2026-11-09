const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, uniq } = require('../helpers/harness');
const poRepo = require('../../src/modules/inventory-management/repositories/purchaseOrder.repository');

let h;
before(async () => {
  h = await setup();
  await h.standardActors();
});
after(() => h.teardown());

const PO = '/api/inventory/purchase-orders';
const body = (cat, qtys = [2, 3]) => ({ supplierId: cat.supplierId, items: cat.products.slice(0, qtys.length).map((p, i) => ({ variantId: p.variantId, quantity: qtys[i] })) });
const dbError = () => Object.assign(new Error('simulated failure'), { name: 'RequestError', number: 515 });

test('22-01 Warehouse Staff creates one PENDING PO with SQL-generated code, supplier snapshot, price snapshot and server total', async () => {
  const cat = await h.makeCatalog({ prices: [10000, 25000] });
  const res = await h.createPo(h.actors.warehouse.token, cat, [2, 3]);
  assert.equal(res.status, 201);
  const po = res.body.data;
  assert.equal(po.status, 'PENDING');
  assert.match(po.poCode, /^PO-\d{6}$/);
  assert.equal(po.poCode, `PO-${String(po.id).padStart(6, '0')}`);
  assert.deepEqual(po.supplier, { id: cat.supplierId, name: cat.supplierName, taxId: po.supplier.taxId, phoneNumber: po.supplier.phoneNumber, address: 'Test Address 1' });
  assert.equal(po.items.length, 2);
  assert.deepEqual(po.items.map((i) => [i.variantId, i.quantity, i.costPrice, i.total]), cat.products.map((p, i) => [p.variantId, [2, 3][i], p.price, p.price * [2, 3][i]]));
  assert.equal(po.totalAmount, 2 * 10000 + 3 * 25000);
  assert.equal(po.createdBy.staffId, h.actors.warehouse.staffId);
  assert.equal(po.approvedBy, null);
  assert.equal(po.canceledBy, null);

  const row = await h.poRow(po.id);
  assert.equal(row.status, 'PENDING');
  assert.equal(row.createdBy, String(h.actors.warehouse.staffId));
  assert.equal(row.approvedAt, null);
  assert.equal(Number(row.totalAmount), 95000);
});

test('22-02 Manager can create a PO', async () => {
  const cat = await h.makeCatalog();
  const res = await h.createPo(h.actors.manager.token, cat, [1]);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.createdBy.staffId, h.actors.manager.staffId);
});

test('22-03 the price snapshot is the LATEST SupplierProductPrices row (createdAt DESC, id DESC)', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const { supplierId } = cat;
  const { variantId } = cat.products[0];
  const hour = 3600 * 1000;
  const base = Date.now() + 10 * hour; // later than the price created by makeCatalog
  await h.f.addPrice(h.pool, { supplierId, variantId, price: 12000, createdAt: new Date(base) });
  await h.f.addPrice(h.pool, { supplierId, variantId, price: 15000, createdAt: new Date(base + hour) });
  await h.f.addPrice(h.pool, { supplierId, variantId, price: 16000, createdAt: new Date(base + hour) }); // same timestamp, higher id wins
  await h.f.addPrice(h.pool, { supplierId, variantId, price: 999, createdAt: new Date(base - 5 * 24 * hour) }); // inserted last but OLDER
  const res = await h.createPo(h.actors.manager.token, cat, [2]);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.items[0].costPrice, 16000);
  assert.equal(res.body.data.totalAmount, 32000);
});

test('22-04 client-supplied price / total / status / actor / supplier snapshot / code are ignored', async () => {
  const cat = await h.makeCatalog({ prices: [10000] });
  const res = await h.api('POST', PO, {
    token: h.actors.warehouse.token,
    body: {
      supplierId: cat.supplierId, status: 'APPROVED', totalAmount: 1, total: 1, poCode: 'PO-999999', id: 1, createdBy: h.actors.manager.staffId,
      approvedBy: h.actors.manager.staffId, supplierName: 'Hacked', supplierTaxId: 'HACK', cancelReason: 'x',
      items: [{ variantId: cat.products[0].variantId, quantity: 4, costPrice: 1, price: 1, total: 1, receivedQuantity: 4 }],
    },
  });
  assert.equal(res.status, 201);
  const po = res.body.data;
  assert.equal(po.status, 'PENDING');
  assert.equal(po.totalAmount, 40000);
  assert.equal(po.supplier.name, cat.supplierName);
  assert.equal(po.items[0].costPrice, 10000);
  assert.equal(po.items[0].receivedQuantity, 0);
  assert.equal(po.createdBy.staffId, h.actors.warehouse.staffId);
  assert.notEqual(po.id, 1);
});

test('22-05 inventory is not changed (POST-3, BR-45)', async () => {
  const cat = await h.makeCatalog({ prices: [10, 20] });
  const ids = cat.products.map((p) => p.variantId);
  const before = await h.stockOf(ids);
  assert.equal((await h.createPo(h.actors.warehouse.token, cat, [5, 5])).status, 201);
  assert.deepEqual(await h.stockOf(ids), before);
  const batches = await h.query('SELECT COUNT(*) AS n FROM dbo.Batches WHERE variantId IN (@a, @b)', { a: [h.sql.Int, ids[0]], b: [h.sql.Int, ids[1]] });
  assert.equal(batches[0].n, 0);
});

test('22-06 empty / missing / malformed item list is rejected and nothing is saved (E1)', async () => {
  const cat = await h.makeCatalog();
  const before = await h.countPos();
  for (const payload of [{ supplierId: cat.supplierId, items: [] }, { supplierId: cat.supplierId }, { supplierId: cat.supplierId, items: 'x' }, { supplierId: cat.supplierId, items: [null] }, { supplierId: cat.supplierId, items: [{}] }]) {
    const res = await h.api('POST', PO, { token: h.actors.manager.token, body: payload });
    assert.equal(res.status, 400, JSON.stringify(payload));
  }
  const empty = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: cat.supplierId, items: [] } });
  assert.equal(empty.body.code, 'EMPTY_ITEMS');
  assert.equal(await h.countPos(), before);
});

test('22-07 only positive whole-number quantities are accepted (E1; OPEN-QUESTIONS Q2)', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const v = cat.products[0].variantId;
  const before = await h.countPos();
  for (const quantity of [0, -1, 1.5, 0.001, '1.5', 'abc', '', null, true, [], {}, 1e21, 1000000000000, undefined]) {
    const res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: cat.supplierId, items: [{ variantId: v, quantity }] } });
    assert.equal(res.status, 400, `quantity ${JSON.stringify(quantity)}`);
    assert.equal(res.body.code, 'INVALID_QUANTITY');
  }
  assert.equal(await h.countPos(), before);
  const ok = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: cat.supplierId, items: [{ variantId: v, quantity: '4' }] } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.items[0].quantity, 4);
});

test('22-08 duplicate variant in one PO is rejected (UQ_POI_PoVariant)', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const v = cat.products[0].variantId;
  const before = await h.countPos();
  const res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: cat.supplierId, items: [{ variantId: v, quantity: 1 }, { variantId: v, quantity: 2 }] } });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'DUPLICATE_VARIANT');
  assert.equal(await h.countPos(), before);
});

test('22-09 inactive supplier is blocked (BR-86)', async () => {
  const cat = await h.makeCatalog({ supplierStatus: 'Inactive' });
  const before = await h.countPos();
  const res = await h.createPo(h.actors.manager.token, cat, [1]);
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'SUPPLIER_INACTIVE');
  assert.equal(await h.countPos(), before);
});

test('22-10 unknown / invalid supplierId', async () => {
  const items = [{ variantId: 1, quantity: 1 }];
  assert.equal((await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: 2147483000, items } })).body.code, 'SUPPLIER_NOT_FOUND');
  for (const supplierId of ['abc', -1, 0, 1.5, null, undefined, '1; DROP TABLE x']) {
    const res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId, items } });
    assert.equal(res.status, 400, String(supplierId));
  }
});

test('22-11 variant not mapped to the supplier (no mapping, INACTIVE mapping, other supplier product) -> 422', async () => {
  const a = await h.makeCatalog({ prices: [100] });
  const b = await h.makeCatalog({ prices: [100] });
  await h.query("UPDATE dbo.ProductSuppliers SET status = 'INACTIVE' WHERE supplierId = @s", { s: [h.sql.Int, b.supplierId] });
  const before = await h.countPos();
  // variant of supplier b ordered from supplier a
  let res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: a.supplierId, items: [{ variantId: b.products[0].variantId, quantity: 1 }] } });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VARIANT_NOT_SUPPLIED');
  assert.deepEqual(res.body.details.variantIds, [b.products[0].variantId]);
  // INACTIVE mapping: supplier b now has no orderable products at all
  res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: b.supplierId, items: [{ variantId: b.products[0].variantId, quantity: 1 }] } });
  assert.equal(res.status, 422);
  assert.equal(await h.countPos(), before);
  // unknown variant
  res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: a.supplierId, items: [{ variantId: 2147483000, quantity: 1 }] } });
  assert.equal(res.body.code, 'VARIANT_NOT_FOUND');
});

test('22-12 missing price -> 422 PRICE_NOT_CONFIGURED; non-positive price cannot exist (CK_SPP_Price)', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const productId = await h.f.createProduct(h.pool, { code: uniq('NOPRICE'), name: 'No price' });
  const variantId = await h.f.createVariant(h.pool, { productId });
  h.tracked.productIds.push(productId);
  h.tracked.variantIds.push(variantId);
  await h.f.mapProduct(h.pool, { productId, supplierId: cat.supplierId });
  const before = await h.countPos();
  const res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: cat.supplierId, items: [{ variantId: cat.products[0].variantId, quantity: 1 }, { variantId, quantity: 1 }] } });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'PRICE_NOT_CONFIGURED');
  assert.deepEqual(res.body.details.variantIds, [variantId]);
  assert.equal(await h.countPos(), before);
  await assert.rejects(h.f.addPrice(h.pool, { supplierId: cat.supplierId, variantId, price: 0 }), (e) => e.number === 547);
  await assert.rejects(h.f.addPrice(h.pool, { supplierId: cat.supplierId, variantId, price: -5 }), (e) => e.number === 547);
});

test('22-13 StopSelling / Suspended products cannot be ordered', async () => {
  for (const status of ['StopSelling', 'Suspended']) {
    const cat = await h.makeCatalog({ prices: [100, 200] });
    await h.query('UPDATE dbo.Products SET status = @s WHERE id = @id', { s: [h.sql.VarChar(20), status], id: [h.sql.BigInt, cat.products[1].productId] });
    const res = await h.createPo(h.actors.manager.token, cat, [1, 1]);
    assert.equal(res.status, 422, status);
    assert.equal(res.body.code, 'PRODUCT_INACTIVE');
    assert.deepEqual(res.body.details.variantIds, [cat.products[1].variantId]);
  }
});

test('22-14 supplier lookups, and a supplier without mapped products is reported (E2)', async () => {
  const active = await h.makeCatalog({ prices: [100] });
  const inactive = await h.makeCatalog({ supplierStatus: 'Inactive' });
  const empty = await h.makeCatalog({ prices: [] });
  const token = h.actors.warehouse.token;

  const list = await h.api('GET', '/api/inventory/suppliers', { token });
  assert.equal(list.status, 200);
  const ids = list.body.data.map((s) => s.id);
  assert.ok(ids.includes(active.supplierId));
  assert.ok(ids.includes(empty.supplierId));
  assert.ok(!ids.includes(inactive.supplierId));
  assert.equal(list.body.data.find((s) => s.id === active.supplierId).orderableVariantCount, 1);
  assert.equal(list.body.data.find((s) => s.id === empty.supplierId).orderableVariantCount, 0);

  const catalog = await h.api('GET', `/api/inventory/suppliers/${active.supplierId}/products`, { token });
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.data.items.length, 1);
  assert.equal(catalog.body.data.items[0].variantId, active.products[0].variantId);
  assert.equal(catalog.body.data.items[0].supplyPrice, 100);

  const none = await h.api('GET', `/api/inventory/suppliers/${empty.supplierId}/products`, { token });
  assert.equal(none.status, 200);
  assert.deepEqual(none.body.data.items, []);
  assert.match(none.body.message, /no mapped products/i);

  assert.equal((await h.api('GET', `/api/inventory/suppliers/${inactive.supplierId}/products`, { token })).status, 422);
  assert.equal((await h.api('GET', '/api/inventory/suppliers/2147483000/products', { token })).status, 404);
  assert.equal((await h.api('GET', '/api/inventory/suppliers/abc/products', { token })).status, 400);

  const before = await h.countPos();
  const res = await h.api('POST', PO, { token, body: { supplierId: empty.supplierId, items: [{ variantId: active.products[0].variantId, quantity: 1 }] } });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'SUPPLIER_NO_MAPPED_PRODUCTS');
  assert.equal(await h.countPos(), before);
});

test('22-15 a failure while saving rolls back everything: no PO header, no items (E3)', async () => {
  const cat = await h.makeCatalog({ prices: [100, 200] });
  const before = await h.countPos();
  const itemsBefore = (await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrderItems'))[0].n;

  for (const fn of ['insertItems', 'recalculateTotal']) {
    const original = poRepo[fn];
    poRepo[fn] = async () => {
      throw dbError();
    };
    try {
      const res = await h.createPo(h.actors.manager.token, cat, [1, 1]);
      assert.equal(res.status, 500, fn);
      assert.equal(res.body.code, 'DB_ERROR');
      assert.ok(!JSON.stringify(res.body).includes('simulated'), 'raw driver message must not leak');
    } finally {
      poRepo[fn] = original;
    }
    assert.equal(await h.countPos(), before, `${fn}: no orphan PO header`);
    assert.equal((await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrderItems'))[0].n, itemsBefore, `${fn}: no orphan items`);
  }
  assert.equal((await h.createPo(h.actors.manager.token, cat, [1, 1])).status, 201); // works again afterwards
});

test('22-16 supplier data is a snapshot: later supplier edits never change existing POs (BR-84)', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const res = await h.createPo(h.actors.manager.token, cat, [1]);
  const { id, supplier } = res.body.data;
  await h.query("UPDATE dbo.Suppliers SET name = N'Renamed Co', address = N'New address', phoneNumber = @p WHERE id = @id", { p: [h.sql.VarChar(20), uniq('NP')], id: [h.sql.Int, cat.supplierId] });
  const detail = await h.api('GET', `${PO}/${id}`, { token: h.actors.manager.token });
  assert.deepEqual(detail.body.data.supplier, supplier);
  const list = await h.api('GET', `${PO}?q=${cat.supplierName.replace(/ /g, '%20')}`, { token: h.actors.manager.token });
  assert.ok(list.body.data.items.some((i) => i.id === id && i.supplierName === cat.supplierName));
});

test('22-17 exact decimal total (12345.67 x 3 = 37037.01)', async () => {
  const cat = await h.makeCatalog({ prices: [12345.67] });
  const res = await h.createPo(h.actors.manager.token, cat, [3]);
  assert.equal(res.body.data.totalAmount, 37037.01);
  assert.equal(res.body.data.items[0].total, 37037.01);
});

test('22-18 several items -> ONE PO; sequential POs get distinct SQL codes', async () => {
  const cat = await h.makeCatalog({ prices: [1, 2, 3, 4] });
  const before = await h.countPos();
  const a = await h.createPo(h.actors.manager.token, cat, [1, 1, 1, 1]);
  const b = await h.createPo(h.actors.manager.token, cat, [2]);
  assert.equal(await h.countPos(), before + 2);
  assert.equal(a.body.data.items.length, 4);
  assert.notEqual(a.body.data.id, b.body.data.id);
  assert.notEqual(a.body.data.poCode, b.body.data.poCode);
  assert.equal(a.body.data.totalAmount, 10);
});

test('22-19 limits and malformed input: too many items, long notes, bad JSON', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const v = cat.products[0].variantId;
  const t = h.actors.manager.token;
  const many = Array.from({ length: 201 }, (_, i) => ({ variantId: v + i, quantity: 1 }));
  assert.equal((await h.api('POST', PO, { token: t, body: { supplierId: cat.supplierId, items: many } })).body.code, 'TOO_MANY_ITEMS');
  assert.equal((await h.api('POST', PO, { token: t, body: { supplierId: cat.supplierId, items: [{ variantId: v, quantity: 1, note: 'x'.repeat(501) }] } })).status, 400);
  assert.equal((await h.api('POST', PO, { token: t, body: { supplierId: cat.supplierId, note: 'y'.repeat(2001), items: [{ variantId: v, quantity: 1 }] } })).status, 400);
  assert.equal((await h.api('POST', PO, { token: t, body: '{"supplierId": ' })).body.code, 'INVALID_JSON');
  assert.equal((await h.api('POST', PO, { token: t, body: '[]' })).status, 400);
  const ok = await h.api('POST', PO, { token: t, body: { supplierId: cat.supplierId, note: '  hello  ', items: [{ variantId: v, quantity: 1, note: '  line  ' }] } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.note, 'hello');
  assert.equal(ok.body.data.items[0].note, 'line');
});

test('22-20 a total that does not fit DECIMAL(18,2) is rejected and rolled back', async () => {
  const cat = await h.makeCatalog({ prices: [9999999999999.99] });
  const before = await h.countPos();
  const res = await h.api('POST', PO, { token: h.actors.manager.token, body: { supplierId: cat.supplierId, items: [{ variantId: cat.products[0].variantId, quantity: 999999999999 }] } });
  assert.equal(res.status, 422);
  assert.equal(res.body.code, 'VALUE_OUT_OF_RANGE');
  assert.equal(await h.countPos(), before);
});
