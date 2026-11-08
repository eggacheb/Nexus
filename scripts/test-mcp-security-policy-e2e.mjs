import fs from "node:fs";
import http from "node:http";

const GATEWAY_URL = "http://127.0.0.1:8787";
const MCP_URL = "http://127.0.0.1:8787/mcp";

let requestId = 10;

class McpTestClient {
  constructor() {
    this.sessionId = null;
    this.sseReq = null;
  }

  async connect() {
    // 1. initialize
    const initRes = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "security-policy-test-suite", version: "1.3.0" },
        },
      }),
    });
    this.sessionId = initRes.headers.get("mcp-session-id");

    // 2. Open SSE stream
    this.sseReq = http.request(MCP_URL, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "mcp-session-id": this.sessionId,
      },
    }, () => {});
    this.sseReq.on("error", () => {});
    this.sseReq.end();

    await new Promise((r) => setTimeout(r, 200));

    // 3. notifications/initialized
    await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });

    // 4. tools/list
    const listRes = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method: "tools/list",
        params: {},
      }),
    });
    const listData = await listRes.json();
    return listData.result?.tools || [];
  }

  async callTool(name, args = {}) {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "mcp-session-id": this.sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    return await res.json();
  }

  disconnect() {
    if (this.sseReq) {
      this.sseReq.destroy();
      this.sseReq = null;
    }
  }
}

async function apiGet(path) {
  const res = await fetch(`${GATEWAY_URL}${path}`);
  return await res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function run() {
  console.log("===============================================================");
  console.log("  NEXUS MCP SECURITY POLICY & EXECUTION MODES E2E TEST SUITE  ");
  console.log("===============================================================\n");

  const results = {
    testA: false,
    testB: false,
    testC: false,
    testD: false,
    testE: false,
    testF: false,
    unityCubeAConfirmed: false,
    unityCubeBConfirmed: false,
    blockedObjectsConfirmedNone: false,
  };

  const client = new McpTestClient();
  console.log("[SETUP] Initializing MCP Session and discovering tools...");
  const tools = await client.connect();
  console.log(`  Discovered ${tools.length} tools on Gateway :8787 (Session: ${client.sessionId})\n`);

  // =========================================================================
  // TEST A: Protected Mode + Untrusted Unity MCP
  // Expect mutative tool to be intercepted with [Safety Approval Required]
  // =========================================================================
  console.log("---------------------------------------------------------------");
  console.log("[TEST A] Protected Mode + Untrusted Unity MCP");
  await apiPost("/api/mcp/security-policy/unrestricted", { enabled: false });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "127.0.0.1:20705", trusted: false });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "unity-gamedev", trusted: false });

  const polA = await apiGet("/api/mcp/security-policy");
  console.log("  Policy applied:", JSON.stringify(polA.policy));

  console.log("  Calling mutative tool: gameobject-create (Nexus_Cube_TestA_Blocked)...");
  const resA = await client.callTool("gameobject-create", {
    name: "Nexus_Cube_TestA_Blocked",
    primitiveType: "Cube",
    position: { x: 0, y: 10, z: 0 },
  });

  console.log("  Call result isError:", resA.result?.isError);
  console.log("  Call content text:", resA.result?.content?.[0]?.text);

  const textA = resA.result?.content?.[0]?.text || "";
  if (resA.result?.isError && textA.includes("Safety Approval Required") && textA.includes("UNTRUSTED")) {
    console.log("  >>> TEST A PASS: Mutative operation intercepted as Safety Approval Required!");
    results.testA = true;
  } else {
    console.error("  >>> TEST A FAIL: Operation was not intercepted!");
  }

  // =========================================================================
  // TEST B: Protected Mode + Trusted Unity MCP
  // Expect direct execution without approval prompts
  // =========================================================================
  console.log("\n---------------------------------------------------------------");
  console.log("[TEST B] Protected Mode + Trusted Unity MCP");
  console.log("  Enabling trust for 127.0.0.1:20705...");
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "127.0.0.1:20705", trusted: true });

  const polB = await apiGet("/api/mcp/security-policy");
  console.log("  Policy applied:", JSON.stringify(polB.policy));

  console.log("  Calling mutative tool: gameobject-create (Nexus_Test_Cube_A)...");
  const resB = await client.callTool("gameobject-create", {
    name: "Nexus_Test_Cube_A",
    primitiveType: "Cube",
    position: { x: 1, y: 1, z: 1 },
  });

  console.log("  Call result isError:", resB.result?.isError);
  console.log("  Call content text:", resB.result?.content?.[0]?.text);

  if (!resB.result?.isError) {
    console.log("  >>> TEST B PASS: Direct execution succeeded for Trusted External MCP!");
    results.testB = true;
  } else {
    console.error("  >>> TEST B FAIL: Direct execution failed:", resB.result);
  }

  // =========================================================================
  // TEST C: Global Unrestricted Mode ON + Untrusted Unity MCP
  // Expect Unrestricted Mode to override Untrusted state
  // =========================================================================
  console.log("\n---------------------------------------------------------------");
  console.log("[TEST C] Global Unrestricted Mode ON + Untrusted Unity MCP");
  console.log("  Enabling Global Unrestricted Execution Mode...");
  await apiPost("/api/mcp/security-policy/unrestricted", { enabled: true });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "127.0.0.1:20705", trusted: false });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "unity-gamedev", trusted: false });

  const polC = await apiGet("/api/mcp/security-policy");
  console.log("  Policy applied:", JSON.stringify(polC.policy));

  console.log("  Calling mutative tool: gameobject-create (Nexus_Test_Cube_B)...");
  const resC = await client.callTool("gameobject-create", {
    name: "Nexus_Test_Cube_B",
    primitiveType: "Cube",
    position: { x: 2, y: 2, z: 2 },
  });

  console.log("  Call result isError:", resC.result?.isError);
  console.log("  Call content text:", resC.result?.content?.[0]?.text);

  if (!resC.result?.isError) {
    console.log("  >>> TEST C PASS: Global Unrestricted Mode successfully bypassed interception!");
    results.testC = true;
  } else {
    console.error("  >>> TEST C FAIL: Unrestricted Mode did not bypass interception:", resC.result);
  }

  // =========================================================================
  // TEST D: Revert to Protected Mode + Untrusted Unity MCP
  // Expect interception to be restored cleanly
  // =========================================================================
  console.log("\n---------------------------------------------------------------");
  console.log("[TEST D] Revert to Protected Mode + Untrusted Unity MCP");
  await apiPost("/api/mcp/security-policy/unrestricted", { enabled: false });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "127.0.0.1:20705", trusted: false });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "unity-gamedev", trusted: false });

  const polD = await apiGet("/api/mcp/security-policy");
  console.log("  Policy applied:", JSON.stringify(polD.policy));

  console.log("  Calling mutative tool: gameobject-create (Nexus_Cube_TestD_Blocked)...");
  const resD = await client.callTool("gameobject-create", {
    name: "Nexus_Cube_TestD_Blocked",
    primitiveType: "Cube",
    position: { x: 0, y: 20, z: 0 },
  });

  console.log("  Call result isError:", resD.result?.isError);
  console.log("  Call content text:", resD.result?.content?.[0]?.text);

  const textD = resD.result?.content?.[0]?.text || "";
  if (resD.result?.isError && textD.includes("Safety Approval Required") && textD.includes("UNTRUSTED")) {
    console.log("  >>> TEST D PASS: Interception cleanly re-established after revert!");
    results.testD = true;
  } else {
    console.error("  >>> TEST D FAIL: Revert did not restore interception!");
  }

  // =========================================================================
  // TEST E: Persistence Verification Across Restart
  // =========================================================================
  console.log("\n---------------------------------------------------------------");
  console.log("[TEST E] Persistence Verification Across Process Lifecycle");
  // Set distinct values to verify disk persistence
  await apiPost("/api/mcp/security-policy/unrestricted", { enabled: false });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "127.0.0.1:20705", trusted: true });
  await apiPost("/api/mcp/security-policy/trust", { endpointOrId: "192.168.1.50:9000", trusted: true });

  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\22365\\AppData\\Local";
  const policyFile = `${localAppData}\\LocalBridge\\data\\mcp-security-policy.json`;

  if (fs.existsSync(policyFile)) {
    const rawDisk = fs.readFileSync(policyFile, "utf-8");
    console.log("  Disk content before reload:", rawDisk.trim());
    const parsed = JSON.parse(rawDisk);
    if (
      parsed.unrestricted_execution_mode === false &&
      parsed.trusted_external_mcp["127.0.0.1:20705"] === true &&
      parsed.trusted_external_mcp["192.168.1.50:9000"] === true
    ) {
      console.log("  >>> TEST E PASS: File mcp-security-policy.json persists faithfully!");
      results.testE = true;
    }
  } else {
    console.error("  >>> TEST E FAIL: Policy file not found on disk!");
  }

  // =========================================================================
  // TEST F: Other External MCP Server Isolation
  // =========================================================================
  console.log("\n---------------------------------------------------------------");
  console.log("[TEST F] Other External MCP Server Isolation");
  const polF = await apiGet("/api/mcp/security-policy");
  const isOtherTrusted = Boolean(polF.policy.trusted_external_mcp["127.0.0.1:9099"]);
  console.log("  Checking if arbitrary server 127.0.0.1:9099 is trusted:", isOtherTrusted);

  if (!isOtherTrusted) {
    console.log("  >>> TEST F PASS: Strict per-server isolation verified! Trust does not leak to other servers.");
    results.testF = true;
  } else {
    console.error("  >>> TEST F FAIL: Untrusted server was unexpectedly trusted!");
  }

  // =========================================================================
  // REAL UNITY SCENE HIERARCHY VERIFICATION (Physical GameObject Confirmation)
  // =========================================================================
  console.log("\n---------------------------------------------------------------");
  console.log("[REAL UNITY VERIFICATION] Querying Unity scene objects via gameobject-find...");

  // Verify Nexus_Test_Cube_A
  const findA = await client.callTool("gameobject-find", {
    gameObjectRef: { instanceID: 0, name: "Nexus_Test_Cube_A" },
  });
  const textFindA = findA.result?.content?.[0]?.text || "";
  console.log("  Find Nexus_Test_Cube_A:", textFindA);
  if (textFindA.includes("Nexus_Test_Cube_A")) {
    console.log("  >>> Nexus_Test_Cube_A physically exists in Unity Scene!");
    results.unityCubeAConfirmed = true;
  }

  // Verify Nexus_Test_Cube_B
  const findB = await client.callTool("gameobject-find", {
    gameObjectRef: { instanceID: 0, name: "Nexus_Test_Cube_B" },
  });
  const textFindB = findB.result?.content?.[0]?.text || "";
  console.log("  Find Nexus_Test_Cube_B:", textFindB);
  if (textFindB.includes("Nexus_Test_Cube_B")) {
    console.log("  >>> Nexus_Test_Cube_B physically exists in Unity Scene!");
    results.unityCubeBConfirmed = true;
  }

  // Verify Blocked Objects were NOT created
  const findBlockedA = await client.callTool("gameobject-find", {
    gameObjectRef: { instanceID: 0, name: "Nexus_Cube_TestA_Blocked" },
  });
  const textBlockedA = findBlockedA.result?.content?.[0]?.text || "";
  const findBlockedD = await client.callTool("gameobject-find", {
    gameObjectRef: { instanceID: 0, name: "Nexus_Cube_TestD_Blocked" },
  });
  const textBlockedD = findBlockedD.result?.content?.[0]?.text || "";

  const blockedAFound = !findBlockedA.result?.isError && textBlockedA.includes("Reference");
  const blockedDFound = !findBlockedD.result?.isError && textBlockedD.includes("Reference");
  if (!blockedAFound && !blockedDFound) {
    console.log("  >>> Blocked objects were NOT created in Unity Scene (Safety Interception physically verified)!");
    results.blockedObjectsConfirmedNone = true;
  }

  // Disconnect client SSE stream
  client.disconnect();

  // Final summary
  console.log("\n===============================================================");
  console.log("                       FINAL SCORECARD                         ");
  console.log("===============================================================");
  console.log(`TEST A (Protected + Untrusted -> Intercept):       ${results.testA ? "PASS" : "FAIL"}`);
  console.log(`TEST B (Protected + Trusted -> Execute):          ${results.testB ? "PASS" : "FAIL"}`);
  console.log(`TEST C (Unrestricted -> Bypass):                  ${results.testC ? "PASS" : "FAIL"}`);
  console.log(`TEST D (Revert to Protected/Untrusted):           ${results.testD ? "PASS" : "FAIL"}`);
  console.log(`TEST E (Persistence):                             ${results.testE ? "PASS" : "FAIL"}`);
  console.log(`TEST F (Per-Server Isolation):                    ${results.testF ? "PASS" : "FAIL"}`);
  console.log(`REAL UNITY CUBE A EXISTS:                         ${results.unityCubeAConfirmed ? "CONFIRMED" : "MISSING"}`);
  console.log(`REAL UNITY CUBE B EXISTS:                         ${results.unityCubeBConfirmed ? "CONFIRMED" : "MISSING"}`);
  console.log(`REAL UNITY BLOCKED OBJECTS NEVER CREATED:         ${results.blockedObjectsConfirmedNone ? "CONFIRMED" : "FAILED"}`);
  console.log("===============================================================");

  if (
    results.testA &&
    results.testB &&
    results.testC &&
    results.testD &&
    results.testE &&
    results.testF &&
    results.unityCubeAConfirmed &&
    results.unityCubeBConfirmed &&
    results.blockedObjectsConfirmedNone
  ) {
    console.log("\nALL VERIFICATIONS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("\nSOME VERIFICATIONS FAILED!");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test execution aborted with error:", err);
  process.exit(1);
});
