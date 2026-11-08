import fs from "node:fs";
import crypto from "node:crypto";

const PUBLIC_URL = "https://mcp.example.com";
const LOCAL_URL = "http://127.0.0.1:8787";
const MGMT_TOKEN_PATH = "C:\\Users\\22365\\AppData\\Local\\LocalBridge\\data\\management-token.key";
const mgmtToken = fs.readFileSync(MGMT_TOKEN_PATH, "utf-8").trim();

function base64UrlEncode(buffer) {
  return buffer.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) {
        await sleep(1000);
      }
    }
  }
  throw lastErr;
}

async function run() {
  console.log("=== Phase 1 Verification: Claude OAuth HTML & 10s Wait Test ===");

  // 1. DCR for Claude
  const redirectUri = "https://claude.ai/api/mcp/auth_callback";
  console.log("\n[1] Registering Claude via DCR...");
  const regRes = await fetchWithRetry(`${PUBLIC_URL}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const regData = await regRes.json();
  const clientId = regData.client_id;
  console.log(`-> DCR Status: ${regRes.status}, client_id: ${clientId}`);
  if (regRes.status !== 201 || !clientId) throw new Error("DCR Failed");

  // 2. GET /oauth/authorize (Consent screen)
  console.log("\n[2] Requesting Authorization Consent Screen (HTML)...");
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(sha256(codeVerifier));
  const state = "state_" + crypto.randomBytes(8).toString("hex");

  const authUrl = `${PUBLIC_URL}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}&scope=nexus:read+nexus:project`;
  const consentRes = await fetchWithRetry(authUrl, {
    headers: { "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  const consentHtml = await consentRes.text();
  console.log(`-> GET /oauth/authorize Status: ${consentRes.status}`);
  if (consentRes.status !== 200 || !consentHtml.includes("Authorize / 允许授权")) {
    throw new Error("Consent Screen failed to render");
  }

  // 3. User clicks Authorize -> POST /oauth/authorize (HTML flow)
  console.log("\n[3] Submitting Authorization Form (Accept: text/html)...");
  const formBody = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "nexus:read nexus:project",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    action: "approve",
  });

  const postAuthRes = await fetchWithRetry(`${PUBLIC_URL}/oauth/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    body: formBody.toString(),
  });
  const waitHtml = await postAuthRes.text();
  console.log(`-> POST /oauth/authorize Status: ${postAuthRes.status}`);
  if (postAuthRes.status !== 202) {
    throw new Error(`Expected 202 Accepted, got ${postAuthRes.status}`);
  }

  // Verify waitHtml contains Pairing Code and DOES NOT contain meta-refresh
  const hasMetaRefresh = waitHtml.includes("http-equiv=\"refresh\"") || waitHtml.includes("http-equiv='refresh'");
  const matchPairingCode = waitHtml.match(/monospace;\">([0-9]{6})<\/div>/);
  const matchRequestId = waitHtml.match(/\/oauth\/requests\/(oauth_req_[a-f0-9]+)\/status/);
  const pairingCode = matchPairingCode ? matchPairingCode[1] : null;
  const requestId = matchRequestId ? matchRequestId[1] : null;

  console.log(`-> Has <meta http-equiv="refresh">: ${hasMetaRefresh} (MUST BE FALSE)`);
  console.log(`-> Extracted Pairing Code: ${pairingCode}`);
  console.log(`-> Extracted Request ID: ${requestId}`);

  if (hasMetaRefresh) {
    throw new Error("FAIL: waitHtml still contains meta http-equiv refresh tag!");
  }
  if (!pairingCode || !requestId) {
    throw new Error("FAIL: Could not extract pairingCode or requestId from waitHtml");
  }

  // 4. Wait 6 seconds (simulating user looking at pairing code, previously failed at 3s)
  console.log("\n[4] Waiting 6 seconds (testing that page does not reload to 400)...");
  for (let i = 1; i <= 6; i++) {
    await sleep(1000);
    process.stdout.write(`... ${i}s `);
  }
  console.log("\n-> 6 seconds elapsed without automatic reload crash!");

  // Check that the request is still pending
  const checkPendingRes = await fetchWithRetry(`${PUBLIC_URL}/oauth/requests/${requestId}/status`);
  const checkPendingData = await checkPendingRes.json();
  console.log(`-> Request Status after 6s: ${checkPendingData.status} (MUST BE "pending")`);
  if (checkPendingData.status !== "pending") {
    throw new Error(`Expected pending, got ${checkPendingData.status}`);
  }

  // 5. Desktop Approval via loopback
  console.log("\n[5] Approving Request via Desktop Management Token (pairing code: " + pairingCode + ")...");
  const resolveRes = await fetchWithRetry(`${LOCAL_URL}/oauth/requests/${requestId}/resolve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${mgmtToken}`,
    },
    body: JSON.stringify({
      action: "approve",
      pairing_code: pairingCode,
    }),
  });
  const resolveData = await resolveRes.json();
  console.log("-> Resolve Result:", resolveData);
  if (!resolveData.approved || !resolveData.code) {
    throw new Error("Approval resolution failed");
  }

  // 6. Polling status returns approved and redirectUrl
  console.log("\n[6] Polling /oauth/requests/{id}/status (simulating browser JS loop)...");
  const statusRes = await fetchWithRetry(`${PUBLIC_URL}/oauth/requests/${requestId}/status`);
  const statusData = await statusRes.json();
  console.log("-> Status Data:", statusData);
  if (statusData.status !== "approved" || !statusData.redirectUrl) {
    throw new Error("Status polling did not return approved redirectUrl");
  }

  const authCode = statusData.code;
  console.log(`-> Successfully retrieved auth code: ${authCode}`);

  // 7. Token Exchange
  console.log("\n[7] Exchanging code for token via POST /oauth/token...");
  const tokenRes = await fetchWithRetry(`${PUBLIC_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      code: authCode,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const tokenData = await tokenRes.json();
  console.log("-> Token Response:", tokenData);
  if (tokenRes.status !== 200 || !tokenData.access_token) {
    throw new Error("Token exchange failed");
  }

  const accessToken = tokenData.access_token;

  // 8. MCP initialize
  console.log("\n[8] MCP initialize with Bearer token...");
  const initRes = await fetchWithRetry(`${PUBLIC_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "Claude-Desktop", version: "1.0.0" },
      },
    }),
  });
  const initData = await initRes.json();
  console.log("-> MCP initialize:", initData.result);
  if (initRes.status !== 200 || !initData.result?.serverInfo) {
    throw new Error("MCP initialize failed");
  }

  // 9. tools/list
  console.log("\n[9] MCP tools/list...");
  const toolsRes = await fetchWithRetry(`${PUBLIC_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  const toolsData = await toolsRes.json();
  console.log(`-> tools/list count: ${toolsData.result?.tools?.length}`);
  if (toolsRes.status !== 200 || (toolsData.result?.tools?.length || 0) === 0) {
    throw new Error("tools/list failed");
  }

  // 10. Call nexus_project_list
  console.log("\n[10] MCP tools/call nexus_project_list...");
  const callRes = await fetchWithRetry(`${PUBLIC_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "nexus_project_list", arguments: {} },
    }),
  });
  const callData = await callRes.json();
  console.log("-> Tool Call Result:", callData.result?.content?.[0]?.text);
  if (callRes.status !== 200 || !callData.result?.content?.[0]?.text) {
    throw new Error("Tool call failed");
  }

  console.log("\n=== PHASE 1 FULL REAL FLOW VERIFICATION PASSED (100%) ===");
}

run().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
