import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Build-time only: reuse original Shop POS helpers, never a second financial model.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceRoot = resolve(repository, 'web/src');
const entries = {
  pos: 'lib/pos-preview.ts', suggestions: 'lib/mock-suggested-prices.ts',
  inventory: 'lib/admin/mock-inventory.ts', sales: 'lib/admin/mock-sales.ts',
  costs: 'lib/admin/mock-historical-costs.ts', profit: 'lib/admin/mock-profit.ts',
  money: 'lib/demo/money.ts', checkout: 'lib/demo/checkout.ts', admin: 'lib/demo/admin-preview.ts',
};
const modules = new Map();
function collect(file) {
  if (modules.has(file)) return;
  const absolute = resolve(sourceRoot, file);
  if (!absolute.startsWith(sourceRoot + '/') && !absolute.startsWith(sourceRoot + '\\')) throw new Error('Helper outside source root');
  const source = readFileSync(absolute, 'utf8');
  const imports = {};
  modules.set(file, { source, imports });
  for (const dependency of ts.preProcessFile(source).importedFiles) {
    const specifier = dependency.fileName;
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) throw new Error('External dependency forbidden: ' + specifier);
    const target = specifier.startsWith('@/') ? specifier.slice(2) + '.ts' : relative(sourceRoot, resolve(dirname(absolute), specifier + '.ts')).replaceAll('\\', '/');
    imports[specifier] = target;
    collect(target);
  }
}
Object.values(entries).forEach(collect);
const factories = [...modules].map(([file, { source }]) => {
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return JSON.stringify(file) + ': function(module, exports, require) {\n' + compiled + '\n}';
}).join(',\n');
const imports = Object.fromEntries([...modules].map(([file, entry]) => [file, entry.imports]));
const bundle = `const core = (() => {\nconst factories = {${factories}};\nconst dependencies = ${JSON.stringify(imports)};\nconst cache = {};\nfunction load(id) { if (cache[id]) return cache[id].exports; const module = {exports:{}}; cache[id] = module; factories[id](module, module.exports, specifier => load(dependencies[id][specifier])); return module.exports; }\nreturn {${Object.entries(entries).map(([key, file]) => key + ': load(' + JSON.stringify(file) + ')').join(',')}};\n})();`;
const themeFile = 'web/src/styles/tokens.css';
const themeSource = readFileSync(resolve(repository, themeFile), 'utf8');
const provenance = {
  theme: { file: themeFile, sha256: createHash('sha256').update(themeSource).digest('hex') },
  purpose: 'Shop POS standalone demo; no authoritative records or authentication',
  generatedBy: 'node web/scripts/build-demo-showcase.mjs',
  sources: [...modules].map(([file, entry]) => ({ file: 'web/src/' + file, sha256: createHash('sha256').update(entry.source).digest('hex') })),
};
const template = readFileSync(resolve(repository, 'demo/showcase.template.html'), 'utf8');
if (!template.includes('/*__SHOP_POS_THEME__*/') || !template.includes('/*__SHOP_POS_CORE__*/') || !template.includes('__SHOP_POS_PROVENANCE__')) throw new Error('Missing showcase build markers');
const output = template.replace('/*__SHOP_POS_THEME__*/', themeSource).replace('/*__SHOP_POS_CORE__*/', bundle.replaceAll('</script', '<\\/script')).replace('__SHOP_POS_PROVENANCE__', JSON.stringify(provenance));
writeFileSync(resolve(repository, 'demo/shop-pos-showcase.html'), output, 'utf8');
console.log('Standalone showcase built from ' + modules.size + ' original helper modules.');
