const { sql, getPool, newRequest } = require('../config/database');
const { AppError, logError } = require('../utils/errors');

const LOCK_TIMEOUT_MS = Number(process.env.DB_LOCK_TIMEOUT_MS || 5000);

/**
 * Run `work(tx)` inside one SQL Server transaction (READ COMMITTED + explicit lock hints in the repositories).
 * Every repository call that must be atomic receives `tx` as its `executor`.
 *
 *  - An error thrown by `work` (before COMMIT) rolls everything back and is re-thrown unchanged.
 *  - Once COMMIT has succeeded this function returns normally: nothing after it can undo or "fail" the write.
 *    Callers must therefore do their follow-up reads OUTSIDE withTransaction and treat read errors as post-commit.
 *  - If COMMIT itself fails the outcome is unknown (e.g. connection dropped): COMMIT_OUTCOME_UNKNOWN is thrown.
 *
 * LOCK_TIMEOUT prevents requests hanging forever on a lock held by a concurrent request (error 1222 -> 409).
 */
async function withTransaction(work) {
  const tx = new sql.Transaction(getPool());
  await tx.begin();

  let result;
  try {
    await newRequest(tx).query(`SET LOCK_TIMEOUT ${Number.isInteger(LOCK_TIMEOUT_MS) ? LOCK_TIMEOUT_MS : 5000}`);
    result = await work(tx);
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {
      // the server may already have rolled the transaction back (e.g. deadlock victim)
    }
    throw err;
  }

  try {
    await tx.commit();
  } catch (err) {
    logError(err);
    try {
      await tx.rollback(); // no-op if the commit really went through
    } catch (_) {
      /* ignore */
    }
    throw new AppError(500, 'COMMIT_OUTCOME_UNKNOWN', 'The result of the operation could not be confirmed. Check the purchase order before retrying.');
  }
  return result;
}

module.exports = { withTransaction };
