import { spawn } from "node:child_process";
import fs from "node:fs";

async function main() {
  const TEST_PORT = "8799";
  const mgmtToken = fs.readFileSync("C:\\Users\\22365\\AppData\\Local\\LocalBridge\\data\\management-token.key", "utf-8").trim();

  // 1. Launch test bridge process
  const child = spawn("node", ["tmp/test-bridge-bundle.js"], {
    cwd: "e:\\workspace\\cod",
    env: {
      ...process.env,
      PORT: TEST_PORT,
      NEXUS_BRIDGE_PORT: TEST_PORT,
      NEXUS_BRIDGE_HOST: "127.0.0.1",
      NEXUS_CORE_URL: "http://127.0.0.1:18080",
      NEXUS_MANAGEMENT_TOKEN: mgmtToken,
      LOCALBRIDGE_MANAGEMENT_TOKEN: mgmtToken,
      PUBLIC_BASE_URL: "http://127.0.0.1:8799",
      NEXUS_BRIDGE_TOKEN: "test-spark-token-332",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.on("data", (d) => {
    // console.log("[Bridge STDOUT]", d.toString().trim());
  });
  child.stderr.on("data", (d) => {
    // console.log("[Bridge STDERR]", d.toString().trim());
  });

  // Wait 1.5s for bridge to start
  await new Promise((r) => setTimeout(r, 1500));

  try {
    const bridgeUrl = `http://127.0.0.1:${TEST_PORT}`;
    const bridgeToken = "test-spark-token-332";

    // A. Probe GET /mcp
    console.log("Checking GET /mcp probe...");
    const probeRes = await fetch(`${bridgeUrl}/mcp`, { method: "GET" });
    const probeData = await probeRes.json();
    console.log("Probe toolsAvailable:", probeData.toolsAvailable);

    // B. MCP Initialize
    console.log("Checking MCP initialize...");
    const initRes = await fetch(`${bridgeUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    console.log("Initialize status:", initRes.status);

    // C. tools/list
    console.log("Checking tools/list...");
    const listRes = await fetch(`${bridgeUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    const listData = await listRes.json();
    const tools = listData.result?.tools || [];
    console.log("tools/list total count:", tools.length);
    console.log("Has localbridge_project_list:", tools.some((t) => t.name === "localbridge_project_list"));
    console.log("Has nexus_project_list:", tools.some((t) => t.name === "nexus_project_list"));
    console.log("Has localbridge_process_list:", tools.some((t) => t.name === "localbridge_process_list"));
    console.log("Has localbridge_git_status:", tools.some((t) => t.name === "localbridge_git_status"));
    console.log("Has localbridge_browser_navigate:", tools.some((t) => t.name === "localbridge_browser_navigate"));
    console.log("Has localbridge_code_definition:", tools.some((t) => t.name === "localbridge_code_definition"));

    // D. tools/call localbridge_project_list
    console.log("Calling localbridge_project_list...");
    const callRes1 = await fetch(`${bridgeUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "localbridge_project_list",
          arguments: {},
        },
      }),
    });
    const callData1 = await callRes1.json();
    console.log("localbridge_project_list isError:", callData1.result?.isError);
    const text1 = callData1.result?.content?.[0]?.text;
    console.log("localbridge_project_list output snippet:", text1?.slice(0, 80));

    // E. tools/call nexus_project_list (legacy compatibility)
    console.log("Calling nexus_project_list (legacy compatibility)...");
    const callRes2 = await fetch(`${bridgeUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "nexus_project_list",
          arguments: {},
        },
      }),
    });
    const callData2 = await callRes2.json();
    console.log("nexus_project_list isError:", callData2.result?.isError);
    const text2 = callData2.result?.content?.[0]?.text;
    console.log("nexus_project_list output snippet:", text2?.slice(0, 80));

    // F. tools/call localbridge_process_list
    console.log("Calling localbridge_process_list...");
    const callRes3 = await fetch(`${bridgeUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "localbridge_process_list",
          arguments: {},
        },
      }),
    });
    const callData3 = await callRes3.json();
    console.log("localbridge_process_list isError:", callData3.result?.isError);
    const text3 = callData3.result?.content?.[0]?.text;
    console.log("localbridge_process_list snippet:", text3?.slice(0, 80));

    // G. tools/call localbridge_git_status on git-p1b-test
    console.log("Calling localbridge_git_status on git-p1b-test...");
    const callRes4 = await fetch(`${bridgeUrl}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: {
          name: "localbridge_git_status",
          arguments: { projectId: "git-p1b-test" },
        },
      }),
    });
    const callData4 = await callRes4.json();
    console.log("localbridge_git_status isError:", callData4.result?.isError);
    const text4 = callData4.result?.content?.[0]?.text;
    console.log("localbridge_git_status snippet:", text4?.slice(0, 80));

    console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
  } finally {
    child.kill("SIGKILL");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
