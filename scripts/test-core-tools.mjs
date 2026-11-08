import fs from "node:fs";

async function main() {
  const mgmtToken = fs.readFileSync("C:\\Users\\22365\\AppData\\Local\\LocalBridge\\data\\management-token.key", "utf-8").trim();

  // 1. Get an MCP token from Core
  const tokenRes = await fetch("http://127.0.0.1:18080/api/tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mgmtToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "tool-audit",
      type: "mcp",
      scopes: ["read", "write", "execute", "delete", "filesystem-full"]
    })
  });
  const tokenData = await tokenRes.json();
  console.log("Token acquired:", tokenData.id);

  // 2. Call tools/list on Core :18080/mcp
  const listRes = await fetch("http://127.0.0.1:18080/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Host: "127.0.0.1:18080"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    })
  });
  const listData = await listRes.json();
  if (listData.result && listData.result.tools) {
    console.log("Core /mcp tools count:", listData.result.tools.length);
    console.log("First 10 tools:", listData.result.tools.slice(0, 10).map(t => t.name));
    fs.writeFileSync("tmp/core-tools.json", JSON.stringify(listData.result.tools, null, 2));
    console.log("Saved tmp/core-tools.json");
  } else {
    console.log("Core /mcp error or no tools:", JSON.stringify(listData));
  }
}

main().catch(console.error);
