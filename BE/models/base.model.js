// Shared CRUD API for both mock and MSSQL adapters.
// Table and column identifiers come only from each model's definition.
function createModel(adapter, definition) {
  return {
    find: (where = {}, tx) => adapter.find(definition, where, tx),
    findOne: async (where, tx) => (await adapter.find(definition, where, tx))[0] || null,
    create: (data, tx) => adapter.create(definition, data, tx),
    update: (key, data, tx) => adapter.update(definition, key, data, tx),
    deleteWhere: (where, tx) => adapter.deleteWhere(definition, where, tx)
  };
}

module.exports = {createModel};
