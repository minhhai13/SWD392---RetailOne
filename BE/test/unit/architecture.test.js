// Static architecture checks (no database): layering, no cycles, no broken imports, parameterized SQL, no Mongo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Fixed fragments only: lock hints, constant SQL snippets, whitelisted ORDER BY parts, bound-parameter name lists/prefixes,
// a LIKE value that is passed as a parameter, and an error-message text. Never request data.
const ALLOWED_INTERPOLATIONS = ['CATALOG_FROM', 'IDENTITY_SELECT', 'countWhere', 'listWhere', 'orderColumn', 'direction', 'hint', 'list', 'prefix', 'i', 'c', 'toStatus', "parts.join(' OR ')", "where.join(' AND ')", "rows.join(',')", 'escapeLike(filters.q)', /^withStock \? /];

const SRC = path.join(__dirname, '..', '..', 'src');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const files = walk(SRC).filter((f) => f.endsWith('.js'));
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function resolveRequire(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  return null;
}
const requiresOf = (f) => [...stripComments(read(f)).matchAll(/require\(\s*(['"])([^'"]+)\1\s*\)/g)].map((m) => m[2]);
const layer = (f) => rel(f).split('/')[0];

test('A-01 every relative require resolves to a file (no broken imports)', () => {
  for (const f of files) for (const spec of requiresOf(f).filter((s) => s.startsWith('.'))) assert.ok(resolveRequire(f, spec), `${rel(f)} requires missing ${spec}`);
});

test('A-02 no circular dependencies inside src/', () => {
  const graph = new Map(files.map((f) => [f, requiresOf(f).filter((s) => s.startsWith('.')).map((s) => resolveRequire(f, s)).filter(Boolean)]));
  const state = new Map();
  const stack = [];
  const visit = (f) => {
    if (state.get(f) === 2) return;
    if (state.get(f) === 1) assert.fail(`circular dependency: ${[...stack.slice(stack.indexOf(f)), f].map(rel).join(' -> ')}`);
    state.set(f, 1);
    stack.push(f);
    for (const dep of graph.get(f)) visit(dep);
    stack.pop();
    state.set(f, 2);
  };
  for (const f of files) visit(f);
});

test('A-03 layering: routes -> controllers -> services -> repositories; models/dtos/validators stay pure', () => {
  const forbid = {
    routes: ['services/', 'repositories/'],
    controllers: ['repositories/', 'config/database', 'infrastructure/transaction'],
    services: ['mssql', 'config/database', 'controllers/', 'routes/'],
    models: ['mssql', 'repositories/', 'services/', 'config/database'],
    dtos: ['mssql', 'repositories/', 'services/', 'config/database'],
    validators: ['mssql', 'repositories/', 'services/', 'config/database'],
    repositories: ['services/', 'controllers/', 'routes/'],
  };
  for (const f of files) {
    for (const spec of requiresOf(f)) {
      const target = spec.startsWith('.') ? rel(resolveRequire(f, spec)).replace(/\.js$/, '') : spec;
      for (const bad of forbid[layer(f)] || []) assert.ok(!target.includes(bad), `${rel(f)} must not depend on ${spec}`);
    }
  }
});

test('A-04 models, dtos and validators contain no SQL', () => {
  for (const f of files.filter((x) => ['models', 'dtos', 'validators'].includes(layer(x)))) {
    assert.ok(!/\b(SELECT\s.+\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(stripComments(read(f))), `${rel(f)} contains SQL`);
  }
});

test('A-05 SQL is parameterized: no request data is interpolated into queries; no Mongo / Socket.IO anywhere', () => {
  for (const f of files) {
    const text = read(f);
    assert.ok(!/mongoose|mongodb|socket\.io/i.test(text), `${rel(f)} must not use Mongo/Socket.IO`);
    assert.ok(!/\$\{[^}]*req\.(query|body|params|headers)/.test(text), `${rel(f)} interpolates request data into a template`);
  }
  for (const f of files.filter((x) => layer(x) === 'repositories')) {
    for (const m of stripComments(read(f)).matchAll(/\$\{([^}]+)\}/g)) {
      // only fixed fragments are allowed inside repository templates (hints, whitelisted columns, bound parameter lists)
      assert.ok(ALLOWED_INTERPOLATIONS.some((a) => (a instanceof RegExp ? a.test(m[1].trim()) : a === m[1].trim())), `${rel(f)}: unexpected interpolation \${${m[1]}}`);
    }
  }
});

test('A-06 only /auth and /inventory (plus /health) are mounted; Mongo packages are gone', () => {
  const index = read(path.join(SRC, 'routes', 'index.route.js'));
  assert.deepEqual([...index.matchAll(/app\.use\(version \+ '([^']+)'/g)].map((m) => m[1]).sort(), ['/auth', '/inventory']);
  const pkg = require('../../package.json');
  for (const dep of ['mongoose', 'mongodb-memory-server', 'socket.io']) assert.ok(!pkg.dependencies[dep] && !(pkg.devDependencies || {})[dep], dep);
  assert.ok(pkg.dependencies.mssql && pkg.dependencies.bcryptjs && pkg.dependencies.jsonwebtoken && pkg.dependencies.express);
});
