/**
 * Demo / local-development data for UC22-UC26 and the demo-password reset.
 * - Idempotent: every row is looked up by its natural key first; running it again creates nothing new.
 * - Never deletes or updates existing data; never touches computed/IDENTITY columns; never drops anything.
 * - Passwords are hashed with bcrypt and come from the environment (or are generated) - nothing is hardcoded.
 * - Demo accounts are recognisable by Staff.email ending with DEMO_EMAIL_DOMAIN; only those can be reset.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sql = require('mssql');
const f = require('./fixtures');
const { ensureRbac } = require('./rbac');
const { ROLES } = require('../../src/constants/roles');

const DEMO_EMAIL_DOMAIN = '@demo.retailone.local';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

const DEMO_USERS = [
  { username: 'manager', roleName: ROLES.MANAGER, fullName: 'Demo Manager', phone: '0900000001', env: 'SEED_MANAGER_PASSWORD' },
  { username: 'warehouse', roleName: ROLES.WAREHOUSE_STAFF, fullName: 'Demo Warehouse Staff', phone: '0900000002', env: 'SEED_WAREHOUSE_PASSWORD' },
  { username: 'cashier', roleName: ROLES.CASHIER, fullName: 'Demo Cashier', phone: '0900000003', env: 'SEED_CASHIER_PASSWORD' },
];

/** Refuse to touch anything that is not a local *_TEST database (seed and password reset share this guard). */
function assertSafeTarget(config, env = process.env) {
  if (!/^[A-Za-z0-9_]+_TEST$/i.test(config.database || '')) {
    throw new Error('Refusing to run: DB_NAME must end with _TEST (demo data is for local test databases only).');
  }
  if (!LOCAL_HOSTS.includes(String(config.server).toLowerCase()) && env.ALLOW_REMOTE_DEMO_DB !== 'true') {
    throw new Error('Refusing to run: DB_SERVER must be localhost/127.0.0.1 (set ALLOW_REMOTE_DEMO_DB=true only for a disposable remote test DB).');
  }
}

/** Passwords for the demo users: from env when set (min 8 chars), otherwise generated randomly. */
function resolvePasswords(env = process.env) {
  const out = {};
  for (const u of DEMO_USERS) {
    const fromEnv = env[u.env];
    if (fromEnv !== undefined && fromEnv.length < 8) throw new Error(`${u.env} must be at least 8 characters.`);
    out[u.username] = { password: fromEnv || crypto.randomBytes(9).toString('base64url'), generated: !fromEnv };
  }
  return out;
}

const one = async (pool, query, params = {}) => {
  const req = pool.request();
  for (const [k, [type, value]] of Object.entries(params)) req.input(k, type, value);
  return (await req.query(query)).recordset[0] || null;
};

async function ensureSupplier(pool, s) {
  const row = await one(pool, 'SELECT id FROM dbo.Suppliers WHERE taxId = @t', { t: [sql.VarChar(20), s.taxId] });
  return row ? row.id : f.createSupplier(pool, s);
}

async function ensureProduct(pool, p) {
  const row = await one(pool, 'SELECT id FROM dbo.Products WHERE code = @c', { c: [sql.VarChar(50), p.code] });
  const productId = row ? Number(row.id) : await f.createProduct(pool, p);
  const variantIds = [];
  for (const v of p.variants) {
    const existing = await one(pool, 'SELECT id FROM dbo.ProductVariants WHERE productId = @p AND unitName = @u', { p: [sql.BigInt, productId], u: [sql.NVarChar(20), v.unitName] });
    variantIds.push(existing ? existing.id : await f.createVariant(pool, { productId, ...v }));
  }
  return { productId, variantIds };
}

async function ensureMapping(pool, supplierId, productId, variantIds, prices) {
  const m = await one(pool, 'SELECT 1 AS x FROM dbo.ProductSuppliers WHERE productId = @p AND supplierId = @s', { p: [sql.BigInt, productId], s: [sql.Int, supplierId] });
  if (!m) await f.mapProduct(pool, { productId, supplierId });
  for (let i = 0; i < variantIds.length; i += 1) {
    const has = await one(pool, 'SELECT 1 AS x FROM dbo.SupplierProductPrices WHERE supplierId = @s AND variantId = @v', { s: [sql.Int, supplierId], v: [sql.Int, variantIds[i]] });
    if (has) continue;
    const history = Array.isArray(prices[i]) ? prices[i] : [prices[i]]; // oldest first; the last row is the current price
    for (let h = 0; h < history.length; h += 1) {
      await f.addPrice(pool, { supplierId, variantId: variantIds[i], price: history[h], createdAt: new Date(Date.now() - (history.length - h) * 30 * 24 * 3600 * 1000) });
    }
  }
}

/** One demo PO inside a single transaction; price = latest supply price (SQL); computed columns are never written. */
async function ensureDemoPo(pool, po) {
  const marker = `DEMO-SEED:${po.tag}`;
  if (await one(pool, 'SELECT 1 AS x FROM dbo.PurchaseOrders WHERE note = @n', { n: [sql.NVarChar(sql.MAX), marker] })) return false;
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const header = await new sql.Request(tx)
      .input('s', sql.Int, po.supplierId).input('note', sql.NVarChar(sql.MAX), marker).input('by', sql.BigInt, po.createdBy).input('daysAgo', sql.Int, po.daysAgo)
      .query(`INSERT INTO dbo.PurchaseOrders (supplierId, supplierName, supplierTaxId, supplierPhone, supplierAddress, status, note, createdBy, createdAt)
              OUTPUT INSERTED.id
              SELECT s.id, s.name, s.taxId, s.phoneNumber, s.address, 'PENDING', @note, @by, DATEADD(DAY, -@daysAgo, SYSDATETIME())
              FROM dbo.Suppliers s WHERE s.id = @s`);
    const poId = header.recordset[0].id;
    for (const item of po.items) {
      await new sql.Request(tx).input('po', sql.Int, poId).input('s', sql.Int, po.supplierId).input('v', sql.Int, item.variantId).input('q', sql.Decimal(15, 3), item.quantity)
        .query(`INSERT INTO dbo.PurchaseOrderItems (poId, variantId, quantity, costPrice)
                SELECT @po, @v, @q, (SELECT TOP 1 price FROM dbo.SupplierProductPrices WHERE supplierId = @s AND variantId = @v ORDER BY createdAt DESC, id DESC)`);
    }
    await new sql.Request(tx).input('po', sql.Int, poId)
      .query('UPDATE dbo.PurchaseOrders SET totalAmount = (SELECT COALESCE(SUM(total), 0) FROM dbo.PurchaseOrderItems WHERE poId = @po) WHERE id = @po');
    if (po.status === 'APPROVED' || po.status === 'CANCELED') {
      await new sql.Request(tx).input('po', sql.Int, poId).input('by', sql.BigInt, po.approvedBy)
        .query("UPDATE dbo.PurchaseOrders SET status = 'APPROVED', approvedBy = @by, approvedAt = DATEADD(HOUR, 2, createdAt) WHERE id = @po");
    }
    if (po.status === 'CANCELED') {
      await new sql.Request(tx).input('po', sql.Int, poId).input('by', sql.BigInt, po.canceledBy).input('reason', sql.NVarChar(500), po.reason)
        .query("UPDATE dbo.PurchaseOrders SET status = 'CANCELED', canceledBy = @by, canceledAt = DATEADD(HOUR, 5, createdAt), cancelReason = @reason WHERE id = @po");
    }
    await tx.commit();
    return true;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/** Creates roles/features/mappings, the three demo accounts, suppliers, products, prices, stock and sample POs. */
async function seedDemo(pool, passwords) {
  const created = { users: [], suppliers: 0, purchaseOrders: 0 };
  await ensureRbac(pool);

  const staff = {};
  for (const u of DEMO_USERS) {
    const row = await one(pool, 'SELECT u.id AS userId, s.id AS staffId FROM dbo.Users u LEFT JOIN dbo.Staff s ON s.userId = u.id WHERE u.username = @u', { u: [sql.VarChar(50), u.username] });
    if (row) {
      staff[u.username] = Number(row.staffId);
      continue; // existing account: password is NEVER changed by seeding
    }
    const made = await f.createUser(pool, { username: u.username, roleName: u.roleName, password: passwords[u.username].password, fullName: u.fullName, phone: u.phone, email: `${u.username}${DEMO_EMAIL_DOMAIN}` });
    staff[u.username] = made.staffId;
    created.users.push({ username: u.username, password: passwords[u.username].password, generated: passwords[u.username].generated });
  }

  const before = (await one(pool, 'SELECT COUNT(*) AS n FROM dbo.Suppliers')).n;
  const fresh = await ensureSupplier(pool, { name: 'Demo Fresh Foods Co.', taxId: '0100000001', phone: '0281000001', address: '12 Nguyen Hue, District 1' });
  const drinks = await ensureSupplier(pool, { name: 'Demo Beverage Distribution', taxId: '0100000002', phone: '0281000002', address: '88 Le Loi, District 3' });
  const legacy = await ensureSupplier(pool, { name: 'Demo Legacy Supplier (inactive)', taxId: '0100000003', phone: '0281000003', status: 'Inactive' });
  created.suppliers = (await one(pool, 'SELECT COUNT(*) AS n FROM dbo.Suppliers')).n - before;

  const rice = await ensureProduct(pool, { code: 'DEMO-RICE', name: 'Gạo ST25 5kg', baseUnit: 'bag', variants: [{ unitName: 'bag', salePrice: 120000 }] });
  const noodle = await ensureProduct(pool, { code: 'DEMO-NOODLE', name: 'Mì gói Hảo Hảo', baseUnit: 'pack', variants: [{ unitName: 'pack', salePrice: 5000 }, { unitName: 'carton', conversionFactor: 30, salePrice: 140000 }] });
  const tea = await ensureProduct(pool, { code: 'DEMO-TEA', name: 'Trà xanh không độ', baseUnit: 'bottle', variants: [{ unitName: 'bottle', salePrice: 12000 }] });
  const water = await ensureProduct(pool, { code: 'DEMO-WATER', name: 'Nước suối 500ml', baseUnit: 'bottle', variants: [{ unitName: 'bottle', salePrice: 6000 }, { unitName: 'case', conversionFactor: 24, salePrice: 130000 }] });
  const milk = await ensureProduct(pool, { code: 'DEMO-MILK', name: 'Sữa tươi 1L', baseUnit: 'carton', variants: [{ unitName: 'carton', salePrice: 38000 }] });
  await ensureProduct(pool, { code: 'DEMO-OLD', name: 'Sản phẩm ngừng bán (demo)', baseUnit: 'pcs', status: 'StopSelling', variants: [{ unitName: 'pcs', salePrice: 1000 }] });

  await ensureMapping(pool, fresh, rice.productId, rice.variantIds, [[92000, 95000]]); // two price rows: the newest wins
  await ensureMapping(pool, fresh, noodle.productId, noodle.variantIds, [3200, 90000]);
  await ensureMapping(pool, fresh, milk.productId, milk.variantIds, [30000]);
  await ensureMapping(pool, drinks, tea.productId, tea.variantIds, [8500]);
  await ensureMapping(pool, drinks, water.productId, water.variantIds, [3800, 85000]);
  await ensureMapping(pool, drinks, milk.productId, milk.variantIds, [29500]); // MILK has two suppliers (UC22.1 demo)
  await ensureMapping(pool, legacy, rice.productId, rice.variantIds, [90000]); // inactive supplier

  // low-stock candidates for UC22.1 (quantityOnHand <= minThreshold)
  await f.ensureStock(pool, rice.variantIds[0], 3, 10);
  await f.ensureStock(pool, noodle.variantIds[0], 5, 20);
  await f.ensureStock(pool, noodle.variantIds[1], 40, 2);
  await f.ensureStock(pool, tea.variantIds[0], 50, 10);
  await f.ensureStock(pool, water.variantIds[0], 4, 12);
  await f.ensureStock(pool, water.variantIds[1], 10, 2);
  await f.ensureStock(pool, milk.variantIds[0], 2, 8);

  const wh = staff.warehouse;
  const mg = staff.manager;
  const pos = [
    { tag: 'PENDING-1', supplierId: fresh, createdBy: wh, daysAgo: 1, status: 'PENDING', items: [{ variantId: rice.variantIds[0], quantity: 10 }, { variantId: noodle.variantIds[0], quantity: 50 }] },
    { tag: 'PENDING-2', supplierId: drinks, createdBy: mg, daysAgo: 0, status: 'PENDING', items: [{ variantId: tea.variantIds[0], quantity: 20 }, { variantId: water.variantIds[0], quantity: 30 }] },
    { tag: 'APPROVED-1', supplierId: drinks, createdBy: wh, daysAgo: 3, status: 'APPROVED', approvedBy: mg, items: [{ variantId: milk.variantIds[0], quantity: 24 }, { variantId: water.variantIds[1], quantity: 5 }] },
    { tag: 'CANCELED-1', supplierId: fresh, createdBy: wh, daysAgo: 7, status: 'CANCELED', approvedBy: mg, canceledBy: mg, reason: 'Demo: supplier could not deliver in time', items: [{ variantId: milk.variantIds[0], quantity: 12 }] },
  ];
  for (const po of pos) if (await ensureDemoPo(pool, po)) created.purchaseOrders += 1;
  return created;
}

/**
 * Resets the password of DEMO accounts only (Staff.email ends with DEMO_EMAIL_DOMAIN). Any other account - even one that
 * has the same username - is reported as skipped and left untouched.
 */
async function resetDemoPasswords(pool, passwords, usernames = DEMO_USERS.map((u) => u.username)) {
  const result = { reset: [], skipped: [] };
  for (const username of usernames) {
    const row = await one(pool, 'SELECT u.id, s.email FROM dbo.Users u LEFT JOIN dbo.Staff s ON s.userId = u.id WHERE u.username = @u', { u: [sql.VarChar(50), username] });
    if (!row) { result.skipped.push({ username, reason: 'not found' }); continue; }
    if (!row.email || !row.email.toLowerCase().endsWith(DEMO_EMAIL_DOMAIN)) { result.skipped.push({ username, reason: 'not a demo account' }); continue; }
    if (!passwords[username]) { result.skipped.push({ username, reason: 'no password supplied' }); continue; }
    const hash = await bcrypt.hash(passwords[username].password, 10);
    await pool.request().input('id', sql.Int, row.id).input('h', sql.VarChar(255), hash).query('UPDATE dbo.Users SET passwordHash = @h, requirePasswordChange = 0 WHERE id = @id');
    result.reset.push({ username, password: passwords[username].password, generated: passwords[username].generated });
  }
  return result;
}

module.exports = { DEMO_EMAIL_DOMAIN, DEMO_USERS, assertSafeTarget, resolvePasswords, seedDemo, resetDemoPasswords };
