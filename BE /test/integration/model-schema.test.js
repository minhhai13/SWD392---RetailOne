// MODEL-01: every entity model must match the REAL SQL Server table (names, types, nullability, identity, computed, defaults, PK).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setup } = require('../helpers/harness');
const models = require('../../src/shared/models/index');

let h;
before(async () => {
  h = await setup();
});
after(() => h.teardown());

for (const model of Object.values(models)) {
  test(`MODEL-01 ${model.name} model matches table dbo.${model.table}`, async () => {
    const cols = await h.query(
      `SELECT c.name AS col, ty.name AS typeName, c.max_length AS maxLength, c.precision, c.scale, c.is_nullable AS nullable, c.is_identity AS isIdentity, c.is_computed AS isComputed,
              CASE WHEN dc.object_id IS NULL THEN 0 ELSE 1 END AS hasDefault
       FROM sys.columns c
       JOIN sys.tables t ON t.object_id = c.object_id
       JOIN sys.types ty ON ty.user_type_id = c.user_type_id
       LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
       WHERE t.name = @t`,
      { t: [h.sql.NVarChar(128), model.table] }
    );
    assert.deepEqual(cols.map((c) => c.col).sort(), model.columnNames().sort(), 'column names');

    for (const row of cols) {
      const def = model.columns[row.col];
      const p = def.parsed;
      assert.equal(row.typeName, p.base, `${row.col} type`);
      if (p.base === 'nvarchar' || p.base === 'varchar') {
        const chars = row.maxLength === -1 ? null : p.base === 'nvarchar' ? row.maxLength / 2 : row.maxLength;
        assert.equal(chars, p.length, `${row.col} length`);
      }
      if (p.base === 'decimal') assert.deepEqual([row.precision, row.scale], [p.precision, p.scale], `${row.col} precision/scale`);
      if (p.base === 'datetime2') assert.equal(row.scale, p.scale, `${row.col} scale`);
      assert.equal(Boolean(row.isIdentity), def.identity, `${row.col} identity`);
      assert.equal(Boolean(row.isComputed), def.computed, `${row.col} computed`);
      if (!def.computed) {
        assert.equal(Boolean(row.nullable), def.nullable, `${row.col} nullable`);
        assert.equal(Boolean(row.hasDefault), def.hasDefault, `${row.col} DEFAULT`);
      }
    }

    const pk = await h.query(
      `SELECT c.name AS col FROM sys.indexes i
       JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
       JOIN sys.tables t ON t.object_id = i.object_id
       WHERE i.is_primary_key = 1 AND t.name = @t`,
      { t: [h.sql.NVarChar(128), model.table] }
    );
    assert.deepEqual(pk.map((r) => r.col).sort(), [...model.primaryKey].sort(), 'primary key');
  });
}
