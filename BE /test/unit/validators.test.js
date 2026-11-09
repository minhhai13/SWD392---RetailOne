// Unit tests (no database): input validators.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const po = require('../../src/modules/inventory-management/validators/purchaseOrder.validator');
const { parseVariantIdList } = require('../../src/modules/inventory-management/validators/supplier.validator');
const { parseLoginInput } = require('../../src/modules/auth/validators/auth.validator');
const { parseIntId, fromDbId } = require('../../src/utils/ids');

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code;
  }
  return null;
};

test('V-01 parseCreateInput accepts a valid payload and ignores forbidden client fields', () => {
  const out = po.parseCreateInput({ supplierId: '3', note: ' n ', status: 'APPROVED', totalAmount: 5, items: [{ variantId: 7, quantity: '2', costPrice: 1, note: '' }] });
  assert.deepEqual(out, { supplierId: 3, note: 'n', items: [{ variantId: 7, quantity: 2, note: null }] });
});

test('V-02 parseCreateInput rejects empty items, duplicates, bad quantities', () => {
  assert.equal(code(() => po.parseCreateInput({ supplierId: 1, items: [] })), 'EMPTY_ITEMS');
  assert.equal(code(() => po.parseCreateInput({ supplierId: 1, items: [{ variantId: 1, quantity: 1 }, { variantId: 1, quantity: 2 }] })), 'DUPLICATE_VARIANT');
  for (const q of [0, -1, 1.5, '1.5', 'x', null, undefined, true, 1e12]) {
    assert.equal(code(() => po.parseCreateInput({ supplierId: 1, items: [{ variantId: 1, quantity: q }] })), 'INVALID_QUANTITY', String(q));
  }
  assert.equal(code(() => po.parseCreateInput(null)), 'VALIDATION_ERROR');
  assert.equal(code(() => po.parseCreateInput({ items: [{ variantId: 1, quantity: 1 }] })), 'INVALID_ID');
  assert.equal(code(() => po.parseCreateInput({ supplierId: 1, items: [{ variantId: 1, quantity: 1, note: 'x'.repeat(501) }] })), 'VALIDATION_ERROR');
});

test('V-03 parseListQuery defaults, whitelist and validation', () => {
  const d = po.parseListQuery({});
  assert.deepEqual([d.sortBy, d.sortDir, d.page, d.pageSize, d.status, d.q], ['createdAt', 'desc', 1, 20, null, null]);
  assert.equal(po.parseListQuery({ status: 'approved' }).status, 'APPROVED');
  assert.equal(code(() => po.parseListQuery({ sortBy: 'createdAt; DROP TABLE x' })), 'INVALID_SORT');
  assert.equal(code(() => po.parseListQuery({ status: 'Draft' })), 'INVALID_STATUS');
  assert.equal(code(() => po.parseListQuery({ from: '2026-02-30' })), 'INVALID_DATE');
  assert.equal(code(() => po.parseListQuery({ from: '2026-05-02', to: '2026-05-01' })), 'INVALID_DATE_RANGE');
  assert.equal(code(() => po.parseListQuery({ pageSize: '1000' })), 'VALIDATION_ERROR');
  assert.equal(code(() => po.parseListQuery({ q: ['a', 'b'] })), 'VALIDATION_ERROR');
});

test('V-04 parseCancelInput trims and enforces 1..500 characters', () => {
  assert.equal(po.parseCancelInput({ reason: '  ok  ' }).reason, 'ok');
  assert.equal(code(() => po.parseCancelInput({ reason: '   ' })), 'REASON_REQUIRED');
  assert.equal(code(() => po.parseCancelInput(undefined)), 'REASON_REQUIRED');
  assert.equal(po.parseCancelInput({ reason: 'x'.repeat(500) }).reason.length, 500);
  assert.equal(code(() => po.parseCancelInput({ reason: 'x'.repeat(501) })), 'REASON_TOO_LONG');
});

test('V-05 Idempotency-Key header', () => {
  assert.equal(po.parseIdempotencyKey(undefined), null);
  assert.equal(po.parseIdempotencyKey('retry-key_12345'), 'retry-key_12345');
  for (const bad of ['short', 'has space 12345', 'x'.repeat(129), 'bad;key12345']) assert.equal(code(() => po.parseIdempotencyKey(bad)), 'INVALID_IDEMPOTENCY_KEY', bad);
});

test('V-06 UC22.1 variantIds list', () => {
  assert.deepEqual(parseVariantIdList('3,1,3, 2'), [3, 1, 2]);
  for (const bad of [undefined, '', ' ', '1,,2', '1,a', '0', '1.5', ['1', '2']]) assert.ok(code(() => parseVariantIdList(bad)), String(bad));
  assert.equal(code(() => parseVariantIdList(Array.from({ length: 201 }, (_, i) => i + 1).join(','))), 'TOO_MANY_ITEMS');
});

test('V-07 login input and id helpers', () => {
  assert.deepEqual(parseLoginInput({ username: ' bob ', password: 'x' }), { username: 'bob', password: 'x' });
  for (const bad of [null, {}, { username: 'a' }, { username: { $ne: '' }, password: 'x' }, { username: 'a'.repeat(51), password: 'x' }]) assert.equal(code(() => parseLoginInput(bad)), 'VALIDATION_ERROR');
  assert.equal(parseIntId('12'), 12);
  for (const bad of ['0', '-1', '1.5', 'abc', '', null, undefined, '2147483648', ' 1', '1e3']) assert.equal(code(() => parseIntId(bad)), 'INVALID_ID', String(bad));
  assert.equal(fromDbId('42'), 42);
  assert.equal(fromDbId(null), null);
  assert.equal(fromDbId('99999999999999999999'), '99999999999999999999');
});
