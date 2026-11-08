import fs from "node:fs";

async function main() {
  const mgmtToken = fs.readFileSync("C:\\Users\\22365\\AppData\\Local\\LocalBridge\\data\\management-token.key", "utf-8").trim();

  // 1. Get MCP token from Core
  const tokenRes = await fetch("http://127.0.0.1:18080/api/tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mgmtToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "tool-verification-suite",
      type: "mcp",
      scopes: ["read", "write", "execute", "delete", "filesystem-full"]
    })
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.token;
  console.log("Token acquired:", tokenData.id);

  async function callTool(name, args = {}) {
    const res = await fetch("http://127.0.0.1:18080/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Host: "127.0.0.1:18080"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args }
      })
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  const testTools = [
    { name: "localbridge_project_list", args: {} },
    { name: "localbridge_system_ping", args: {} },
    { name: "localbridge_system_info", args: {} },
    { name: "localbridge_runtime_list", args: {} },
    { name: "localbridge_process_list", args: {} },
    { name: "localbridge_port_list", args: {} },
    { name: "localbridge_terminal_list", args: {} },
    { name: "localbridge_job_list", args: {} },
    { name: "localbridge_environment_detect", args: {} },
    { name: "localbridge_git_status", args: { projectId: "proj_367f3b4a-a96e-4aa9-b583-00c9a584f1d0" } },
    { name: "localbridge_directory_list", args: { projectId: "proj_367f3b4a-a96e-4aa9-b583-00c9a584f1d0" } },
    { name: "localbridge_file_stat", args: { projectId: "proj_367f3b4a-a96e-4aa9-b583-00c9a584f1d0", path: "package.json" } },
  ];

  for (const t of testTools) {
    try {
      const res = await callTool(t.name, t.args);
      const isErr = res.data?.error || res.data?.result?.isError;
      console.log(`Tool ${t.name}: status=${res.status}, error=${Boolean(isErr)}`);
      if (isErr) {
        console.log("  Details:", JSON.stringify(res.data));
      } else {
        const text = res.data?.result?.content?.[0]?.text;
        console.log("  Success sample:", (text || JSON.stringify(res.data?.result)).slice(0, 100));
      }
    } catch (e) {
      console.log(`Tool ${t.name} EXCEPTION:`, e.message);
    }
  }
}

main().catch(console.error);
