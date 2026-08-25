// src/lib/http/electron-fetch.ts
import consola from "consola";
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
function bindElectronFetch() {
  if (!process.versions.electron) return false;
  try {
    const electronModule = require2("electron");
    const netFetch = electronModule.net?.fetch;
    if (typeof netFetch !== "function") return false;
    globalThis.fetch = netFetch.bind(electronModule.net);
    consola.log("Successfully bound Electron's net.fetch to global fetch.");
    return true;
  } catch {
    consola.log(
      "Failed to bind Electron's net.fetch. Falling back to global fetch."
    );
    return false;
  }
}
export {
  bindElectronFetch
};
