# Third-Party Notices & Open-Source Attributions

Nexus (v1.3.1) incorporates, links, or distributes certain open-source software and components under their respective licenses. This document acknowledges and honors the legal copyrights and licenses of all third-party contributors.

---

## 1. Architectural reference (separate from bundled software)

### WebCodex
- **Reference project**: [yyjeqhc/webcodex](https://github.com/yyjeqhc/webcodex)
- **Project license**: Apache License, Version 2.0, as stated by that upstream project
- **Acknowledgement**: WebCodex is acknowledged as a reference discussed during Nexus architecture and feature research (including local execution and MCP workflows).
- **Provenance scope**: This acknowledgement **does not assert that WebCodex source code is included in Nexus, or that Nexus is a fork or derivative of WebCodex**. Any actual source reuse must be verified at the file level and documented separately with the required copyright notices and license terms. Architectural ideas and interface concepts are not equivalent to copied implementation code.
- **Upstream license**: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) (applies to covered upstream code, if used; not automatically to Nexus's own implementation).

---

## 2. Bundled Production Runtimes & Binaries

The following pre-compiled executable binaries may be bundled within self-contained release distributions of Nexus:

### Node.js Runtime (`node.exe`)
- **Source**: [nodejs.org](https://nodejs.org/)
- **License**: MIT-like (Node.js License)
- **Copyright**: Copyright Node.js contributors. All rights reserved.

### uv / uvx Fast Python Package Manager & Engine (`uv.exe`)
- **Source**: [astral-sh/uv](https://github.com/astral-sh/uv)
- **License**: Apache-2.0 / MIT Dual License
- **Copyright**: Copyright © 2026 Astral Software Inc.

### Cloudflare Tunnel (`cloudflared.exe`)
- **Source**: [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared)
- **License**: Apache License, Version 2.0
- **Copyright**: Copyright © Cloudflare, Inc.

### TypeScript Language Server (`typescript-language-server`)
- **Source**: [typescript-language-server/typescript-language-server](https://github.com/typescript-language-server/typescript-language-server)
- **License**: Apache License, Version 2.0
- **Copyright**: Copyright © 2026 TypeFox and contributors

---

## 3. Core Workspace & Production Dependencies

All runtime dependencies incorporated into the Nexus v1.3.1 monorepo packages (`@localbridge/server`, `@localbridge/runner`, `@localbridge/desktop`, `@localbridge/bridge`, `@localbridge/protocol`, `@localbridge/security`, `@localbridge/shared`) are distributed under standard permissive open-source licenses:

| Component | Repository / Source | License |
|---|---|---|
| `fastify` | https://github.com/fastify/fastify | MIT |
| `better-sqlite3` | https://github.com/WiseLibs/better-sqlite3 | MIT |
| `pino` | https://github.com/pinojs/pino | MIT |
| `zod` | https://github.com/colinhacks/zod | MIT |
| `ws` | https://github.com/websockets/ws | MIT |
| `react` / `react-dom` | https://github.com/facebook/react | MIT |
| `vite` | https://github.com/vitejs/vite | MIT |
| `lucide-react` | https://github.com/lucide-icons/lucide | ISC |
| `tauri` | https://github.com/tauri-apps/tauri | Apache-2.0 / MIT |
| `serde` / `serde_json` | https://github.com/serde-rs/serde | Apache-2.0 / MIT |
| `tokio` | https://github.com/tokio-rs/tokio | MIT |
| `sysinfo` | https://github.com/GuillaumeGomez/sysinfo | MIT |
| `node-pty` | https://github.com/microsoft/node-pty | MIT |
| `koffi` | https://github.com/koromix/koffi | MIT |

---

## 4. Skills & Template Assets

### Academic Thesis Word Engine (`nexus.thesis-word-format`)
- **Source**: Self-developed automation engine using standard Windows Word COM Automation and ECMA-376 / ISO/IEC 29500 (OOXML) specifications.
- **Test Fixtures**: Programmatically generated test documents (`test_01` to `test_15`) created solely for regression and integrity verification. No third-party copyrighted texts are included.

---

*This document is provided pursuant to the disclosure requirements of the respective licenses.*
