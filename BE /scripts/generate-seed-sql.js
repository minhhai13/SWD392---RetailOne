/**
 * Generates two plain T-SQL files you can run yourself (SSMS / Azure Data Studio / sqlcmd) on ANY database name,
 * e.g. RetailOnePOS on your own SQL Server:
 *   generated/01-schema-no-drop.sql  - the reference schema WITHOUT the DROP/CREATE DATABASE header (run only on an EMPTY database)
 *   generated/02-seed-demo.sql       - idempotent demo data (roles/features/role-features, 3 demo accounts, suppliers, catalog, prices, stock, 4 POs)
 * Passwords are bcrypt-hashed here; the SQL contains only hashes. Passwords: SEED_*_PASSWORD env (>= 8 chars) or generated and printed once.
 *
 * Usage: node scripts/generate-seed-sql.js [DatabaseName]      (default: DB_NAME from .env without the _TEST suffix, else RetailOnePOS)
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ quiet: true });
const { resolvePasswords, DEMO_EMAIL_DOMAIN } = require('./lib/demoSeed');
const { PERMISSION_DESCRIPTIONS, ROLE_PERMISSIONS } = require('../src/constants/permissions');

const db = process.argv[2] || 'RetailOnePOS';
if (!/^[A-Za-z0-9_]+$/.test(db)) throw new Error('Database name may only contain letters, digits and underscore.');
const out = path.join(__dirname, '..', 'generated');
fs.mkdirSync(out, { recursive: true });
const q = (s) => `N'${String(s).replace(/'/g, "''")}'`;

// ---- 01 schema without DROP/CREATE DATABASE -------------------------------------------------------------------
const schemaFile = path.join(__dirname, '..', 'docs', 'reference', 'RetailOne_schema_mssql(4).sql');
const batches = fs.readFileSync(schemaFile, 'utf8').replace(/^﻿/, '').split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean)
  .filter((b) => !/^USE\s*\[/i.test(b) && !/DROP\s+DATABASE/i.test(b) && !/CREATE\s+DATABASE/i.test(b));
fs.writeFileSync(path.join(out, '01-schema-no-drop.sql'),
  `-- Generated from docs/reference/RetailOne_schema_mssql(4).sql WITHOUT the DROP/CREATE DATABASE header.\n-- Run ONLY on an empty database named [${db}] (it creates 42 tables and fails if they already exist).\nUSE [${db}];\nGO\n${batches.join('\nGO\n')}\nGO\n`);

// ---- 02 demo seed -------------------------------------------------------------------------------------------------
const pw = resolvePasswords();
const users = [
  ['manager', 'Manager', 'Demo Manager', '0900000001'],
  ['warehouse', 'Warehouse Staff', 'Demo Warehouse Staff', '0900000002'],
  ['cashier', 'Cashier', 'Demo Cashier', '0900000003'],
];
const staffOf = (u) => `(SELECT s.id FROM dbo.Staff s JOIN dbo.Users x ON x.id = s.userId WHERE x.username = '${u}')`;
const priceOf = (tax, code, unit) => `(SELECT TOP 1 spp.price FROM dbo.SupplierProductPrices spp JOIN dbo.Suppliers s ON s.id = spp.supplierId JOIN dbo.ProductVariants v ON v.id = spp.variantId JOIN dbo.Products p ON p.id = v.productId WHERE s.taxId = '${tax}' AND p.code = '${code}' AND v.unitName = ${q(unit)} ORDER BY spp.createdAt DESC, spp.id DESC)`;

const po = ({ tag, tax, by, daysAgo, status, approvedBy, canceledBy, reason, items }) => `
IF NOT EXISTS (SELECT 1 FROM dbo.PurchaseOrders WHERE note = N'DEMO-SEED:${tag}')
BEGIN
  INSERT INTO dbo.PurchaseOrders (supplierId, supplierName, supplierTaxId, supplierPhone, supplierAddress, status, note, createdBy, createdAt)
  SELECT s.id, s.name, s.taxId, s.phoneNumber, s.address, 'PENDING', N'DEMO-SEED:${tag}', ${staffOf(by)}, DATEADD(DAY, -${daysAgo}, SYSDATETIME())
  FROM dbo.Suppliers s WHERE s.taxId = '${tax}';
  DECLARE @po_${tag.replace(/-/g, '_')} INT = SCOPE_IDENTITY();
${items.map(([code, unit, qty]) => `  INSERT INTO dbo.PurchaseOrderItems (poId, variantId, quantity, costPrice)
  SELECT @po_${tag.replace(/-/g, '_')}, v.id, ${qty}, ${priceOf(tax, code, unit)} FROM dbo.ProductVariants v JOIN dbo.Products p ON p.id = v.productId WHERE p.code = '${code}' AND v.unitName = ${q(unit)};`).join('\n')}
  UPDATE dbo.PurchaseOrders SET totalAmount = (SELECT COALESCE(SUM(total), 0) FROM dbo.PurchaseOrderItems WHERE poId = @po_${tag.replace(/-/g, '_')}) WHERE id = @po_${tag.replace(/-/g, '_')};
${status !== 'PENDING' ? `  UPDATE dbo.PurchaseOrders SET status = 'APPROVED', approvedBy = ${staffOf(approvedBy)}, approvedAt = DATEADD(HOUR, 2, createdAt) WHERE id = @po_${tag.replace(/-/g, '_')};` : ''}
${status === 'CANCELED' ? `  UPDATE dbo.PurchaseOrders SET status = 'CANCELED', canceledBy = ${staffOf(canceledBy)}, canceledAt = DATEADD(HOUR, 5, createdAt), cancelReason = ${q(reason)} WHERE id = @po_${tag.replace(/-/g, '_')};` : ''}
END`;

const sqlText = `-- RetailOne demo seed (generated). IDEMPOTENT: only inserts what is missing; never updates/deletes; never drops anything.
-- Target database: [${db}]  (must already contain the 42-table schema).  Passwords are stored as bcrypt hashes only.
USE [${db}];
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRAN;

-- 1. RBAC: Roles / Features / RoleFeatures
INSERT INTO dbo.Features (featureKey, description)
SELECT v.k, v.d FROM (VALUES ${Object.entries(PERMISSION_DESCRIPTIONS).map(([k, d]) => `('${k}', ${q(d)})`).join(', ')}) v(k, d)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Features f WHERE f.featureKey = v.k);
INSERT INTO dbo.Roles (name)
SELECT v.n FROM (VALUES ${Object.keys(ROLE_PERMISSIONS).map((r) => `(${q(r)})`).join(', ')}) v(n)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.name = v.n);
INSERT INTO dbo.RoleFeatures (roleId, featureId)
SELECT r.id, f.id FROM (VALUES ${Object.entries(ROLE_PERMISSIONS).flatMap(([r, ks]) => ks.map((k) => `(${q(r)}, '${k}')`)).join(', ')}) m(role, feat)
JOIN dbo.Roles r ON r.name = m.role JOIN dbo.Features f ON f.featureKey = m.feat
WHERE NOT EXISTS (SELECT 1 FROM dbo.RoleFeatures x WHERE x.roleId = r.id AND x.featureId = f.id);

-- 2. Demo accounts (existing accounts are NOT modified)
${users.map(([u, role, full, phone]) => `IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE username = '${u}')
  INSERT INTO dbo.Users (roleId, username, passwordHash, isActive, requirePasswordChange)
  SELECT r.id, '${u}', '${bcrypt.hashSync(pw[u].password, 10)}', 'active', 0 FROM dbo.Roles r WHERE r.name = ${q(role)};
IF NOT EXISTS (SELECT 1 FROM dbo.Staff s JOIN dbo.Users x ON x.id = s.userId WHERE x.username = '${u}')
  INSERT INTO dbo.Staff (userId, fullName, phoneNumber, email)
  SELECT x.id, ${q(full)}, '${phone}', '${u}${DEMO_EMAIL_DOMAIN}' FROM dbo.Users x WHERE x.username = '${u}';`).join('\n')}

-- 3. Suppliers
INSERT INTO dbo.Suppliers (name, taxId, phoneNumber, address, status)
SELECT v.n, v.t, v.p, v.a, v.s FROM (VALUES
  (N'Demo Fresh Foods Co.', '0100000001', '0281000001', N'12 Nguyen Hue, District 1', 'Active'),
  (N'Demo Beverage Distribution', '0100000002', '0281000002', N'88 Le Loi, District 3', 'Active'),
  (N'Demo Legacy Supplier (inactive)', '0100000003', '0281000003', NULL, 'Inactive')) v(n, t, p, a, s)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Suppliers x WHERE x.taxId = v.t);

-- 4. Products and variants (units)
INSERT INTO dbo.Products (code, name, baseUnit, status)
SELECT v.c, v.n, v.u, v.s FROM (VALUES
  ('DEMO-RICE', N'Gạo ST25 5kg', N'bag', 'Selling'), ('DEMO-NOODLE', N'Mì gói Hảo Hảo', N'pack', 'Selling'),
  ('DEMO-TEA', N'Trà xanh không độ', N'bottle', 'Selling'), ('DEMO-WATER', N'Nước suối 500ml', N'bottle', 'Selling'),
  ('DEMO-MILK', N'Sữa tươi 1L', N'carton', 'Selling'), ('DEMO-OLD', N'Sản phẩm ngừng bán (demo)', N'pcs', 'StopSelling')) v(c, n, u, s)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Products p WHERE p.code = v.c);
INSERT INTO dbo.ProductVariants (productId, unitName, conversionFactor, salePrice)
SELECT p.id, v.u, v.f, v.sp FROM (VALUES
  ('DEMO-RICE', N'bag', 1, 120000), ('DEMO-NOODLE', N'pack', 1, 5000), ('DEMO-NOODLE', N'carton', 30, 140000),
  ('DEMO-TEA', N'bottle', 1, 12000), ('DEMO-WATER', N'bottle', 1, 6000), ('DEMO-WATER', N'case', 24, 130000),
  ('DEMO-MILK', N'carton', 1, 38000), ('DEMO-OLD', N'pcs', 1, 1000)) v(code, u, f, sp)
JOIN dbo.Products p ON p.code = v.code
WHERE NOT EXISTS (SELECT 1 FROM dbo.ProductVariants x WHERE x.productId = p.id AND x.unitName = v.u);

-- 5. Which supplier provides which product (ProductSuppliers.status uses ACTIVE/INACTIVE)
INSERT INTO dbo.ProductSuppliers (productId, supplierId)
SELECT p.id, s.id FROM (VALUES
  ('0100000001','DEMO-RICE'), ('0100000001','DEMO-NOODLE'), ('0100000001','DEMO-MILK'),
  ('0100000002','DEMO-TEA'), ('0100000002','DEMO-WATER'), ('0100000002','DEMO-MILK'), ('0100000003','DEMO-RICE')) m(tax, code)
JOIN dbo.Suppliers s ON s.taxId = m.tax JOIN dbo.Products p ON p.code = m.code
WHERE NOT EXISTS (SELECT 1 FROM dbo.ProductSuppliers x WHERE x.productId = p.id AND x.supplierId = s.id);

-- 6. Supply price history (append-only; the newest row is the current price; RICE has an older 92000 and a newer 95000)
INSERT INTO dbo.SupplierProductPrices (supplierId, variantId, price, createdAt)
SELECT s.id, v.id, m.price, DATEADD(DAY, -m.daysAgo, SYSDATETIME()) FROM (VALUES
  ('0100000001','DEMO-RICE',N'bag',92000,60), ('0100000001','DEMO-RICE',N'bag',95000,30),
  ('0100000001','DEMO-NOODLE',N'pack',3200,30), ('0100000001','DEMO-NOODLE',N'carton',90000,30), ('0100000001','DEMO-MILK',N'carton',30000,30),
  ('0100000002','DEMO-TEA',N'bottle',8500,30), ('0100000002','DEMO-WATER',N'bottle',3800,30), ('0100000002','DEMO-WATER',N'case',85000,30),
  ('0100000002','DEMO-MILK',N'carton',29500,30), ('0100000003','DEMO-RICE',N'bag',90000,30)) m(tax, code, unit, price, daysAgo)
JOIN dbo.Suppliers s ON s.taxId = m.tax JOIN dbo.Products p ON p.code = m.code JOIN dbo.ProductVariants v ON v.productId = p.id AND v.unitName = m.unit
WHERE NOT EXISTS (SELECT 1 FROM dbo.SupplierProductPrices x WHERE x.supplierId = s.id AND x.variantId = v.id AND x.price = m.price);

-- 7. Stock (read-only for UC22-UC26; several rows are at/below the minimum threshold = low-stock candidates for UC22.1)
INSERT INTO dbo.InventoryStocks (variantId, quantityOnHand, minThreshold)
SELECT v.id, m.qty, m.minT FROM (VALUES
  ('DEMO-RICE',N'bag',3,10), ('DEMO-NOODLE',N'pack',5,20), ('DEMO-NOODLE',N'carton',40,2), ('DEMO-TEA',N'bottle',50,10),
  ('DEMO-WATER',N'bottle',4,12), ('DEMO-WATER',N'case',10,2), ('DEMO-MILK',N'carton',2,8)) m(code, unit, qty, minT)
JOIN dbo.Products p ON p.code = m.code JOIN dbo.ProductVariants v ON v.productId = p.id AND v.unitName = m.unit
WHERE NOT EXISTS (SELECT 1 FROM dbo.InventoryStocks x WHERE x.variantId = v.id);

-- 8. Sample purchase orders (PENDING x2, APPROVED, CANCELED). poCode/total are computed columns: never inserted.
${po({ tag: 'PENDING-1', tax: '0100000001', by: 'warehouse', daysAgo: 1, status: 'PENDING', items: [['DEMO-RICE', 'bag', 10], ['DEMO-NOODLE', 'pack', 50]] })}
${po({ tag: 'PENDING-2', tax: '0100000002', by: 'manager', daysAgo: 0, status: 'PENDING', items: [['DEMO-TEA', 'bottle', 20], ['DEMO-WATER', 'bottle', 30]] })}
${po({ tag: 'APPROVED-1', tax: '0100000002', by: 'warehouse', daysAgo: 3, status: 'APPROVED', approvedBy: 'manager', items: [['DEMO-MILK', 'carton', 24], ['DEMO-WATER', 'case', 5]] })}
${po({ tag: 'CANCELED-1', tax: '0100000001', by: 'warehouse', daysAgo: 7, status: 'CANCELED', approvedBy: 'manager', canceledBy: 'manager', reason: 'Demo: supplier could not deliver in time', items: [['DEMO-MILK', 'carton', 12]] })}

COMMIT;
PRINT 'RetailOne demo seed finished.';
`;
fs.writeFileSync(path.join(out, '02-seed-demo.sql'), sqlText);

console.log(`Generated generated/01-schema-no-drop.sql and generated/02-seed-demo.sql for database [${db}].`);
console.log('Demo account passwords (shown once; the SQL contains only bcrypt hashes):');
for (const u of users) console.log(`  ${u[0]} / ${pw[u[0]].password}${pw[u[0]].generated ? '  (generated)' : '  (from .env)'}`);
