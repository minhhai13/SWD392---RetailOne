const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/harness');

let h;
before(async () => {
  h = await setup();
  await h.standardActors();
});
after(() => h.teardown());

// DB-01 --------------------------------------------------------------------------------------------------
test('DB-01 database connection and health endpoint', async () => {
  const res = await h.api('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'ok');
});

test('DB-01 schema contains the tables, columns and constraints UC22-UC26 rely on (SCHEMA-VERIFY.md)', async () => {
  const cols = await h.query(`SELECT t.name AS tbl, c.name AS col, c.is_computed, c.is_identity FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id`);
  const has = (tbl, col) => cols.some((c) => c.tbl === tbl && c.col === col);
  const required = {
    Roles: ['id', 'name'], Users: ['id', 'roleId', 'username', 'passwordHash', 'isActive'],
    Staff: ['id', 'userId', 'fullName', 'employmentStatus'], Suppliers: ['id', 'name', 'taxId', 'phoneNumber', 'address', 'status'],
    Products: ['id', 'code', 'name', 'status'], ProductVariants: ['id', 'productId', 'unitName'], ProductSuppliers: ['productId', 'supplierId', 'status'],
    SupplierProductPrices: ['id', 'supplierId', 'variantId', 'price', 'createdAt'],
    PurchaseOrders: ['id', 'poCode', 'supplierId', 'supplierName', 'supplierTaxId', 'supplierPhone', 'supplierAddress', 'status', 'totalAmount', 'note', 'createdBy', 'createdAt', 'approvedBy', 'approvedAt', 'canceledBy', 'canceledAt', 'cancelReason'],
    PurchaseOrderItems: ['id', 'poId', 'variantId', 'quantity', 'costPrice', 'note', 'receivedQuantity', 'receivedTotal', 'total'],
    GoodReceipts: ['id', 'poId', 'receivedAt', 'receivedBy'], InventoryStocks: ['variantId', 'quantityOnHand'],
  };
  for (const [tbl, list] of Object.entries(required)) for (const col of list) assert.ok(has(tbl, col), `missing ${tbl}.${col}`);

  const flag = (tbl, col, key) => cols.find((c) => c.tbl === tbl && c.col === col)[key];
  assert.ok(flag('PurchaseOrders', 'id', 'is_identity'));
  assert.ok(flag('PurchaseOrders', 'poCode', 'is_computed'));
  assert.ok(flag('PurchaseOrderItems', 'total', 'is_computed'));
  assert.ok(flag('PurchaseOrderItems', 'receivedTotal', 'is_computed'));

  const constraints = (await h.query('SELECT name FROM sys.objects WHERE type IN (\'C\',\'UQ\',\'F\')')).map((r) => r.name);
  for (const name of ['CK_PO_Status', 'CK_PO_ApprovalInfo', 'CK_PO_CancelInfo', 'UQ_POI_PoVariant', 'FK_PO_CreatedBy', 'FK_PO_ApprovedBy', 'FK_PO_CanceledBy', 'FK_POI_Variant', 'CK_SPP_Price', 'UQ_GR_Po', 'CK_POI_Quantity', 'CK_POI_Cost']) {
    assert.ok(constraints.includes(name), `missing constraint ${name}`);
  }
});

// SQL-01..03 -----------------------------------------------------------------------------------------------
test('SQL-01 IDENTITY + computed columns: poCode and item total come from SQL Server and cannot be written', async () => {
  const cat = await h.makeCatalog({ prices: [12345.67] });
  const res = await h.createPo(h.actors.warehouse.token, cat, [3]);
  assert.equal(res.status, 201);
  const row = await h.poRow(res.body.data.id);
  assert.equal(row.poCode, `PO-${String(row.id).padStart(6, '0')}`);

  await assert.rejects(
    h.query("INSERT INTO dbo.PurchaseOrders (poCode, supplierId, supplierName, supplierTaxId, supplierPhone, createdBy) VALUES ('PO-999999', @s, 'x', 'x', 'x', @c)", {
      s: [h.sql.Int, cat.supplierId], c: [h.sql.BigInt, h.actors.manager.staffId],
    }),
    /computed|poCode/i
  );
  await assert.rejects(
    h.query('UPDATE dbo.PurchaseOrderItems SET total = 1 WHERE poId = @id', { id: [h.sql.Int, row.id] }),
    /computed|total/i
  );
});

test('SQL-02 CHECK / UNIQUE / FK constraints reject bad data', async () => {
  const cat = await h.makeCatalog({ prices: [100] });
  const res = await h.createPo(h.actors.manager.token, cat, [1]);
  const id = res.body.data.id;
  const variantId = cat.products[0].variantId;
  const ins = (extra) => h.query(`INSERT INTO dbo.PurchaseOrderItems (poId, variantId, quantity, costPrice) VALUES (@po, ${extra})`, { po: [h.sql.Int, id] });
  await assert.rejects(ins(`${variantId}, 1, 100`), (e) => e.number === 2627, 'UQ_POI_PoVariant');
  await assert.rejects(h.query("UPDATE dbo.PurchaseOrders SET status = 'DRAFT' WHERE id = @id", { id: [h.sql.Int, id] }), (e) => e.number === 547, 'CK_PO_Status');
  await assert.rejects(h.query("UPDATE dbo.PurchaseOrders SET status = 'APPROVED' WHERE id = @id", { id: [h.sql.Int, id] }), (e) => e.number === 547, 'CK_PO_ApprovalInfo');
  await assert.rejects(h.query("UPDATE dbo.PurchaseOrders SET status = 'CANCELED' WHERE id = @id", { id: [h.sql.Int, id] }), (e) => e.number === 547, 'CK_PO_CancelInfo');
  await assert.rejects(h.query('INSERT INTO dbo.SupplierProductPrices (supplierId, variantId, price) VALUES (@s, @v, 0)', { s: [h.sql.Int, cat.supplierId], v: [h.sql.Int, variantId] }), (e) => e.number === 547, 'CK_SPP_Price');
  await assert.rejects(h.query('UPDATE dbo.PurchaseOrders SET createdBy = 999999999 WHERE id = @id', { id: [h.sql.Int, id] }), (e) => e.number === 547, 'FK_PO_CreatedBy');
});

test('SQL-03 decimal arithmetic is exact (no floating point)', async () => {
  const cat = await h.makeCatalog({ prices: [0.1, 0.2, 33333.33] });
  const res = await h.createPo(h.actors.manager.token, cat, [3, 3, 3]);
  assert.equal(res.status, 201);
  // 0.1*3 + 0.2*3 + 33333.33*3 = 0.30 + 0.60 + 99999.99 = 100000.89 (a JS float sum would give 100000.89000000001)
  assert.equal(res.body.data.totalAmount, 100000.89);
  const [{ total }] = await h.query('SELECT CONVERT(VARCHAR(30), totalAmount) AS total FROM dbo.PurchaseOrders WHERE id = @id', { id: [h.sql.Int, res.body.data.id] });
  assert.equal(total, '100000.89');
});
