/**
 * Entity definition helper. A model DESCRIBES one SQL Server table (names, types, nullability, identity, computed,
 * defaults, primary key). It contains NO SQL and NO database access: queries live in src/repositories.
 * Definitions mirror docs/reference/RetailOne_schema_mssql(4).sql; test MODEL-01 verifies them against the real DB.
 */
const { fromDbId } = require('../utils/ids');

const TYPE_RE = /^([a-z0-9]+)(?:\((max|\d+)(?:,(\d+))?\))?$/;

/** 'nvarchar(255)' -> { base:'nvarchar', length:255 }; 'decimal(15,2)' -> { base, precision, scale }; 'datetime2(7)' -> scale. */
function parseType(spec) {
  const m = TYPE_RE.exec(spec);
  if (!m) throw new Error(`Invalid column type "${spec}"`);
  const [, base, a, b] = m;
  if (base === 'decimal') return { base, precision: Number(a), scale: Number(b) };
  if (base === 'datetime2') return { base, scale: a === undefined ? 7 : Number(a) };
  if (['varchar', 'nvarchar'].includes(base)) return { base, length: a === 'max' ? null : Number(a) };
  return { base };
}

/** Column descriptor. opts: nullable, identity, computed (read-only), hasDefault (DB DEFAULT exists). */
const col = (type, opts = {}) =>
  Object.freeze({ type, parsed: parseType(type), nullable: false, identity: false, computed: false, hasDefault: false, ...opts });

function defineModel({ name, table, primaryKey, columns }) {
  for (const key of primaryKey) if (!columns[key]) throw new Error(`${name}: primary key column ${key} is not defined`);
  const names = Object.keys(columns);
  const isReadOnly = (c) => columns[c].identity || columns[c].computed;

  return Object.freeze({
    name,
    table,
    primaryKey: Object.freeze([...primaryKey]),
    columns: Object.freeze(columns),
    columnNames: () => [...names],
    /** Columns an INSERT/UPDATE may set: never IDENTITY, never computed (poCode, total, receivedTotal...). */
    writableColumns: () => names.filter((c) => !isReadOnly(c)),
    readOnlyColumns: () => names.filter(isReadOnly),
    isWritable: (c) => Boolean(columns[c]) && !isReadOnly(c),
    /** Max characters of a varchar/nvarchar column (null for MAX or non-text columns). */
    maxLength: (c) => (columns[c] && columns[c].parsed.length) || null,
    /** Copy of a result row where BIGINT columns (returned as strings by the driver) become Numbers; unknown columns pass through. */
    hydrate(row) {
      if (!row) return row;
      const out = { ...row };
      for (const c of names) if (columns[c].parsed.base === 'bigint' && c in out) out[c] = fromDbId(out[c]);
      return out;
    },
  });
}

module.exports = { col, defineModel, parseType };
