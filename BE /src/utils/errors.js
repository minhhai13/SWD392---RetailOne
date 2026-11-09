/**
 * Application errors + translation of SQL Server driver errors into safe API errors.
 * Messages returned to clients never contain connection strings, credentials or raw SQL text.
 */
class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code   stable machine-readable code (frontend maps it to UI text)
   * @param {string} message human readable, safe to display
   * @param {object} [details] extra safe context (ids, current status...)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const badRequest = (code, message, details) => new AppError(400, code, message, details);
const unauthorized = (code, message) => new AppError(401, code, message);
const forbidden = (code, message, details) => new AppError(403, code, message, details);
const notFound = (code, message, details) => new AppError(404, code, message, details);
const conflict = (code, message, details) => new AppError(409, code, message, details);
const unprocessable = (code, message, details) => new AppError(422, code, message, details);

const isDriverError = (err) =>
  err &&
  (['RequestError', 'TransactionError', 'ConnectionError', 'PreparedStatementError'].includes(err.name) ||
    typeof err.number === 'number');

/**
 * Convert anything thrown below the controller into an AppError.
 * SQL Server error numbers: 2627/2601 unique, 547 FK/CHECK, 1205 deadlock victim,
 * 1222 lock timeout, 8114/8115 numeric conversion/overflow.
 */
function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err && err.type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (err && err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  if (isDriverError(err)) {
    switch (err.number) {
      case 2627:
      case 2601:
        return new AppError(409, 'DUPLICATE_RECORD', 'The record conflicts with an existing record.');
      case 547:
        return new AppError(409, 'CONSTRAINT_VIOLATION', 'The data violates a database constraint.');
      case 1205:
      case 1222:
        return new AppError(409, 'CONCURRENT_UPDATE', 'The record is being modified by another request. Please retry.');
      case 8114:
      case 8115:
        return new AppError(422, 'VALUE_OUT_OF_RANGE', 'A calculated value is out of the allowed range.');
      default:
        return new AppError(500, 'DB_ERROR', 'A database error occurred. Please try again later.');
    }
  }
  return new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
}

/** Log without secrets: only name/code/number and the driver message (no config, no SQL parameters). */
function logError(err) {
  const tag = err && (err.code || err.name) ? `${err.name}/${err.code || ''}` : 'Error';
  const num = err && typeof err.number === 'number' ? ` sql#${err.number}` : '';
  console.error(`[ERROR] ${tag}${num}: ${err && err.message ? String(err.message).slice(0, 300) : 'unknown'}`);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  toAppError,
  logError,
  isDriverError,
};
