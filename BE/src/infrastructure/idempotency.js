/**
 * In-memory idempotency for UC22 retries (no schema change, OPEN-QUESTIONS Q17).
 * Same (scope, Idempotency-Key, request fingerprint) => the original result is returned instead of creating a second PO,
 * including while the first request is still running. Only SUCCESSFUL results are remembered (a failed attempt can be retried).
 * Limits: per process and lost on restart. A durable key needs a schema change (a column + unique index on PurchaseOrders).
 */
const crypto = require('crypto');
const { conflict } = require('../utils/errors');

function createIdempotencyStore({ ttlMs = 10 * 60 * 1000, maxEntries = 5000 } = {}) {
  const entries = new Map();

  const prune = (now) => {
    for (const [key, e] of entries) if (e.expiresAt !== null && e.expiresAt <= now) entries.delete(key);
    while (entries.size >= maxEntries) entries.delete(entries.keys().next().value);
  };

  /** @returns {Promise<{ result: any, replay: boolean }>} */
  async function run(scope, key, fingerprint, work) {
    const id = `${scope}:${key}`;
    const now = Date.now();
    const existing = entries.get(id);
    if (existing && (existing.expiresAt === null || existing.expiresAt > now)) {
      if (existing.fingerprint !== fingerprint) {
        throw conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
      }
      return { result: await existing.promise, replay: true };
    }

    prune(now);
    const promise = Promise.resolve().then(work);
    const entry = { fingerprint, promise, expiresAt: null }; // null = still running
    entries.set(id, entry);
    try {
      const result = await promise;
      entry.expiresAt = Date.now() + ttlMs;
      return { result, replay: false };
    } catch (err) {
      entries.delete(id);
      throw err;
    }
  }

  return { run, size: () => entries.size, clear: () => entries.clear() };
}

const fingerprintOf = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

module.exports = { createIdempotencyStore, fingerprintOf, store: createIdempotencyStore() };
