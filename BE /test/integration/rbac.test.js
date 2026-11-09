// RBAC through Roles / Features / RoleFeatures (no hardcoded role ids, no role-name checks in the request path).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/harness');
const { ROLE_PERMISSIONS, PERMISSIONS } = require('../../src/constants/permissions');

let h;
let cat;
const PO = '/api/inventory/purchase-orders';
before(async () => {
  h = await setup();
  await h.standardActors();
  cat = await h.makeCatalog({ prices: [100, 200] });
});
after(() => h.teardown());

const rolePermissionsInDb = async (roleName) =>
  (await h.query('SELECT f.featureKey FROM dbo.RoleFeatures rf JOIN dbo.Roles r ON r.id = rf.roleId JOIN dbo.Features f ON f.id = rf.featureId WHERE r.name = @n ORDER BY f.featureKey', { n: [h.sql.NVarChar(50), roleName] })).map((r) => r.featureKey);

test('RBAC-01 Roles / Features / RoleFeatures hold exactly the agreed mapping', async () => {
  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) assert.deepEqual(await rolePermissionsInDb(role), [...keys].sort(), role);
  const roles = (await h.query("SELECT name FROM dbo.Roles WHERE name IN ('Manager','Warehouse Staff','Cashier')")).map((r) => r.name);
  assert.equal(roles.length, 3);
  const features = (await h.query('SELECT featureKey FROM dbo.Features')).map((r) => r.featureKey);
  for (const key of Object.values(PERMISSIONS)) assert.ok(features.includes(key), key);
});

test('RBAC-02 access matrix for UC22-UC26 and their lookups (Manager / Warehouse Staff / Cashier)', async () => {
  const mk = async (actor) => (await h.createPo(actor.token, cat, [1])).body.data.id;
  const poForManager = await mk(h.actors.manager);
  const call = (actor, id) => ({
    suppliers: h.api('GET', '/api/inventory/suppliers', { token: actor.token }),
    byVariants: h.api('GET', `/api/inventory/suppliers/by-variants?variantIds=${cat.products[0].variantId}`, { token: actor.token }),
    catalog: h.api('GET', `/api/inventory/suppliers/${cat.supplierId}/products`, { token: actor.token }),
    list: h.api('GET', PO, { token: actor.token }),
    detail: h.api('GET', `${PO}/${id}`, { token: actor.token }),
    approve: h.api('PATCH', `${PO}/${id}/approve`, { token: actor.token, body: {} }),
    cancel: h.api('PATCH', `${PO}/${id}/cancel`, { token: actor.token, body: { reason: 'matrix' } }),
  });
  const statuses = async (actor, id) => Object.fromEntries(await Promise.all(Object.entries(call(actor, id)).map(async ([k, p]) => [k, (await p).status])));

  // Cashier: everything denied (BR-02)
  const cashier = await statuses(h.actors.cashier, poForManager);
  for (const [k, s] of Object.entries(cashier)) assert.equal(s, 403, `cashier ${k}`);
  // Warehouse Staff: create/view + lookups allowed, approve/cancel denied
  const warehouse = await statuses(h.actors.warehouse, poForManager);
  assert.deepEqual(warehouse, { suppliers: 200, byVariants: 200, catalog: 200, list: 200, detail: 200, approve: 403, cancel: 403 });
  assert.equal((await mk(h.actors.warehouse)) > 0, true); // UC22 allowed
  // Manager: everything allowed (approve first, then cancel an approved PO)
  const mgrId = await mk(h.actors.manager);
  assert.equal((await h.api('PATCH', `${PO}/${mgrId}/approve`, { token: h.actors.manager.token })).status, 200);
  assert.equal((await h.api('PATCH', `${PO}/${mgrId}/cancel`, { token: h.actors.manager.token, body: { reason: 'm' } })).status, 200);
  // the PO is CANCELED now: permission passes for the Manager, so approve/cancel fail on STATE (409), never on permission (403)
  assert.deepEqual(await statuses(h.actors.manager, mgrId), { suppliers: 200, byVariants: 200, catalog: 200, list: 200, detail: 200, approve: 409, cancel: 409 });
  assert.equal((await h.createPo(h.actors.manager.token, cat, [1])).status, 201);
  assert.equal((await h.poRow(poForManager)).status, 'PENDING', 'denied callers changed nothing');
});

test('RBAC-03 login and /auth/me expose the permission keys of the role', async () => {
  for (const [key, role] of [['manager', 'Manager'], ['warehouse', 'Warehouse Staff'], ['cashier', 'Cashier']]) {
    const me = await h.api('GET', '/api/auth/me', { token: h.actors[key].token });
    assert.equal(me.body.data.role.name, role);
    assert.deepEqual(me.body.data.permissions, [...ROLE_PERMISSIONS[role]].sort());
  }
});

test('RBAC-04 RoleFeatures is the source of truth: changing the mapping changes access immediately', async () => {
  const roleId = async (name) => (await h.query('SELECT id FROM dbo.Roles WHERE name = @n', { n: [h.sql.NVarChar(50), name] }))[0].id;
  const featureId = async (key) => (await h.query('SELECT id FROM dbo.Features WHERE featureKey = @k', { k: [h.sql.VarChar(100), key] }))[0].id;
  const [mgr, wh] = [await roleId('Manager'), await roleId('Warehouse Staff')];
  const [approve, cancel] = [await featureId('APPROVE_PURCHASE_ORDER'), await featureId('CANCEL_PURCHASE_ORDER')];
  const set = (roleIdValue, featureIdValue) => ({ r: [h.sql.Int, roleIdValue], f: [h.sql.Int, featureIdValue] });
  const poId = (await h.createPo(h.actors.manager.token, cat, [1])).body.data.id;

  try {
    await h.query('DELETE FROM dbo.RoleFeatures WHERE roleId = @r AND featureId = @f', set(mgr, approve));
    assert.equal((await h.api('PATCH', `${PO}/${poId}/approve`, { token: h.actors.manager.token })).status, 403);
    const detail = await h.api('GET', `${PO}/${poId}`, { token: h.actors.manager.token });
    assert.deepEqual(detail.body.data.availableActions, ['CANCEL']);
    await h.query('INSERT INTO dbo.RoleFeatures (roleId, featureId) VALUES (@r, @f)', set(mgr, approve));
    assert.equal((await h.api('PATCH', `${PO}/${poId}/approve`, { token: h.actors.manager.token })).status, 200);

    await h.query('INSERT INTO dbo.RoleFeatures (roleId, featureId) VALUES (@r, @f)', set(wh, cancel)); // grant cancel to Warehouse Staff
    const canceled = await h.api('PATCH', `${PO}/${poId}/cancel`, { token: h.actors.warehouse.token, body: { reason: 'granted by feature' } });
    assert.equal(canceled.status, 200);
  } finally {
    await h.query('IF NOT EXISTS (SELECT 1 FROM dbo.RoleFeatures WHERE roleId = @r AND featureId = @f) INSERT INTO dbo.RoleFeatures (roleId, featureId) VALUES (@r, @f)', set(mgr, approve));
    await h.query('DELETE FROM dbo.RoleFeatures WHERE roleId = @r AND featureId = @f', set(wh, cancel));
  }
  assert.deepEqual(await rolePermissionsInDb('Warehouse Staff'), ['CREATE_PURCHASE_ORDER', 'VIEW_PURCHASE_ORDER']);
  assert.deepEqual(await rolePermissionsInDb('Manager'), [...ROLE_PERMISSIONS.Manager].sort());
});

test('RBAC-05 only the three agreed roles are recognised: an alias role such as "Warehouse" gets nothing', async () => {
  const alias = await h.makeActor('alias', 'Warehouse');
  assert.ok(alias.token);
  assert.deepEqual((await h.api('GET', '/api/auth/me', { token: alias.token })).body.data.permissions, []);
  for (const [method, path] of [['GET', PO], ['GET', '/api/inventory/suppliers'], ['POST', PO]]) {
    assert.equal((await h.api(method, path, { token: alias.token, body: method === 'POST' ? {} : undefined })).status, 403, path);
  }
});
