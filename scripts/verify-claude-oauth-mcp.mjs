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

const results = [];

function record(step, status, details, passed) {
  results.push({ step, status, details, passed });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${step}: HTTP ${status} - ${details}`);
}

async function run() {
  console.log("=== Starting Complete Claude OAuth & MCP Protocol Regression ===");

  // 1. Protected Resource Metadata
  try {
    const res = await fetch(`${PUBLIC_URL}/.well-known/oauth-protected-resource`);
    const data = await res.json();
    const ok = res.status === 200 && data.authorization_servers.includes(PUBLIC_URL);
    record("1. Protected Resource Metadata", res.status, JSON.stringify(data), ok);
  } catch (err) {
    record("1. Protected Resource Metadata", 0, err.message, false);
  }

  // 2. Authorization Server Metadata
  try {
    const res = await fetch(`${PUBLIC_URL}/.well-known/oauth-authorization-server`);
    const data = await res.json();
    const ok = res.status === 200 && data.issuer === PUBLIC_URL && data.registration_endpoint === `${PUBLIC_URL}/oauth/register`;
    record("2. Authorization Server Metadata", res.status, `issuer=${data.issuer}, reg=${data.registration_endpoint}`, ok);
  } catch (err) {
    record("2. Authorization Server Metadata", 0, err.message, false);
  }

  // 3a. DCR Malicious Domain Rejection (Negative test)
  try {
    const res = await fetch(`${PUBLIC_URL}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Evil Attacker App",
        redirect_uris: ["https://evil-attacker.com/oauth/callback"],
        grant_types: ["authorization_code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const data = await res.json();
    const ok = res.status === 400 && data.error === "invalid_client_metadata" && data.error_description.includes("Forbidden redirect_uri");
    record("3a. DCR Rejection (evil-attacker.com)", res.status, data.error_description || JSON.stringify(data), ok);
  } catch (err) {
    record("3a. DCR Rejection (evil-attacker.com)", 0, err.message, false);
  }

  // 3b. DCR Claude Official Domain Registration (Positive test)
  let claudeClientId = null;
  const claudeRedirectUri = "https://claude.ai/api/mcp/oauth_callback";
  try {
    const res = await fetch(`${PUBLIC_URL}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude",
        redirect_uris: [claudeRedirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const data = await res.json();
    claudeClientId = data.client_id;
    const ok = res.status === 201 && Boolean(claudeClientId) && data.redirect_uris.includes(claudeRedirectUri);
    record("3b. DCR Claude Registration (claude.ai)", res.status, `client_id=${claudeClientId}`, ok);
  } catch (err) {
    record("3b. DCR Claude Registration (claude.ai)", 0, err.message, false);
  }

  // 4. Authorization Code flow with PKCE S256
  let authCode = null;
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(sha256(codeVerifier));
  const state = "state_claude_" + crypto.randomBytes(8).toString("hex");

  try {
    // 4.1 Initiate Auth Request with action: approve and Accept: application/json
    const res = await fetch(`${PUBLIC_URL}/oauth/authorize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        action: "approve",
        client_id: claudeClientId,
        redirect_uri: claudeRedirectUri,
        response_type: "code",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        scope: "nexus:read nexus:project",
        state,
      }),
    });
    const data = await res.json();
    const requestId = data.requestId;
    console.log(`-> Auth Request Created: ${requestId} (pairingCode: ${data.pairingCode})`);

    // 4.2 Loopback Approval via Management Token
    const resolveRes = await fetch(`${LOCAL_URL}/oauth/requests/${requestId}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mgmtToken}`,
      },
      body: JSON.stringify({
        action: "approve",
        pairing_code: data.pairingCode,
      }),
    });
    const resolveData = await resolveRes.json();
    console.log(`-> Auth Request Resolved:`, resolveData);

    // 4.3 Retrieve Auth Code
    const statusRes = await fetch(`${PUBLIC_URL}/oauth/requests/${requestId}/status`);
    const statusData = await statusRes.json();
    authCode = statusData.code;
    const ok = statusRes.status === 200 && Boolean(authCode) && statusData.status === "approved";
    record("4. Authorization Code Retrieved", statusRes.status, `code=${authCode?.substring(0, 15)}...`, ok);
  } catch (err) {
    record("4. Authorization Code Retrieved", 0, err.message, false);
  }

  // 5. Token Exchange
  let accessToken = null;
  try {
    const res = await fetch(`${PUBLIC_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: claudeClientId,
        code: authCode,
        redirect_uri: claudeRedirectUri,
        code_verifier: codeVerifier,
      }),
    });
    const data = await res.json();
    accessToken = data.access_token;
    const ok = res.status === 200 && Boolean(accessToken) && data.token_type === "Bearer";
    record("5. Token Exchange", res.status, `token_type=${data.token_type}, expires_in=${data.expires_in}`, ok);
  } catch (err) {
    record("5. Token Exchange", 0, err.message, false);
  }

  // 6. Bearer /mcp Unauthenticated Check (Must return 401)
  try {
    const res = await fetch(`${PUBLIC_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    const ok = res.status === 401;
    record("6. Unauthenticated /mcp check (401 expected)", res.status, `WWW-Authenticate header present=${Boolean(res.headers.get("www-authenticate"))}`, ok);
  } catch (err) {
    record("6. Unauthenticated /mcp check (401 expected)", 0, err.message, false);
  }

  // 7. MCP initialize with Bearer Token & Accept: application/json, text/event-stream
  let protocolVersion = null;
  try {
    const res = await fetch(`${PUBLIC_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 100,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "Claude-User", version: "1.0" },
        },
      }),
    });
    const data = await res.json();
    protocolVersion = data.result?.protocolVersion;
    const serverName = data.result?.serverInfo?.name;
    const ok = res.status === 200 && data.result && serverName === "nexus-mcp-bridge";
    record("7. MCP initialize", res.status, `server=${serverName}, protocol=${protocolVersion}`, ok);
  } catch (err) {
    record("7. MCP initialize", 0, err.message, false);
  }

  // 8. MCP tools/list
  let toolsCount = 0;
  try {
    const res = await fetch(`${PUBLIC_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 101,
        method: "tools/list",
        params: {},
      }),
    });
    const data = await res.json();
    toolsCount = data.result?.tools?.length || 0;
    const toolNames = data.result?.tools?.map((t) => t.name) || [];
    const hasProjectList = toolNames.includes("nexus_project_list");
    const ok = res.status === 200 && toolsCount > 0 && hasProjectList;
    record("8. MCP tools/list", res.status, `toolsCount=${toolsCount} [${toolNames.join(", ")}]`, ok);
  } catch (err) {
    record("8. MCP tools/list", 0, err.message, false);
  }

  // 9. Actual Nexus MCP Tool Call (nexus_project_list)
  let callResult = null;
  try {
    const res = await fetch(`${PUBLIC_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 102,
        method: "tools/call",
        params: {
          name: "nexus_project_list",
          arguments: {},
        },
      }),
    });
    const data = await res.json();
    callResult = data.result;
    const ok = res.status === 200 && !data.error && data.result?.content?.[0]?.text;
    record("9. MCP Tool Call (nexus_project_list)", res.status, `hasContent=${Boolean(callResult?.content)}`, ok);
  } catch (err) {
    record("9. MCP Tool Call (nexus_project_list)", 0, err.message, false);
  }

  // 10. Verify Tool Output
  try {
    const textOutput = callResult?.content?.[0]?.text || "";
    const parsed = JSON.parse(textOutput);
    const projects = parsed.projects || parsed;
    const isArray = Array.isArray(projects);
    const ok = isArray && projects.length > 0;
    record("10. Verified Real Tool Output", 200, `Found ${projects?.length || 0} projects (e.g., "${projects?.[0]?.name || projects?.[0]?.id}")`, ok);
  } catch (err) {
    record("10. Verified Real Tool Output", 0, err.message, false);
  }

  console.log("\n=== SUMMARY TABLE ===");
  console.table(results.map(r => ({
    "Step": r.step,
    "HTTP Status": r.status,
    "Result": r.passed ? "PASS" : "FAIL",
    "Details": r.details.length > 80 ? r.details.substring(0, 77) + "..." : r.details
  })));

  const allPassed = results.every(r => r.passed);
  console.log(`\nOVERALL PROTOCOL REGRESSION: ${allPassed ? "100% PASS" : "FAILURES DETECTED"}`);
  if (!allPassed) process.exit(1);
}

run().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
