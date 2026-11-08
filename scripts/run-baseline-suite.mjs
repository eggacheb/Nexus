/**
 * Nexus Token Optimization - Baseline Measurement Suite
 * 
 * Runs 3 standard scenarios (Browser, Windows Ops, Unity) against the live
 * Nexus Bridge before P0 optimization, logging every roundtrip and payload size.
 */

import fs from "node:fs";
import path from "node:path";

const BRIDGE_URL = "http://127.0.0.1:8787/mcp";
const BRIDGE_TOKEN = "gemini-spark-nexus-secure-token-2026";
const LOG_FILE = "E:/workspace/cod/nexus-token-telemetry.jsonl";
const BASELINE_FILE = "E:/workspace/cod/baseline_token_metrics.json";

function parseSSEData(text) {
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      try {
        return JSON.parse(trimmed.slice(6));
      } catch {}
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function callTool(toolName, args = {}, id = 1) {
  const t0 = Date.now();
  const res = await fetch(BRIDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  const rawText = await res.text();
  const durationMs = Date.now() - t0;
  const parsed = parseSSEData(rawText);
  const result = parsed?.result || parsed;

  let contentChars = 0;
  let contentBytes = 0;
  if (Array.isArray(result?.content)) {
    for (const item of result.content) {
      if (item && typeof item.text === "string") {
        contentChars += item.text.length;
        contentBytes += Buffer.byteLength(item.text, "utf8");
      }
    }
  }

  let structuredContentChars = 0;
  let structuredContentBytes = 0;
  if (result?.structuredContent !== undefined && result?.structuredContent !== null) {
    const sc = typeof result.structuredContent === "string" 
      ? result.structuredContent 
      : JSON.stringify(result.structuredContent);
    structuredContentChars = sc.length;
    structuredContentBytes = Buffer.byteLength(sc, "utf8");
  }

  const serialized = JSON.stringify(result ?? {});
  const totalChars = serialized.length;
  const totalBytes = Buffer.byteLength(serialized, "utf8");
  const isError = Boolean(result?.isError);

  return {
    tool: toolName,
    arguments: args,
    httpStatus: res.status,
    isError,
    success: res.status === 200 && !isError,
    durationMs,
    contentChars,
    contentBytes,
    structuredContentChars,
    structuredContentBytes,
    totalChars,
    totalBytes,
    rawResult: result,
  };
}

async function run() {
  console.log("================================================================================");
  console.log("NEXUS TOKEN OPTIMIZATION - PRE-OPTIMIZATION BASELINE TEST SUITE");
  console.log("================================================================================\n");

  // Rotate/clear current telemetry log for clean run
  if (fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "", "utf8");
  }

  const baselineReport = {
    executedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      bridgeUrl: BRIDGE_URL,
    },
    scenarios: {},
    summary: {},
  };

  let globalTotalChars = 0;
  let globalTotalBytes = 0;
  let globalContentChars = 0;
  let globalStructuredContentChars = 0;
  let globalRoundtrips = 0;
  let globalSuccessCount = 0;

  // -------------------------------------------------------------------------
  // Scenario 1: 浏览器自动化场景 (Browser Automation)
  // -------------------------------------------------------------------------
  console.log(">>> Scenario 1: 浏览器 (Browser Automation) 场景...");
  const browserSteps = [];

  // Step 1.1: 紧凑模式工具发现 (limit=30, detail=false)
  console.log("  [Step 1.1] nexus_discover_tools (query='browser', limit=30, detail=false)");
  const b1 = await callTool("nexus_discover_tools", { query: "browser", limit: 30, detail: false }, 1);
  browserSteps.push({ step: "discover_browser_compact", ...b1 });
  console.log(`    -> Success: ${b1.success}, TotalChars: ${b1.totalChars}, ContentChars: ${b1.contentChars}, SC_Chars: ${b1.structuredContentChars}`);

  // Step 1.2: 详细模式工具发现 (limit=30, detail=true)
  console.log("  [Step 1.2] nexus_discover_tools (query='browser', limit=30, detail=true)");
  const b2 = await callTool("nexus_discover_tools", { query: "browser", limit: 30, detail: true }, 2);
  browserSteps.push({ step: "discover_browser_detailed", ...b2 });
  console.log(`    -> Success: ${b2.success}, TotalChars: ${b2.totalChars}, ContentChars: ${b2.contentChars}, SC_Chars: ${b2.structuredContentChars}`);

  // Step 1.3: Python 脚本调用：探测 nexus.browser 命名空间
  console.log("  [Step 1.3] nexus_run_script (dir(nexus.browser))");
  const b3 = await callTool("nexus_run_script", {
    runtime: "python",
    script: "import nexus\nprint('Browser namespace attributes:', [a for a in dir(nexus.browser) if not a.startswith('_')])",
  }, 3);
  browserSteps.push({ step: "script_browser_dir", ...b3 });
  console.log(`    -> Success: ${b3.success}, TotalChars: ${b3.totalChars}, ContentChars: ${b3.contentChars}`);

  // Step 1.4: 动作执行：获取浏览器会话列表
  console.log("  [Step 1.4] nexus_execute_action (localbridge_browser_list)");
  const b4 = await callTool("nexus_execute_action", {
    tool: "localbridge_browser_list",
    arguments: {},
  }, 4);
  browserSteps.push({ step: "action_browser_list", ...b4 });
  console.log(`    -> Success: ${b4.success}, TotalChars: ${b4.totalChars}, ContentChars: ${b4.contentChars}`);

  baselineReport.scenarios.browser = {
    steps: browserSteps,
    roundtrips: browserSteps.length,
    successRate: `${(browserSteps.filter(s => s.success).length / browserSteps.length * 100).toFixed(1)}%`,
    totalChars: browserSteps.reduce((acc, s) => acc + s.totalChars, 0),
    totalBytes: browserSteps.reduce((acc, s) => acc + s.totalBytes, 0),
    contentChars: browserSteps.reduce((acc, s) => acc + s.contentChars, 0),
    structuredContentChars: browserSteps.reduce((acc, s) => acc + s.structuredContentChars, 0),
  };

  // -------------------------------------------------------------------------
  // Scenario 2: Windows 运维管理场景 (Windows System Ops)
  // -------------------------------------------------------------------------
  console.log("\n>>> Scenario 2: 运维 (Windows Ops) 场景...");
  const opsSteps = [];

  // Step 2.1: 运维工具发现 (query='system', limit=30, detail=false)
  console.log("  [Step 2.1] nexus_discover_tools (query='system', limit=30, detail=false)");
  const o1 = await callTool("nexus_discover_tools", { query: "system", limit: 30, detail: false }, 5);
  opsSteps.push({ step: "discover_ops_compact", ...o1 });
  console.log(`    -> Success: ${o1.success}, TotalChars: ${o1.totalChars}, ContentChars: ${o1.contentChars}, SC_Chars: ${o1.structuredContentChars}`);

  // Step 2.2: 运维脚本调用：获取系统状态 (CPU/Memory)
  console.log("  [Step 2.2] nexus_run_script (nexus.windows.system_stats())");
  const o2 = await callTool("nexus_run_script", {
    runtime: "python",
    script: "import nexus\nstats = nexus.windows.system_stats()\nprint('System stats:', stats)",
  }, 6);
  opsSteps.push({ step: "script_system_stats", ...o2 });
  console.log(`    -> Success: ${o2.success}, TotalChars: ${o2.totalChars}, ContentChars: ${o2.contentChars}`);

  // Step 2.3: 运维脚本调用：获取端口列表 (localbridge_port_list)
  console.log("  [Step 2.3] nexus_execute_action (localbridge_port_list)");
  const o3 = await callTool("nexus_execute_action", {
    tool: "localbridge_port_list",
    arguments: {},
  }, 7);
  opsSteps.push({ step: "action_port_list", ...o3 });
  console.log(`    -> Success: ${o3.success}, TotalChars: ${o3.totalChars}, ContentChars: ${o3.contentChars}`);

  // Step 2.4: 运维脚本调用：获取进程列表
  console.log("  [Step 2.4] nexus_run_script (nexus.windows.process_list())");
  const o4 = await callTool("nexus_run_script", {
    runtime: "python",
    script: "import nexus\nprocs = nexus.windows.process_list()\nprint(f'Total processes listed: {len(procs)}')",
  }, 8);
  opsSteps.push({ step: "script_process_list", ...o4 });
  console.log(`    -> Success: ${o4.success}, TotalChars: ${o4.totalChars}, ContentChars: ${o4.contentChars}`);

  baselineReport.scenarios.windowsOps = {
    steps: opsSteps,
    roundtrips: opsSteps.length,
    successRate: `${(opsSteps.filter(s => s.success).length / opsSteps.length * 100).toFixed(1)}%`,
    totalChars: opsSteps.reduce((acc, s) => acc + s.totalChars, 0),
    totalBytes: opsSteps.reduce((acc, s) => acc + s.totalBytes, 0),
    contentChars: opsSteps.reduce((acc, s) => acc + s.contentChars, 0),
    structuredContentChars: opsSteps.reduce((acc, s) => acc + s.structuredContentChars, 0),
  };

  // -------------------------------------------------------------------------
  // Scenario 3: Unity 游戏开发场景 (Unity GameDev)
  // -------------------------------------------------------------------------
  console.log("\n>>> Scenario 3: Unity 场景...");
  const unitySteps = [];

  // Step 3.1: Unity 工具发现 (query='unity', limit=30, detail=false)
  console.log("  [Step 3.1] nexus_discover_tools (query='unity', limit=30, detail=false)");
  const u1 = await callTool("nexus_discover_tools", { query: "unity", limit: 30, detail: false }, 9);
  unitySteps.push({ step: "discover_unity_compact", ...u1 });
  console.log(`    -> Success: ${u1.success}, TotalChars: ${u1.totalChars}, ContentChars: ${u1.contentChars}, SC_Chars: ${u1.structuredContentChars}`);

  // Step 3.2: Python 脚本调用：探测 nexus.unity 命名空间
  console.log("  [Step 3.2] nexus_run_script (dir(nexus.unity))");
  const u2 = await callTool("nexus_run_script", {
    runtime: "python",
    script: "import nexus\nattrs = [a for a in dir(nexus.unity) if not a.startswith('_')]\nprint('Unity namespace attributes:', len(attrs), attrs[:10])",
  }, 10);
  unitySteps.push({ step: "script_unity_dir", ...u2 });
  console.log(`    -> Success: ${u2.success}, TotalChars: ${u2.totalChars}, ContentChars: ${u2.contentChars}`);

  // Step 3.3: Unity 场景列表查询
  console.log("  [Step 3.3] nexus_run_script (nexus.unity.scene_list_opened())");
  const u3 = await callTool("nexus_run_script", {
    runtime: "python",
    script: "import nexus\ntry:\n    res = nexus.unity.scene_list_opened()\n    print('Opened scenes:', res)\nexcept Exception as e:\n    print('Unity scene query error:', e)",
  }, 11);
  unitySteps.push({ step: "script_unity_scene_list", ...u3 });
  console.log(`    -> Success: ${u3.success}, TotalChars: ${u3.totalChars}, ContentChars: ${u3.contentChars}`);

  // Step 3.4: Unity 层级树查询 (如可用)
  console.log("  [Step 3.4] nexus_run_script (nexus.unity.scene_hierarchy_get())");
  const u4 = await callTool("nexus_run_script", {
    runtime: "python",
    script: "import nexus\ntry:\n    h = nexus.unity.scene_hierarchy_get()\n    print('Hierarchy retrieved, items:', len(h) if isinstance(h, list) else 'ok')\nexcept Exception as e:\n    print('Hierarchy query result:', e)",
  }, 12);
  unitySteps.push({ step: "script_unity_hierarchy", ...u4 });
  console.log(`    -> Success: ${u4.success}, TotalChars: ${u4.totalChars}, ContentChars: ${u4.contentChars}`);

  baselineReport.scenarios.unity = {
    steps: unitySteps,
    roundtrips: unitySteps.length,
    successRate: `${(unitySteps.filter(s => s.success).length / unitySteps.length * 100).toFixed(1)}%`,
    totalChars: unitySteps.reduce((acc, s) => acc + s.totalChars, 0),
    totalBytes: unitySteps.reduce((acc, s) => acc + s.totalBytes, 0),
    contentChars: unitySteps.reduce((acc, s) => acc + s.contentChars, 0),
    structuredContentChars: unitySteps.reduce((acc, s) => acc + s.structuredContentChars, 0),
  };

  // -------------------------------------------------------------------------
  // Overall Summary
  // -------------------------------------------------------------------------
  const allSteps = [...browserSteps, ...opsSteps, ...unitySteps];
  globalTotalChars = allSteps.reduce((acc, s) => acc + s.totalChars, 0);
  globalTotalBytes = allSteps.reduce((acc, s) => acc + s.totalBytes, 0);
  globalContentChars = allSteps.reduce((acc, s) => acc + s.contentChars, 0);
  globalStructuredContentChars = allSteps.reduce((acc, s) => acc + s.structuredContentChars, 0);
  globalRoundtrips = allSteps.length;
  globalSuccessCount = allSteps.filter(s => s.success).length;

  baselineReport.summary = {
    totalRoundtrips: globalRoundtrips,
    successfulRoundtrips: globalSuccessCount,
    overallSuccessRate: `${(globalSuccessCount / globalRoundtrips * 100).toFixed(1)}%`,
    globalContentChars,
    globalStructuredContentChars,
    globalTotalChars,
    globalTotalBytes,
  };

  // Persist baseline to disk
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baselineReport, null, 2), "utf8");
  console.log("\n================================================================================");
  console.log("BASELINE MEASUREMENT COMPLETE");
  console.log(`Saved baseline to: ${BASELINE_FILE}`);
  console.log(`Telemetry log: ${LOG_FILE}`);
  console.log("Summary:");
  console.log(`  Total Roundtrips: ${globalRoundtrips} (${globalSuccessCount}/${globalRoundtrips} success)`);
  console.log(`  Total Payload Chars: ${globalTotalChars.toLocaleString()} chars`);
  console.log(`  Content Chars: ${globalContentChars.toLocaleString()} chars`);
  console.log(`  StructuredContent Chars: ${globalStructuredContentChars.toLocaleString()} chars`);
  console.log(`  Total Bytes: ${globalTotalBytes.toLocaleString()} bytes`);
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("Baseline run failed:", err);
  process.exit(1);
});
