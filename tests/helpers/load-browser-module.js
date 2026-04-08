const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserModule(relativePath, globalName, extraGlobals) {
  const absPath = path.resolve(process.cwd(), relativePath);
  const source = fs.readFileSync(absPath, 'utf8');
  const context = vm.createContext({
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
    ...extraGlobals,
  });

  const script = `${source}\n;globalThis.__loadedModule = (typeof ${globalName} !== 'undefined') ? ${globalName} : undefined;`;
  vm.runInContext(script, context, { filename: absPath });

  if (!context.__loadedModule) {
    throw new Error(`Module "${globalName}" was not created from ${relativePath}`);
  }
  return context.__loadedModule;
}

module.exports = { loadBrowserModule };

