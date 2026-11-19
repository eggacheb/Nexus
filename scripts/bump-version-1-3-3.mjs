import fs from "node:fs";

const jsonFiles = [
  "package.json",
  "apps/desktop/package.json",
  "apps/runner/package.json",
  "apps/server/package.json",
  "packages/protocol/package.json",
  "packages/security/package.json",
  "packages/shared/package.json",
];

for (const f of jsonFiles) {
  if (fs.existsSync(f)) {
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    data.version = "1.3.3";
    fs.writeFileSync(f, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`Updated ${f} to 1.3.3`);
  }
}

// tauri.conf.json
if (fs.existsSync("apps/desktop/src-tauri/tauri.conf.json")) {
  const tauriConf = JSON.parse(fs.readFileSync("apps/desktop/src-tauri/tauri.conf.json", "utf8"));
  tauriConf.version = "1.3.3";
  fs.writeFileSync("apps/desktop/src-tauri/tauri.conf.json", JSON.stringify(tauriConf, null, 2) + "\n", "utf8");
  console.log("Updated tauri.conf.json to 1.3.3");
}

// Cargo.toml
if (fs.existsSync("apps/desktop/src-tauri/Cargo.toml")) {
  let cargo = fs.readFileSync("apps/desktop/src-tauri/Cargo.toml", "utf8");
  cargo = cargo.replace(/version\s*=\s*"1\.3\.\d+"/, 'version = "1.3.3"');
  fs.writeFileSync("apps/desktop/src-tauri/Cargo.toml", cargo, "utf8");
  console.log("Updated Cargo.toml to 1.3.3");
}

// Cargo.lock
if (fs.existsSync("apps/desktop/src-tauri/Cargo.lock")) {
  let cargoLock = fs.readFileSync("apps/desktop/src-tauri/Cargo.lock", "utf8");
  cargoLock = cargoLock.replace(
    /name\s*=\s*"localbridge-desktop"\s*\nversion\s*=\s*"1\.3\.\d+"/,
    'name = "localbridge-desktop"\nversion = "1.3.3"'
  );
  fs.writeFileSync("apps/desktop/src-tauri/Cargo.lock", cargoLock, "utf8");
  console.log("Updated Cargo.lock to 1.3.3");
}

// UI components
const uiFiles = [
  "apps/desktop/src/components/Sidebar.tsx",
  "apps/desktop/src/components/StartupScreen.tsx",
  "apps/desktop/src/pages/ConnectionsPage.tsx",
  "apps/desktop/src/pages/ControlPage.tsx",
  "apps/desktop/src/pages/execution/RuntimePage.tsx",
];
for (const f of uiFiles) {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, "utf8");
    content = content.replace(/1\.3\.[12]/g, "1.3.3");
    fs.writeFileSync(f, content, "utf8");
    console.log(`Updated ${f} to 1.3.3`);
  }
}
