/** Small input-parsing helpers shared by the validators. They only parse/validate; they never touch the database. */
const { badRequest } = require('../utils/errors');

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Query-string values must be a single string (rejects ?a=1&a=2 arrays and nested objects). */
function single(value, field) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${field} must be a single value.`, { field });
  return value;
}

/** YYYY-MM-DD that is a real calendar date; returns the text or null when absent. */
function parseDate(value, field) {
  const text = single(value, field);
  if (text === undefined || text === '') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const d = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (!match || d.getUTCFullYear() !== +match[1] || d.getUTCMonth() !== +match[2] - 1 || d.getUTCDate() !== +match[3]) {
    throw badRequest('INVALID_DATE', `${field} must be a valid date in YYYY-MM-DD format.`, { field });
  }
  return text;
}

function parsePositiveInt(value, field, fallback, max) {
  const text = single(value, field);
  if (text === undefined || text === '') return fallback;
  if (!/^[1-9]\d{0,6}$/.test(text) || Number(text) > max) {
    throw badRequest('VALIDATION_ERROR', `${field} must be an integer between 1 and ${max}.`, { field });
  }
  return Number(text);
}

/** Optional text: null/undefined/blank -> null; trimmed; longer than max -> 400. */
function parseOptionalText(value, max, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${field} must be a string.`, { field });
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest('VALIDATION_ERROR', `${field} must be at most ${max} characters.`, { field });
  return trimmed === '' ? null : trimmed;
}

module.exports = { isPlainObject, single, parseDate, parsePositiveInt, parseOptionalText };
