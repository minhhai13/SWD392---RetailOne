// Unit tests (no database): entity models and DTO mapping.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../../src/shared/models/index');
const { parseType, col, defineModel } = require('../../src/shared/models/base.model');
const dto = require('../../src/modules/inventory-management/dtos/purchaseOrder.dto');
const supplierDto = require('../../src/modules/inventory-management/dtos/supplier.dto');
const { LIMITS } = require('../../src/constants/purchaseOrder');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../../src/constants/permissions');
const { ROLES } = require('../../src/constants/roles');
const { MAX_CANCEL_REASON, MAX_ITEM_NOTE } = require('../../src/modules/inventory-management/validators/purchaseOrder.validator');

test('M-01 one model per entity used by UC22-UC26, no models for unrelated modules', () => {
  assert.deepEqual(Object.keys(models).sort(), ['Feature', 'GoodReceipt', 'InventoryStock', 'Product', 'ProductSupplier', 'ProductVariant', 'PurchaseOrder', 'PurchaseOrderItem', 'Role', 'RoleFeature', 'Staff', 'Supplier', 'SupplierProductPrice', 'User']);
  for (const m of Object.values(models)) {
    assert.ok(m.table && m.primaryKey.length && m.columnNames().length, m.name);
    assert.equal(typeof m.hydrate, 'function');
    assert.ok(!('find' in m) && !('create' in m) && !('update' in m), `${m.name} must not contain data-access methods`);
  }
});

test('M-02 computed and IDENTITY columns are read-only', () => {
  const { PurchaseOrder: po, PurchaseOrderItem: poi, GoodReceipt: gr } = models;
  assert.deepEqual(po.readOnlyColumns().sort(), ['id', 'poCode']);
  assert.deepEqual(poi.readOnlyColumns().sort(), ['id', 'receivedTotal', 'total']);
  assert.deepEqual(gr.readOnlyColumns().sort(), ['id', 'receiptCode']);
  for (const c of ['poCode', 'total', 'receivedTotal', 'id']) {
    assert.equal(po.isWritable(c) || poi.isWritable(c), false, c);
  }
  assert.ok(po.isWritable('status') && po.isWritable('cancelReason') && poi.isWritable('costPrice'));
  assert.equal(po.isWritable('nope'), false);
});

test('M-03 types follow the schema: Users.id INT vs Staff.id BIGINT, DECIMAL precisions, DATETIME2, BIT', () => {
  assert.equal(models.User.columns.id.type, 'int');
  assert.equal(models.Staff.columns.id.type, 'bigint');
  assert.equal(models.PurchaseOrder.columns.createdBy.type, 'bigint');
  assert.equal(models.PurchaseOrder.columns.totalAmount.type, 'decimal(18,2)');
  assert.equal(models.PurchaseOrderItem.columns.quantity.type, 'decimal(15,3)');
  assert.equal(models.PurchaseOrderItem.columns.costPrice.type, 'decimal(15,2)');
  assert.equal(models.PurchaseOrder.columns.createdAt.type, 'datetime2(7)');
  assert.equal(models.Product.columns.allowDecimalQuantity.type, 'bit');
  assert.equal(models.PurchaseOrder.columns.approvedBy.nullable, true);
  assert.equal(models.PurchaseOrder.columns.createdBy.nullable, false);
  assert.deepEqual(models.RoleFeature.primaryKey, ['roleId', 'featureId']);
  assert.deepEqual(models.ProductSupplier.primaryKey, ['productId', 'supplierId']);
});

test('M-04 parseType / defineModel / hydrate / maxLength', () => {
  assert.deepEqual(parseType('decimal(15,2)'), { base: 'decimal', precision: 15, scale: 2 });
  assert.deepEqual(parseType('nvarchar(max)'), { base: 'nvarchar', length: null });
  assert.deepEqual(parseType('datetime2(7)'), { base: 'datetime2', scale: 7 });
  assert.throws(() => parseType('nvarchar(('));
  assert.throws(() => defineModel({ name: 'X', table: 'X', primaryKey: ['nope'], columns: { a: col('int') } }));
  assert.deepEqual(models.Staff.hydrate({ id: '12', userId: 3, extra: '9' }), { id: 12, userId: 3, extra: '9' });
  assert.equal(models.Staff.hydrate(null), null);
  assert.equal(models.PurchaseOrder.maxLength('cancelReason'), 500);
  assert.equal(models.PurchaseOrder.maxLength('note'), null); // NVARCHAR(MAX)
  assert.equal(models.PurchaseOrder.maxLength('totalAmount'), null);
});

test('M-05 API limits match the schema column sizes', () => {
  assert.equal(MAX_CANCEL_REASON, 500);
  assert.equal(MAX_ITEM_NOTE, 500);
  assert.equal(LIMITS.MAX_CANCEL_REASON, models.PurchaseOrder.maxLength('cancelReason'));
  assert.equal(LIMITS.MAX_ITEM_NOTE, models.PurchaseOrderItem.maxLength('note'));
});

test('D-01 availableActions come from permission keys, status and receipt', () => {
  const a = dto.computeAvailableActions;
  const mgr = ROLE_PERMISSIONS[ROLES.MANAGER];
  const wh = ROLE_PERMISSIONS[ROLES.WAREHOUSE_STAFF];
  assert.deepEqual(a(mgr, 'PENDING', false), ['APPROVE', 'CANCEL']);
  assert.deepEqual(a(mgr, 'APPROVED', false), ['CANCEL']);
  assert.deepEqual(a(mgr, 'APPROVED', true), []);
  assert.deepEqual(a(mgr, 'CANCELED', false), []);
  assert.deepEqual(a(mgr, 'RECEIVED', false), []);
  assert.deepEqual(a(wh, 'PENDING', false), []);
  assert.deepEqual(a([PERMISSIONS.CANCEL_PURCHASE_ORDER], 'PENDING', false), ['CANCEL']);
  assert.deepEqual(a([], 'PENDING', false), []);
});

test('D-02 toSummaryDto / toDetailDto convert BIGINT ids, keep snapshots and order the timeline', () => {
  const header = {
    id: 5, poCode: 'PO-000005', status: 'CANCELED', totalAmount: 100, note: null, supplierId: 2, supplierName: 'S', supplierTaxId: 'T', supplierPhone: 'P', supplierAddress: null,
    createdBy: '11', createdByName: 'Cre', createdAt: new Date('2026-01-01T00:00:00Z'), approvedBy: '12', approvedByName: 'App', approvedAt: new Date('2026-01-02T00:00:00Z'),
    canceledBy: '12', canceledByName: 'App', canceledAt: new Date('2026-01-03T00:00:00Z'), cancelReason: 'why',
  };
  const s = dto.toSummaryDto({ ...header, itemCount: 2 });
  assert.deepEqual([s.createdBy, s.createdByName, s.supplierName, s.itemCount], [11, 'Cre', 'S', 2]);
  const d = dto.toDetailDto({ header, items: [{ id: 1, variantId: 3, productId: '9', productCode: 'c', productName: 'n', unitName: 'u', conversionFactor: 1, quantity: 2, costPrice: 50, total: 100, receivedQuantity: 0, note: null }], receipt: null }, ROLE_PERMISSIONS[ROLES.MANAGER]);
  assert.equal(d.createdBy.staffId, 11);
  assert.equal(d.items[0].productId, 9);
  assert.deepEqual(d.timeline.map((t) => t.event), ['CREATED', 'APPROVED', 'CANCELED']);
  assert.equal(d.timeline[2].reason, 'why');
  assert.deepEqual(d.availableActions, []);
  assert.equal('poCode' in d && d.poCode, 'PO-000005');
});

test('D-03 supplier DTOs for UC22.1', () => {
  const row = { id: 1, name: 'A', taxId: 't', phoneNumber: 'p', address: null, status: 'Active' };
  const c = supplierDto.toSupplierCandidateDto(row, [{ variantId: 1, supplyPrice: 10 }], [2]);
  assert.deepEqual([c.coversAll, c.coveredVariantIds, c.missingVariantIds], [false, [1], [2]]);
  assert.equal(supplierDto.toSupplierCandidateDto(row, [{ variantId: 1, supplyPrice: 10 }], []).coversAll, true);
  assert.equal(supplierDto.toSelectedVariantDto({ variantId: 1, productId: '5', productCode: 'c', productName: 'n', unitName: 'u', productStatus: 'Selling' }).stock, null);
});

test('R-01 exactly the three agreed roles; permission mapping per the agreed matrix', () => {
  assert.deepEqual(Object.values(ROLES), ['Manager', 'Warehouse Staff', 'Cashier']);
  assert.deepEqual([...ROLE_PERMISSIONS.Manager].sort(), Object.values(PERMISSIONS).sort());
  assert.deepEqual([...ROLE_PERMISSIONS['Warehouse Staff']].sort(), ['CREATE_PURCHASE_ORDER', 'VIEW_PURCHASE_ORDER']);
  assert.deepEqual(ROLE_PERMISSIONS.Cashier, []);
});
