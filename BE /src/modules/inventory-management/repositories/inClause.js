/**
 * Builds "@p0,@p1,..." and binds each value as its own parameter (no value is ever concatenated into SQL).
 * `type` is a node-mssql type, e.g. sql.Int / sql.BigInt.
 */
function bindList(request, prefix, type, values) {
  const names = values.map((value, i) => {
    request.input(`${prefix}${i}`, type, value);
    return `@${prefix}${i}`;
  });
  return names.join(',');
}

module.exports = { bindList };
