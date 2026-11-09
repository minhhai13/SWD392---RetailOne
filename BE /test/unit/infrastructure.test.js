// Unit tests (no database): error mapping, config, idempotency store, seed safety guards.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toAppError, AppError } = require('../../src/utils/errors');
const { buildConfig } = require('../../src/config/database');
const { createIdempotencyStore, fingerprintOf } = require('../../src/infrastructure/idempotency');
const { assertSafeTarget, resolvePasswords, DEMO_USERS } = require('../../scripts/lib/demoSeed');

test('I-01 SQL Server errors are mapped to safe API errors', () => {
  const sqlErr = (number) => Object.assign(new Error('Violation of PRIMARY KEY constraint on server X'), { name: 'RequestError', number });
  assert.equal(toAppError(sqlErr(2627)).status, 409);
  assert.equal(toAppError(sqlErr(547)).code, 'CONSTRAINT_VIOLATION');
  assert.equal(toAppError(sqlErr(1205)).code, 'CONCURRENT_UPDATE');
  assert.equal(toAppError(sqlErr(1222)).code, 'CONCURRENT_UPDATE');
  assert.equal(toAppError(sqlErr(8115)).status, 422);
  const generic = toAppError(sqlErr(4060));
  assert.deepEqual([generic.status, generic.code], [500, 'DB_ERROR']);
  assert.ok(!generic.message.includes('server X'));
  assert.equal(toAppError(new Error('boom')).code, 'INTERNAL_ERROR');
  const app = new AppError(404, 'X', 'y');
  assert.equal(toAppError(app), app);
});

test('I-02 database config reads env and never echoes secrets in errors', () => {
  assert.throws(() => buildConfig({}), (e) => /DB_SERVER/.test(e.message) && !/password=/i.test(e.message));
  const cfg = buildConfig({ DB_SERVER: 'h', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'p', DB_ENCRYPT: 'true', DB_TRUST_SERVER_CERTIFICATE: 'false', DB_PORT: '1444' });
  assert.deepEqual([cfg.port, cfg.options.encrypt, cfg.options.trustServerCertificate], [1444, true, false]);
});

test('I-03 idempotency store: replay, in-flight sharing, key reuse, failures not cached, expiry', async () => {
  const store = createIdempotencyStore({ ttlMs: 30 });
  let calls = 0;
  const work = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return { id: calls };
  };
  const [a, b, c] = await Promise.all([store.run('s', 'k1', 'fp', work), store.run('s', 'k1', 'fp', work), store.run('s', 'k1', 'fp', work)]);
  assert.equal(calls, 1);
  assert.deepEqual([a.replay, b.replay, c.replay].sort(), [false, true, true]);
  assert.equal(a.result.id, 1);
  assert.equal((await store.run('s', 'k1', 'fp', work)).replay, true);
  await assert.rejects(store.run('s', 'k1', 'other-fp', work), (e) => e.code === 'IDEMPOTENCY_KEY_REUSED');
  assert.equal((await store.run('other-scope', 'k1', 'fp', work)).replay, false); // scoped per staff
  let attempts = 0;
  const flaky = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('boom');
    return 'ok';
  };
  await assert.rejects(store.run('s', 'k2', 'fp', flaky));
  assert.equal((await store.run('s', 'k2', 'fp', flaky)).result, 'ok'); // failed attempt can be retried
  await new Promise((r) => setTimeout(r, 60));
  assert.equal((await store.run('s', 'k1', 'fp', work)).replay, false); // expired
  assert.equal(fingerprintOf({ a: 1 }), fingerprintOf({ a: 1 }));
  assert.notEqual(fingerprintOf({ a: 1 }), fingerprintOf({ a: 2 }));
});

test('I-04 seed / reset safety guard: only local *_TEST databases', () => {
  const ok = { server: 'localhost', database: 'RetailOnePOS_TEST' };
  assert.doesNotThrow(() => assertSafeTarget(ok, {}));
  assert.doesNotThrow(() => assertSafeTarget({ ...ok, server: '127.0.0.1' }, {}));
  assert.throws(() => assertSafeTarget({ ...ok, database: 'RetailOnePOS' }, {}), /_TEST/);
  assert.throws(() => assertSafeTarget({ ...ok, database: 'Prod_TEST_old' }, {}), /_TEST/);
  assert.throws(() => assertSafeTarget({ ...ok, server: 'db.example.com' }, {}), /localhost/);
  assert.doesNotThrow(() => assertSafeTarget({ ...ok, server: 'db.example.com' }, { ALLOW_REMOTE_DEMO_DB: 'true' }));
});

test('I-05 demo passwords come from env (min 8 chars) or are generated; nothing is hardcoded', () => {
  const generated = resolvePasswords({});
  for (const u of DEMO_USERS) assert.ok(generated[u.username].generated && generated[u.username].password.length >= 10);
  assert.notEqual(generated.manager.password, resolvePasswords({}).manager.password);
  const fromEnv = resolvePasswords({ SEED_MANAGER_PASSWORD: 'env-pass-123' });
  assert.deepEqual([fromEnv.manager.password, fromEnv.manager.generated], ['env-pass-123', false]);
  assert.throws(() => resolvePasswords({ SEED_CASHIER_PASSWORD: 'short' }), /8 characters/);
});
