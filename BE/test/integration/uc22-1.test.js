// UC22.1 - Create Purchase Order from the Low-Stock list: GET /inventory/suppliers/by-variants?variantIds=1,2,3
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup, uniq } = require('../helpers/harness');

let h;
let A; // supplier with products a1, a2
let B; // supplier with its own product b1 AND a1 (cheaper price)
let inactiveSup;
let a1;
let a2;
const BY = '/api/inventory/suppliers/by-variants';
const lookup = (variantIds, token = h.actors.warehouse.token, extra = '') => h.api('GET', `${BY}?variantIds=${[].concat(variantIds).join(',')}${extra}`, { token });

before(async () => {
  h = await setup();
  await h.standardActors();
  A = await h.makeCatalog({ prices: [100, 200] });
  B = await h.makeCatalog({ prices: [50] });
  [a1, a2] = A.products;
  await h.f.mapProduct(h.pool, { productId: a1.productId, supplierId: B.supplierId }); // a1 is also supplied by B
  await h.f.addPrice(h.pool, { supplierId: B.supplierId, variantId: a1.variantId, price: 150 });
  inactiveSup = await h.makeCatalog({ prices: [], supplierStatus: 'Inactive' });
  await h.f.mapProduct(h.pool, { productId: a1.productId, supplierId: inactiveSup.supplierId });
  await h.f.addPrice(h.pool, { supplierId: inactiveSup.supplierId, variantId: a1.variantId, price: 1 });
});
after(() => h.teardown());

const byId = (res, supplierId) => res.body.data.suppliers.find((s) => s.id === supplierId);

test('22.1-01 active suppliers providing the selected variants, flagged by coverage, with DB prices', async () => {
  const res = await lookup([a1.variantId, a2.variantId]);
  assert.equal(res.status, 200);
  const a = byId(res, A.supplierId);
  const b = byId(res, B.supplierId);
  assert.equal(a.coversAll, true);
  assert.deepEqual(a.items.map((i) => [i.variantId, i.supplyPrice]), [[a1.variantId, 100], [a2.variantId, 200]]);
  assert.deepEqual([b.coversAll, b.coveredVariantIds, b.missingVariantIds], [false, [a1.variantId], [a2.variantId]]);
  assert.equal(b.items[0].supplyPrice, 150);
  assert.equal(res.body.data.suppliers[0].id, A.supplierId, 'suppliers covering everything come first');
  assert.equal(byId(res, inactiveSup.supplierId), undefined, 'inactive supplier excluded');
  assert.deepEqual(res.body.data.unknownVariantIds, []);
});

test('22.1-02 a single variant: every active supplier that provides it', async () => {
  const res = await lookup([a1.variantId]);
  assert.deepEqual(res.body.data.suppliers.map((s) => s.id).sort(), [A.supplierId, B.supplierId].sort());
  assert.ok(res.body.data.suppliers.every((s) => s.coversAll));
});

test('22.1-03 the price always comes from SupplierProductPrices (latest row); client-sent prices are ignored', async () => {
  await h.f.addPrice(h.pool, { supplierId: A.supplierId, variantId: a1.variantId, price: 111, createdAt: new Date(Date.now() + 3600 * 1000) });
  const res = await lookup([a1.variantId], h.actors.warehouse.token, '&price=1&supplyPrice=1&supplierId=999');
  assert.equal(res.status, 200);
  assert.equal(byId(res, A.supplierId).items[0].supplyPrice, 111);
  assert.equal(byId(res, B.supplierId).items[0].supplyPrice, 150);
});

test('22.1-04 no suitable supplier -> 200, empty list and a message', async () => {
  const onlyInactive = await h.makeCatalog({ prices: [10], supplierStatus: 'Inactive' });
  const res = await lookup([onlyInactive.products[0].variantId]);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.suppliers, []);
  assert.equal(res.body.message, 'No active supplier provides the selected products.');
  // a product that nobody supplies
  const orphan = await h.f.createProduct(h.pool, { code: uniq('ORPH'), name: 'Orphan' });
  const v = await h.f.createVariant(h.pool, { productId: orphan });
  h.tracked.productIds.push(orphan);
  h.tracked.variantIds.push(v);
  assert.deepEqual((await lookup([v])).body.data.suppliers, []);
});

test('22.1-05 inactive products, INACTIVE mappings, missing prices and unknown ids are reported/excluded', async () => {
  const sellable = await h.makeCatalog({ prices: [10, 20, 30] });
  const [p1, p2, p3] = sellable.products;
  await h.query("UPDATE dbo.Products SET status = 'StopSelling' WHERE id = @id", { id: [h.sql.BigInt, p2.productId] });
  await h.query("UPDATE dbo.ProductSuppliers SET status = 'INACTIVE' WHERE supplierId = @s AND productId = @p", { s: [h.sql.Int, sellable.supplierId], p: [h.sql.BigInt, p3.productId] });
  const res = await lookup([p1.variantId, p2.variantId, p3.variantId, 2147483000]);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.unknownVariantIds, [2147483000]);
  assert.deepEqual(res.body.data.inactiveVariantIds, [p2.variantId]);
  const s = byId(res, sellable.supplierId);
  assert.deepEqual([s.coveredVariantIds, s.missingVariantIds], [[p1.variantId], [p3.variantId]]); // p2 is not orderable at all, so it is not "missing"
  assert.equal(res.body.data.selectedVariants.length, 3);
});

test('22.1-06 selected variants carry stock info so the form can pre-populate (read-only)', async () => {
  const res = await lookup([a1.variantId]);
  const v = res.body.data.selectedVariants[0];
  assert.equal(v.variantId, a1.variantId);
  assert.deepEqual(v.stock, { quantityOnHand: 7, minThreshold: 0 });
  assert.ok(v.productName && v.productCode && v.unitName);
  const none = await h.f.createProduct(h.pool, { code: uniq('NOSTOCK'), name: 'No stock row' });
  const nv = await h.f.createVariant(h.pool, { productId: none });
  h.tracked.productIds.push(none);
  h.tracked.variantIds.push(nv);
  assert.equal((await lookup([nv])).body.data.selectedVariants[0].stock, null);
});

test('22.1-07 validation and permissions', async () => {
  const t = h.actors.warehouse.token;
  for (const q of ['', 'variantIds=', 'variantIds=abc', 'variantIds=1,,2', 'variantIds=0', 'variantIds=1.5', 'variantIds=1&variantIds=2', `variantIds=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`]) {
    const res = await h.api('GET', `${BY}${q ? `?${q}` : ''}`, { token: t });
    assert.equal(res.status, 400, q);
  }
  assert.equal((await lookup([a1.variantId, a1.variantId, a1.variantId])).status, 200); // duplicates collapse
  assert.equal((await h.api('GET', `${BY}?variantIds=${a1.variantId}`)).status, 401);
  assert.equal((await lookup([a1.variantId], h.actors.cashier.token)).status, 403);
  assert.equal((await lookup([a1.variantId], h.actors.manager.token)).status, 200);
});

test('22.1-08 end to end: pick a supplier from the result, pre-populate, create ONE PO priced from the database', async () => {
  const lookupRes = await lookup([a1.variantId, a2.variantId]);
  const chosen = byId(lookupRes, A.supplierId);
  const before = await h.countPos();
  const create = await h.api('POST', '/api/inventory/purchase-orders', {
    token: h.actors.warehouse.token,
    body: { supplierId: chosen.id, items: chosen.items.map((i) => ({ variantId: i.variantId, quantity: 4, costPrice: 1 })) },
  });
  assert.equal(create.status, 201);
  assert.deepEqual(create.body.data.items.map((i) => i.costPrice), chosen.items.map((i) => i.supplyPrice));
  assert.equal(create.body.data.supplier.id, A.supplierId);
  assert.equal(await h.countPos(), before + 1);

  // a partially covering supplier can only be used for the products it covers
  const partial = byId(lookupRes, B.supplierId);
  const ok = await h.api('POST', '/api/inventory/purchase-orders', { token: h.actors.warehouse.token, body: { supplierId: partial.id, items: partial.items.map((i) => ({ variantId: i.variantId, quantity: 1 })) } });
  assert.equal(ok.status, 201);
  // one PO never mixes suppliers: ordering a2 from B is refused
  const mixed = await h.api('POST', '/api/inventory/purchase-orders', { token: h.actors.warehouse.token, body: { supplierId: B.supplierId, items: [{ variantId: a1.variantId, quantity: 1 }, { variantId: a2.variantId, quantity: 1 }] } });
  assert.equal(mixed.status, 422);
  assert.equal(mixed.body.code, 'VARIANT_NOT_SUPPLIED');
  assert.deepEqual(mixed.body.details.variantIds, [a2.variantId]);
});

test('22.1-09 the lookup is read-only: purchase orders, prices and stock are unchanged', async () => {
  const stockBefore = await h.stockOf([a1.variantId, a2.variantId]);
  const posBefore = await h.countPos();
  const pricesBefore = (await h.query('SELECT COUNT(*) AS n FROM dbo.SupplierProductPrices'))[0].n;
  await lookup([a1.variantId, a2.variantId]);
  assert.deepEqual(await h.stockOf([a1.variantId, a2.variantId]), stockBefore);
  assert.equal(await h.countPos(), posBefore);
  assert.equal((await h.query('SELECT COUNT(*) AS n FROM dbo.SupplierProductPrices'))[0].n, pricesBefore);
});
