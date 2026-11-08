import esbuild from "esbuild";
import fs from "node:fs";

const rootDir = "E:/workspace/cod";
const serverOut = "E:/workspace/release/verify_install/resources/server/index.js";
const bridgeOut = "E:/workspace/release/verify_install/resources/bridge/index.js";

console.log("Bundling server...");
esbuild.buildSync({
  entryPoints: [`${rootDir}/apps/server/src/index.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["better-sqlite3"],
  banner: {
    js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`,
  },
  outfile: serverOut,
});

console.log("Bundling bridge...");
esbuild.buildSync({
  entryPoints: [`${rootDir}/apps/bridge/src/index.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  banner: {
    js: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`,
  },
  outfile: bridgeOut,
});

// Sync to desktop resources
fs.copyFileSync(serverOut, `${rootDir}/apps/desktop/src-tauri/resources/server/index.js`);
fs.copyFileSync(bridgeOut, `${rootDir}/apps/desktop/src-tauri/resources/bridge/index.js`);

console.log("Bundling completed successfully!");
