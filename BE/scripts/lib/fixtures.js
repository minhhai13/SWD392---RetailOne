/**
 * Small parameterized INSERT helpers for the TEST database (used by integration tests and the dev seed script).
 * They only write the minimum rows UC22-UC26 depend on: Roles, Users, Staff, Suppliers, Products, ProductVariants,
 * ProductSuppliers, SupplierProductPrices, InventoryStocks. No schema change, no DDL.
 */
const bcrypt = require('bcryptjs');
const sql = require('mssql');

async function ensureRole(pool, name) {
  await pool.request().input('n', sql.NVarChar(50), name).query('IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE name = @n) INSERT INTO dbo.Roles (name) VALUES (@n)');
  const r = await pool.request().input('n', sql.NVarChar(50), name).query('SELECT id FROM dbo.Roles WHERE name = @n');
  return r.recordset[0].id;
}

async function createUser(pool, { username, roleName, password, fullName, phone, email = null, isActive = 'active', employmentStatus = 'working' }) {
  const roleId = await ensureRole(pool, roleName);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await pool
    .request()
    .input('roleId', sql.Int, roleId)
    .input('username', sql.VarChar(50), username)
    .input('hash', sql.VarChar(255), passwordHash)
    .input('isActive', sql.VarChar(20), isActive)
    .query(`INSERT INTO dbo.Users (roleId, username, passwordHash, isActive, requirePasswordChange)
            OUTPUT INSERTED.id VALUES (@roleId, @username, @hash, @isActive, 0)`);
  const userId = user.recordset[0].id;
  const staff = await pool
    .request()
    .input('userId', sql.Int, userId)
    .input('fullName', sql.NVarChar(100), fullName)
    .input('phone', sql.VarChar(20), phone)
    .input('email', sql.VarChar(100), email)
    .input('status', sql.VarChar(20), employmentStatus)
    .query(`INSERT INTO dbo.Staff (userId, fullName, phoneNumber, email, employmentStatus, resignationDate)
            OUTPUT INSERTED.id
            VALUES (@userId, @fullName, @phone, @email, @status, CASE WHEN @status = 'resigned' THEN CAST(SYSDATETIME() AS DATE) END)`);
  return { userId, staffId: Number(staff.recordset[0].id), username };
}

async function createSupplier(pool, { name, taxId, phone, status = 'Active', address = null }) {
  const r = await pool
    .request()
    .input('name', sql.NVarChar(255), name)
    .input('taxId', sql.VarChar(20), taxId)
    .input('phone', sql.VarChar(20), phone)
    .input('address', sql.NVarChar(255), address)
    .input('status', sql.VarChar(20), status)
    .query('INSERT INTO dbo.Suppliers (name, taxId, phoneNumber, address, status) OUTPUT INSERTED.id VALUES (@name, @taxId, @phone, @address, @status)');
  return r.recordset[0].id;
}

async function createProduct(pool, { code, name, baseUnit = 'pcs', status = 'Selling' }) {
  const r = await pool
    .request()
    .input('code', sql.VarChar(50), code)
    .input('name', sql.NVarChar(200), name)
    .input('baseUnit', sql.NVarChar(20), baseUnit)
    .input('status', sql.VarChar(20), status)
    .query('INSERT INTO dbo.Products (code, name, baseUnit, status) OUTPUT INSERTED.id VALUES (@code, @name, @baseUnit, @status)');
  return Number(r.recordset[0].id);
}

async function createVariant(pool, { productId, unitName = 'pcs', conversionFactor = 1, salePrice = 1000 }) {
  const r = await pool
    .request()
    .input('productId', sql.BigInt, productId)
    .input('unitName', sql.NVarChar(20), unitName)
    .input('factor', sql.Int, conversionFactor)
    .input('salePrice', sql.Decimal(15, 2), salePrice)
    .query('INSERT INTO dbo.ProductVariants (productId, unitName, conversionFactor, salePrice) OUTPUT INSERTED.id VALUES (@productId, @unitName, @factor, @salePrice)');
  return r.recordset[0].id;
}

async function mapProduct(pool, { productId, supplierId, status = 'ACTIVE' }) {
  await pool
    .request()
    .input('productId', sql.BigInt, productId)
    .input('supplierId', sql.Int, supplierId)
    .input('status', sql.VarChar(20), status)
    .query('INSERT INTO dbo.ProductSuppliers (productId, supplierId, status) VALUES (@productId, @supplierId, @status)');
}

/** createdAt is optional so tests can order price history explicitly (id is the tie-break). */
async function addPrice(pool, { supplierId, variantId, price, createdAt = null }) {
  const r = await pool
    .request()
    .input('supplierId', sql.Int, supplierId)
    .input('variantId', sql.Int, variantId)
    .input('price', sql.Decimal(15, 2), price)
    .input('createdAt', sql.DateTime2(7), createdAt)
    .query(`INSERT INTO dbo.SupplierProductPrices (supplierId, variantId, price, createdAt)
            OUTPUT INSERTED.id VALUES (@supplierId, @variantId, @price, COALESCE(@createdAt, SYSDATETIME()))`);
  return r.recordset[0].id;
}

async function setStock(pool, variantId, quantityOnHand) {
  await pool
    .request()
    .input('variantId', sql.Int, variantId)
    .input('qty', sql.Decimal(15, 3), quantityOnHand)
    .query(`MERGE dbo.InventoryStocks AS t USING (SELECT @variantId AS variantId) AS s ON t.variantId = s.variantId
            WHEN MATCHED THEN UPDATE SET quantityOnHand = @qty
            WHEN NOT MATCHED THEN INSERT (variantId, quantityOnHand) VALUES (@variantId, @qty);`);
}

/** Insert-if-missing (never overwrites an existing stock row). */
async function ensureStock(pool, variantId, quantityOnHand, minThreshold) {
  await pool
    .request()
    .input('variantId', sql.Int, variantId)
    .input('qty', sql.Decimal(15, 3), quantityOnHand)
    .input('min', sql.Decimal(15, 3), minThreshold)
    .query('IF NOT EXISTS (SELECT 1 FROM dbo.InventoryStocks WHERE variantId = @variantId) INSERT INTO dbo.InventoryStocks (variantId, quantityOnHand, minThreshold) VALUES (@variantId, @qty, @min)');
}

module.exports = { ensureStock, ensureRole, createUser, createSupplier, createProduct, createVariant, mapProduct, addPrice, setStock };
