const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { setup } = require('../helpers/harness');

let h;
let catalog;
let poId;
before(async () => {
  h = await setup();
  await h.standardActors();
  catalog = await h.makeCatalog();
  poId = (await h.createPo(h.actors.warehouse.token, catalog)).body.data.id;
});
after(() => h.teardown());

const PO = '/api/inventory/purchase-orders';

test('A-01 no token -> 401 on every protected route', async () => {
  for (const [method, path] of [['GET', PO], ['POST', PO], ['GET', `${PO}/${poId}`], ['PATCH', `${PO}/${poId}/approve`], ['PATCH', `${PO}/${poId}/cancel`], ['GET', '/api/inventory/suppliers'], ['GET', '/api/auth/me']]) {
    const res = await h.api(method, path, { body: method === 'GET' ? undefined : {} });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.body.success, false);
  }
});

test('A-02 invalid token (garbage, wrong secret, wrong algorithm, no userId) -> 401', async () => {
  const bad = [
    'garbage',
    jwt.sign({ userId: h.actors.manager.userId }, 'some-other-secret'),
    jwt.sign({ userId: h.actors.manager.userId }, process.env.JWT_SECRET, { algorithm: 'HS512' }),
    jwt.sign({ foo: 1 }, process.env.JWT_SECRET),
    jwt.sign({ userId: 999999999 }, process.env.JWT_SECRET),
  ];
  for (const token of bad) {
    const res = await h.api('GET', PO, { token });
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INVALID_TOKEN');
  }
});

test('A-03 expired token -> 401 TOKEN_EXPIRED', async () => {
  const token = h.tokenFor(h.actors.manager.userId, { expiresIn: -10 });
  const res = await h.api('GET', PO, { token });
  assert.equal(res.status, 401);
  assert.equal(res.body.code, 'TOKEN_EXPIRED');
});

test('A-04 Cashier gets 403 on every purchasing route (BR-02)', async () => {
  const token = h.actors.cashier.token;
  assert.ok(token);
  for (const [method, path, body] of [
    ['GET', PO], ['POST', PO, { supplierId: catalog.supplierId, items: [{ variantId: catalog.products[0].variantId, quantity: 1 }] }],
    ['GET', `${PO}/${poId}`], ['PATCH', `${PO}/${poId}/approve`, {}], ['PATCH', `${PO}/${poId}/cancel`, { reason: 'x' }],
    ['GET', '/api/inventory/suppliers'], ['GET', `/api/inventory/suppliers/${catalog.supplierId}/products`],
  ]) {
    const res = await h.api(method, path, { token, body });
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.code, 'FORBIDDEN');
  }
  assert.equal((await h.poRow(poId)).status, 'PENDING');
});

test('A-05 Warehouse Staff cannot approve or cancel (Manager only, BR-42) but can view/create (A-06)', async () => {
  const token = h.actors.warehouse.token;
  assert.equal((await h.api('PATCH', `${PO}/${poId}/approve`, { token, body: {} })).status, 403);
  assert.equal((await h.api('PATCH', `${PO}/${poId}/cancel`, { token, body: { reason: 'x' } })).status, 403);
  assert.equal((await h.poRow(poId)).status, 'PENDING');
  assert.equal((await h.api('GET', PO, { token })).status, 200);
  assert.equal((await h.api('GET', `${PO}/${poId}`, { token })).status, 200);
  assert.equal((await h.createPo(token, catalog, [1])).status, 201);
});

test('A-07 a token stays valid only while the account is usable (locked user / resigned staff -> 403)', async () => {
  const locked = await h.makeActor('lockme', 'Manager');
  assert.equal((await h.api('GET', PO, { token: locked.token })).status, 200);
  await h.query("UPDATE dbo.Users SET isActive = 'locked' WHERE id = @id", { id: [h.sql.Int, locked.userId] });
  const res = await h.api('GET', PO, { token: locked.token });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'ACCOUNT_LOCKED');

  const resigned = await h.makeActor('resignme', 'Warehouse Staff');
  await h.query("UPDATE dbo.Staff SET employmentStatus = 'resigned', resignationDate = CAST(SYSDATETIME() AS DATE) WHERE id = @id", { id: [h.sql.BigInt, resigned.staffId] });
  const res2 = await h.api('GET', PO, { token: resigned.token });
  assert.equal(res2.status, 403);
  assert.equal(res2.body.code, 'STAFF_RESIGNED');
});

test('A-08 login: success, wrong password, unknown user, locked, resigned, validation', async () => {
  const m = h.actors.manager;
  const ok = await h.login(m.username, h.passwords[m.username]);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.token);
  assert.equal(ok.body.data.user.role.name, 'Manager');
  assert.deepEqual(ok.body.data.user.permissions, ['APPROVE_PURCHASE_ORDER', 'CANCEL_PURCHASE_ORDER', 'CREATE_PURCHASE_ORDER', 'VIEW_PURCHASE_ORDER']);
  assert.equal(ok.body.data.user.staffId, m.staffId);
  assert.equal(ok.body.data.user.passwordHash, undefined);
  assert.equal(JSON.stringify(ok.body).includes('passwordHash'), false);

  const wrong = await h.login(m.username, 'definitely-wrong');
  const unknown = await h.login('no_such_user_zzz', 'whatever');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message); // no user enumeration

  const locked = await h.makeActor('lockedlogin', 'Manager', { isActive: 'locked' });
  assert.equal((await h.login(locked.username, h.passwords[locked.username])).status, 403);
  const resigned = await h.makeActor('resignedlogin', 'Manager', { employmentStatus: 'resigned' });
  assert.equal((await h.login(resigned.username, h.passwords[resigned.username])).status, 403);

  assert.equal((await h.api('POST', '/api/auth/login', { body: {} })).status, 400);
  assert.equal((await h.api('POST', '/api/auth/login', { body: { username: { $ne: '' }, password: 'x' } })).status, 400);
  const me = await h.api('GET', '/api/auth/me', { token: m.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.username, m.username);
});

test('A-09 actor ids in the body are ignored: createdBy / approvedBy / canceledBy come from the token', async () => {
  const other = h.actors.manager2;
  const created = await h.api('POST', PO, {
    token: h.actors.warehouse.token,
    body: { supplierId: catalog.supplierId, items: [{ variantId: catalog.products[0].variantId, quantity: 1 }], createdBy: other.staffId, staffId: other.staffId, managerId: other.staffId },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.createdBy.staffId, h.actors.warehouse.staffId);

  const id = created.body.data.id;
  const approved = await h.api('PATCH', `${PO}/${id}/approve`, { token: h.actors.manager.token, body: { approvedBy: other.staffId, managerId: other.staffId } });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.approvedBy.staffId, h.actors.manager.staffId);

  const canceled = await h.api('PATCH', `${PO}/${id}/cancel`, { token: h.actors.manager.token, body: { reason: 'r', canceledBy: other.staffId } });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.data.canceledBy.staffId, h.actors.manager.staffId);
});

test('A-10 legacy routes are gone (receive / status / list / detail / unrelated modules)', async () => {
  const token = h.actors.manager.token;
  for (const [method, path] of [['PATCH', `${PO}/receive/${poId}`], ['PATCH', `${PO}/status/${poId}`], ['POST', `${PO}/request`], ['GET', `${PO}/list`], ['GET', '/api/invoices'], ['GET', '/api/products']]) {
    const res = await h.api(method, path, { token, body: method === 'GET' ? undefined : {} });
    assert.ok([400, 404].includes(res.status), `${method} ${path} -> ${res.status}`);
    assert.notEqual(res.status, 200);
  }
  assert.equal((await h.api('PATCH', `${PO}/receive/${poId}`, { token, body: {} })).status, 404);
  assert.equal((await h.poRow(poId)).status, 'PENDING');
});
