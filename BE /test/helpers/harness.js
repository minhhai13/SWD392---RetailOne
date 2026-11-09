/**
 * Integration-test harness: real Express app + real SQL Server test database (no DB mocking).
 * - Refuses to run unless DB_NAME ends with _TEST.
 * - Every test file creates its own uniquely-named users/suppliers/products and deletes them in teardown().
 * - Passwords are random per run (never hardcoded).
 */
process.env.NODE_ENV = 'test';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sql = require('mssql');
const { start, stop } = require('../../src/index');
const { getPool } = require('../../src/config/database');
const f = require('../../scripts/lib/fixtures');
const { bindList } = require('../../src/modules/inventory-management/repositories/inClause');
const { ensureRbac } = require('../../scripts/lib/rbac');

const RUN = crypto.randomBytes(3).toString('hex');
let counter = 0;
const uniq = (prefix) => `${prefix}${RUN}${(counter += 1)}`;

async function setup() {
  if (!/_TEST$/i.test(process.env.DB_NAME || '')) {
    throw new Error('Integration tests refuse to run: DB_NAME must end with _TEST. Run `npm run db:setup-test` first.');
  }
  const server = await start({ port: 0 });
  await ensureRbac(getPool()); // Roles / Features / RoleFeatures, as the seed script does (idempotent, non-destructive)
  const h = {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    pool: getPool(),
    sql,
    f,
    tracked: { userIds: [], staffIds: [], supplierIds: [], productIds: [], variantIds: [] },
    actors: {},
    passwords: {},
  };

  h.api = async (method, path, { token, body, headers } = {}) => {
    const res = await fetch(`${h.baseUrl}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch (_) {
      /* empty body */
    }
    return { status: res.status, body: json };
  };

  h.login = async (username, password) => h.api('POST', '/api/auth/login', { body: { username, password } });

  h.makeActor = async (key, roleName, extra = {}) => {
    const password = crypto.randomBytes(12).toString('hex');
    const actor = await f.createUser(h.pool, {
      username: uniq(`t_${key}_`).slice(0, 50),
      roleName,
      password,
      fullName: `Test ${key}`,
      phone: uniq('T'),
      ...extra,
    });
    h.tracked.userIds.push(actor.userId);
    h.tracked.staffIds.push(actor.staffId);
    h.passwords[actor.username] = password;
    const res = await h.login(actor.username, password);
    actor.token = res.body && res.body.data ? res.body.data.token : null;
    h.actors[key] = actor;
    return actor;
  };

  h.standardActors = async () => {
    await h.makeActor('manager', 'Manager');
    await h.makeActor('manager2', 'Manager');
    await h.makeActor('warehouse', 'Warehouse Staff');
    await h.makeActor('cashier', 'Cashier');
    return h.actors;
  };

  /** Signs a token for a user id (e.g. an already locked user) without going through login. */
  h.tokenFor = (userId, options = { expiresIn: '1h' }) => jwt.sign({ userId }, process.env.JWT_SECRET, { algorithm: 'HS256', ...options });

  /**
   * Supplier + products: each product gets one variant, an ACTIVE mapping and a supply price.
   * prices: array of unit prices (one product per entry).
   */
  h.makeCatalog = async ({ prices = [10000, 25000], supplierStatus = 'Active', supplierName } = {}) => {
    const name = supplierName || `Supplier ${uniq('S')}`;
    const supplierId = await f.createSupplier(h.pool, { name, taxId: uniq('TX'), phone: uniq('P'), address: 'Test Address 1', status: supplierStatus });
    h.tracked.supplierIds.push(supplierId);
    const products = [];
    for (const price of prices) {
      const productId = await f.createProduct(h.pool, { code: uniq('PRD'), name: `Product ${uniq('N')}` });
      const variantId = await f.createVariant(h.pool, { productId, unitName: 'pcs' });
      h.tracked.productIds.push(productId);
      h.tracked.variantIds.push(variantId);
      await f.mapProduct(h.pool, { productId, supplierId });
      await f.addPrice(h.pool, { supplierId, variantId, price });
      await f.setStock(h.pool, variantId, 7);
      products.push({ productId, variantId, price });
    }
    return { supplierId, supplierName: name, products };
  };

  h.createPo = async (token, catalog, quantities = [2, 3]) =>
    h.api('POST', '/api/inventory/purchase-orders', {
      token,
      body: { supplierId: catalog.supplierId, items: catalog.products.slice(0, quantities.length).map((p, i) => ({ variantId: p.variantId, quantity: quantities[i] })) },
    });

  h.query = async (text, params = {}) => {
    const req = h.pool.request();
    for (const [k, [type, value]] of Object.entries(params)) req.input(k, type, value);
    return (await req.query(text)).recordset;
  };
  h.poRow = async (id) => (await h.query('SELECT * FROM dbo.PurchaseOrders WHERE id = @id', { id: [sql.Int, id] }))[0];
  h.stockOf = async (variantIds) => {
    const req = h.pool.request();
    const list = bindList(req, 'v', sql.Int, variantIds);
    return (await req.query(`SELECT variantId, quantityOnHand FROM dbo.InventoryStocks WHERE variantId IN (${list}) ORDER BY variantId`)).recordset;
  };
  h.countPos = async () => (await h.query('SELECT COUNT(*) AS n FROM dbo.PurchaseOrders'))[0].n;

  /** Test-only raw PO insert to reach states the API cannot (RECEIVED). Honors every CHECK constraint. */
  h.insertPoRaw = async ({ catalog, status, createdBy, approvedBy = null, canceledBy = null }) => {
    const r = await h.pool
      .request()
      .input('supplierId', sql.Int, catalog.supplierId)
      .input('name', sql.NVarChar(255), catalog.supplierName)
      .input('status', sql.VarChar(20), status)
      .input('createdBy', sql.BigInt, createdBy)
      .input('approvedBy', sql.BigInt, approvedBy)
      .input('canceledBy', sql.BigInt, canceledBy).query(`
        INSERT INTO dbo.PurchaseOrders (supplierId, supplierName, supplierTaxId, supplierPhone, status, createdBy, approvedBy, approvedAt, canceledBy, canceledAt, cancelReason)
        OUTPUT INSERTED.id
        VALUES (@supplierId, @name, 'RAW', 'RAW', @status, @createdBy, @approvedBy, CASE WHEN @approvedBy IS NULL THEN NULL ELSE SYSDATETIME() END,
                @canceledBy, CASE WHEN @canceledBy IS NULL THEN NULL ELSE SYSDATETIME() END, CASE WHEN @canceledBy IS NULL THEN NULL ELSE N'raw' END)`);
    const id = r.recordset[0].id;
    const p = catalog.products[0];
    await h.pool.request().input('poId', sql.Int, id).input('v', sql.Int, p.variantId).query('INSERT INTO dbo.PurchaseOrderItems (poId, variantId, quantity, costPrice) VALUES (@poId, @v, 5, 100)');
    return id;
  };

  /** Test-only goods receipt row (what UC31 would create) so UC26's guard can be exercised. */
  h.insertGoodReceipt = async (poId, receivedBy, executor = h.pool) =>
    executor.request().input('poId', sql.Int, poId).input('by', sql.BigInt, receivedBy).query('INSERT INTO dbo.GoodReceipts (poId, receivedBy) VALUES (@poId, @by)');

  h.teardown = async () => {
    const t = h.tracked;
    const run = async (text, ids, extra = () => {}) => {
      if (!ids.length) return;
      const req = h.pool.request();
      extra(req);
      const list = bindList(req, 'i', text.type, ids);
      await req.query(text.sql.replace('{IN}', list));
    };
    const supplier = { type: sql.Int };
    await run({ ...supplier, sql: 'DELETE gri FROM dbo.GoodReceiptItems gri JOIN dbo.GoodReceipts gr ON gr.id = gri.receiptId JOIN dbo.PurchaseOrders po ON po.id = gr.poId WHERE po.supplierId IN ({IN})' }, t.supplierIds);
    await run({ ...supplier, sql: 'DELETE gr FROM dbo.GoodReceipts gr JOIN dbo.PurchaseOrders po ON po.id = gr.poId WHERE po.supplierId IN ({IN})' }, t.supplierIds);
    await run({ ...supplier, sql: 'DELETE FROM dbo.PurchaseOrders WHERE supplierId IN ({IN})' }, t.supplierIds);
    await run({ ...supplier, sql: 'DELETE FROM dbo.SupplierProductPrices WHERE supplierId IN ({IN})' }, t.supplierIds);
    await run({ ...supplier, sql: 'DELETE FROM dbo.ProductSuppliers WHERE supplierId IN ({IN})' }, t.supplierIds);
    await run({ type: sql.Int, sql: 'DELETE FROM dbo.InventoryStocks WHERE variantId IN ({IN})' }, t.variantIds);
    await run({ type: sql.Int, sql: 'DELETE FROM dbo.ProductVariants WHERE id IN ({IN})' }, t.variantIds);
    await run({ type: sql.BigInt, sql: 'DELETE FROM dbo.Products WHERE id IN ({IN})' }, t.productIds);
    await run({ ...supplier, sql: 'DELETE FROM dbo.Suppliers WHERE id IN ({IN})' }, t.supplierIds);
    await run({ type: sql.BigInt, sql: 'DELETE FROM dbo.Staff WHERE id IN ({IN})' }, t.staffIds);
    await run({ type: sql.Int, sql: 'DELETE FROM dbo.Users WHERE id IN ({IN})' }, t.userIds);
    await stop();
  };

  return h;
}

module.exports = { setup, uniq, RUN };
