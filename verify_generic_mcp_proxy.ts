import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

async function postJson(urlStr: string, body: any, headers: Record<string, string> = {}): Promise<any> {
  const url = new URL(urlStr);
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, raw: buf });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function getJson(urlStr: string): Promise<any> {
  const url = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "GET" }, (res) => {
      let buf = "";
      res.on("data", (chunk) => (buf += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(buf) });
        } catch {
          resolve({ status: res.statusCode, raw: buf });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("=== PHASE 4: GENERIC EXTERNAL MCP PROXY E2E VERIFICATION ===");
  const results: Record<string, any> = {};

  // 1. Check Canonical 332 SHA-256
  const canonicalPath = "E:/workspace/cod/packages/protocol/src/tools/canonical-registry.ts";
  const canonicalContent = fs.readFileSync(canonicalPath, "utf-8");
  const canonicalHash = crypto.createHash("sha256").update(canonicalContent).digest("hex").toUpperCase();
  const EXPECTED_HASH = "28C1C7F4459BDAE61C41A2511FD225A0E4C987101FCDA14B6B50AF85ED859796";
  const hashPass = canonicalHash === EXPECTED_HASH;
  results["Canonical_332_Frozen"] = {
    pass: hashPass,
    hash: canonicalHash,
    expected: EXPECTED_HASH,
  };
  console.log(`[1] Canonical 332 SHA-256: ${hashPass ? "PASS" : "FAIL"} (${canonicalHash})`);

  // 2. Health check on Bridge (:8787)
  const healthRes = await getJson("http://127.0.0.1:8787/health");
  console.log(`[2] Bridge Health (:8787): ${healthRes.status === 200 ? "PASS" : "FAIL"}`);
  results["Bridge_Health"] = { pass: healthRes.status === 200, res: healthRes.data };

  // 3. Provider initialization via Bridge
  const initRes = await postJson("http://127.0.0.1:8787/api/unity/gamedev-mcp/initialize", {});
  console.log(`[3] Provider Initialize: ${initRes.data?.success ? "PASS" : "FAIL"} (${initRes.data?.toolCount} tools discovered)`);
  results["Provider_Initialize"] = initRes.data;

  // 4. Downstream tools via Bridge API (:8787/api/unity/gamedev-mcp/tools)
  const toolsRes = await getJson("http://127.0.0.1:8787/api/unity/gamedev-mcp/tools");
  const toolCount = toolsRes.data?.tools?.length || 0;
  console.log(`[4] Provider Dynamic Tools: ${toolCount > 0 ? "PASS" : "FAIL"} (Count = ${toolCount})`);
  results["Dynamic_Tool_Count"] = toolCount;

  const AUTH_HEADER = {
    Authorization: "Bearer gemini-spark-nexus-secure-token-2026",
    Accept: "application/json, text/event-stream",
  };

  // 5. MCP Gateway tools/list (:8787/mcp)
  const mcpListReq = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  };
  const mcpListRes = await postJson("http://127.0.0.1:8787/mcp", mcpListReq, AUTH_HEADER);
  const exposedTools = mcpListRes.data?.result?.tools || [];
  
  // Verify clean tool names and no metadata pollution
  const hasGameObjectCreate = exposedTools.some((t: any) => t.name === "gameobject-create");
  const hasSceneGetData = exposedTools.some((t: any) => t.name === "scene-get-data");
  const hasGameObjectFind = exposedTools.some((t: any) => t.name === "gameobject-find");
  const hasForcedNamespace = exposedTools.some((t: any) => t.name.startsWith("unity-gamedev::"));
  const hasPollutedDescription = exposedTools.some((t: any) => 
    t.description && (t.description.includes("[Unity Native Tool]") || t.description.includes("Fast/Deep"))
  );

  console.log(`[5] MCP Gateway tools/list:`);
  console.log(`    Total Exposed: ${exposedTools.length}`);
  console.log(`    gameobject-create clean: ${hasGameObjectCreate}`);
  console.log(`    scene-get-data clean: ${hasSceneGetData}`);
  console.log(`    gameobject-find clean: ${hasGameObjectFind}`);
  console.log(`    No forced unity-gamedev:: namespace: ${!hasForcedNamespace}`);
  console.log(`    No description metadata pollution: ${!hasPollutedDescription}`);

  results["MCP_Gateway_ToolsList"] = {
    pass: hasGameObjectCreate && hasSceneGetData && !hasForcedNamespace && !hasPollutedDescription,
    totalExposed: exposedTools.length,
    sampleTools: exposedTools.slice(0, 5).map((t: any) => ({ name: t.name, description: t.description?.slice(0, 50) })),
  };

  // 6. Test Object Lifecycle via MCP Gateway (:8787/mcp tools/call)
  const TEST_NAME = "Phase4_GenericMCP_TestObject";

  // Step 6a: Create GameObject
  console.log(`[6a] Calling tools/call: gameobject-create ('${TEST_NAME}')...`);
  const createReq = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "gameobject-create",
      arguments: { name: TEST_NAME },
    },
  };
  const createRes = await postJson("http://127.0.0.1:8787/mcp", createReq, AUTH_HEADER);
  console.log(`     Create Result:`, JSON.stringify(createRes.data?.result || createRes.data).slice(0, 150));

  let createdInstanceId = 0;
  try {
    const text = createRes.data?.result?.content?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      createdInstanceId = parsed.result?.instanceID || 0;
      console.log(`     Parsed created instanceID: ${createdInstanceId}`);
    }
  } catch {}

  // Step 6b: Find GameObject (Positive Verification)
  console.log(`[6b] Calling tools/call: gameobject-find ('${TEST_NAME}' / instanceID: ${createdInstanceId})...`);
  const findReq = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "gameobject-find",
      arguments: {
        gameObjectRef: {
          instanceID: createdInstanceId,
          name: TEST_NAME,
        },
      },
    },
  };
  const findRes = await postJson("http://127.0.0.1:8787/mcp", findReq, AUTH_HEADER);
  const findOutput = JSON.stringify(findRes.data?.result || findRes.data);
  const foundPositive = findOutput.includes(TEST_NAME) || (createdInstanceId !== 0 && findOutput.includes(String(createdInstanceId)));
  console.log(`     Find Result (Positive): ${foundPositive ? "CONFIRMED" : "NOT FOUND"} -> ${findOutput.slice(0, 150)}`);

  // Step 6c: Independent Verification via scene-get-data
  console.log(`[6c] Calling tools/call: scene-get-data (includeRootGameObjects: true)...`);
  const sceneReq = {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "scene-get-data",
      arguments: {
        includeRootGameObjects: true,
      },
    },
  };
  const sceneRes = await postJson("http://127.0.0.1:8787/mcp", sceneReq, AUTH_HEADER);
  const sceneOutput = JSON.stringify(sceneRes.data?.result || sceneRes.data);
  const sceneConfirmed = sceneOutput.includes(TEST_NAME) || (createdInstanceId !== 0 && sceneOutput.includes(String(createdInstanceId)));
  console.log(`     Scene Verification: ${sceneConfirmed ? "CONFIRMED IN SCENE" : "NOT IN SCENE"} -> ${sceneOutput.slice(0, 150)}`);

  // Step 6d: Destroy GameObject (Cleanup)
  console.log(`[6d] Calling tools/call: gameobject-destroy (instanceID: ${createdInstanceId})...`);
  const destroyReq = {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "gameobject-destroy",
      arguments: {
        gameObjectRef: {
          instanceID: createdInstanceId,
        },
      },
    },
  };
  const destroyRes = await postJson("http://127.0.0.1:8787/mcp", destroyReq, AUTH_HEADER);
  console.log(`     Destroy Result:`, JSON.stringify(destroyRes.data?.result || destroyRes.data).slice(0, 150));

  // Step 6e: Find GameObject (Negative Verification)
  console.log(`[6e] Calling tools/call: gameobject-find (instanceID: ${createdInstanceId}) [Negative Assert]...`);
  const findNegReq = {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "gameobject-find",
      arguments: {
        gameObjectRef: {
          instanceID: createdInstanceId,
        },
      },
    },
  };
  const findNegRes = await postJson("http://127.0.0.1:8787/mcp", findNegReq, AUTH_HEADER);
  const findNegOutput = JSON.stringify(findNegRes.data?.result || findNegRes.data);
  // Negative assert: should either return empty list, null, not found, or error
  const foundNegative = !findNegOutput.includes(`"name":"${TEST_NAME}"`) && !findNegOutput.includes(`"name": "${TEST_NAME}"`);
  console.log(`     Negative Assertion: ${foundNegative ? "CONFIRMED DESTROYED (ABSENT)" : "STILL PRESENT"} -> ${findNegOutput.slice(0, 150)}`);

  results["E2E_Lifecycle"] = {
    created: Boolean(createRes.data?.result),
    foundPositive,
    sceneConfirmed,
    destroyed: Boolean(destroyRes.data?.result),
    foundNegative,
  };

  // 7. Dynamic Provider Runtime Registration
  console.log(`[7] Testing dynamic provider catalog update at runtime...`);
  const catalogSnapshot = await getJson("http://127.0.0.1:8787/api/unity/tools/refresh");
  console.log(`     Catalog Refresh:`, catalogSnapshot.status === 200 ? "PASS" : "FAIL");
  results["Dynamic_Catalog_Refresh"] = catalogSnapshot.data;

  console.log("\n=== FINAL RESULTS SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync(
    "E:/workspace/cod/verification_report.json",
    JSON.stringify(results, null, 2)
  );
}

main().catch((err) => {
  console.error("FATAL ERROR in verification:", err);
  process.exit(1);
});
