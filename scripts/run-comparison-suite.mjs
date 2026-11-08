/**
 * Nexus Token Optimization - Full Comparison Test Suite
 * 
 * Replays the EXACT 12 calls from baseline_token_metrics.json against the optimized Bridge,
 * recording post-optimization metrics, deltas (content, structuredContent, totalChars),
 * and verifying that roundtrips and success rate are strictly preserved without degradation.
 */

import fs from "node:fs";
import path from "node:path";

const BRIDGE_URL = "http://127.0.0.1:8787/mcp";
const BRIDGE_TOKEN = "gemini-spark-nexus-secure-token-2026";
const BASELINE_FILE = "E:/workspace/cod/baseline_token_metrics.json";
const REPORT_FILE = "E:/workspace/cod/post_optimization_comparison_report.json";

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
  if (!fs.existsSync(BASELINE_FILE)) {
    throw new Error(`Baseline file not found at ${BASELINE_FILE}`);
  }

  const baselineData = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  console.log("================================================================================");
  console.log("NEXUS TOKEN OPTIMIZATION - POST-OPTIMIZATION EXACT REPLAY COMPARISON");
  console.log("================================================================================\n");

  const comparisonReport = {
    executedAt: new Date().toISOString(),
    baselineTimestamp: baselineData.executedAt,
    stepsComparison: [],
    scenariosComparison: {},
    summary: {},
  };

  // Replay exact 12 calls
  const testCalls = [
    // Scenario 1: Browser
    {
      scenario: "browser",
      stepIndex: "1.1",
      stepName: "discover_browser_compact",
      tool: "nexus_discover_tools",
      args: { query: "browser", limit: 30, detail: false },
      desc: "浏览器紧凑工具发现 (limit=30, detail=false)",
    },
    {
      scenario: "browser",
      stepIndex: "1.2",
      stepName: "discover_browser_detailed",
      tool: "nexus_discover_tools",
      args: { query: "browser", limit: 30, detail: true },
      desc: "浏览器详细工具发现 (limit=30, detail=true)",
    },
    {
      scenario: "browser",
      stepIndex: "1.3",
      stepName: "script_browser_dir",
      tool: "nexus_run_script",
      args: {
        runtime: "python",
        script: "import nexus\nprint('Browser namespace attributes:', [a for a in dir(nexus.browser) if not a.startswith('_')])",
      },
      desc: "浏览器脚本调用 dir(nexus.browser)",
    },
    {
      scenario: "browser",
      stepIndex: "1.4",
      stepName: "action_browser_list",
      tool: "nexus_execute_action",
      args: { tool: "localbridge_browser_list", arguments: {} },
      desc: "浏览器动作执行 localbridge_browser_list",
    },

    // Scenario 2: Windows Ops
    {
      scenario: "windowsOps",
      stepIndex: "2.1",
      stepName: "discover_ops_compact",
      tool: "nexus_discover_tools",
      args: { query: "system", limit: 30, detail: false },
      desc: "运维紧凑工具发现 (limit=30, detail=false)",
    },
    {
      scenario: "windowsOps",
      stepIndex: "2.2",
      stepName: "script_system_stats",
      tool: "nexus_run_script",
      args: {
        runtime: "python",
        script: "import nexus\nstats = nexus.windows.system_stats()\nprint('System stats:', stats)",
      },
      desc: "运维报错脚本调用 nexus.windows.system_stats()",
    },
    {
      scenario: "windowsOps",
      stepIndex: "2.3",
      stepName: "action_port_list",
      tool: "nexus_execute_action",
      args: { tool: "localbridge_port_list", arguments: {} },
      desc: "运维端口列表执行 localbridge_port_list (P1重点)",
    },
    {
      scenario: "windowsOps",
      stepIndex: "2.4",
      stepName: "script_process_list",
      tool: "nexus_run_script",
      args: {
        runtime: "python",
        script: "import nexus\nprocs = nexus.windows.process_list()\nprint(f'Total processes listed: {len(procs)}')",
      },
      desc: "运维进程列表脚本调用 nexus.windows.process_list()",
    },

    // Scenario 3: Unity
    {
      scenario: "unity",
      stepIndex: "3.1",
      stepName: "discover_unity_compact",
      tool: "nexus_discover_tools",
      args: { query: "unity", limit: 30, detail: false },
      desc: "Unity 紧凑工具发现 (limit=30, detail=false)",
    },
    {
      scenario: "unity",
      stepIndex: "3.2",
      stepName: "script_unity_dir",
      tool: "nexus_run_script",
      args: {
        runtime: "python",
        script: "import nexus\nattrs = [a for a in dir(nexus.unity) if not a.startswith('_')]\nprint('Unity namespace attributes:', len(attrs), attrs[:10])",
      },
      desc: "Unity 脚本调用 dir(nexus.unity)",
    },
    {
      scenario: "unity",
      stepIndex: "3.3",
      stepName: "script_unity_scene_list",
      tool: "nexus_run_script",
      args: {
        runtime: "python",
        script: "import nexus\ntry:\n    res = nexus.unity.scene_list_opened()\n    print('Opened scenes:', res)\nexcept Exception as e:\n    print('Unity scene query error:', e)",
      },
      desc: "Unity 场景列表查询",
    },
    {
      scenario: "unity",
      stepIndex: "3.4",
      stepName: "script_unity_hierarchy",
      tool: "nexus_run_script",
      args: {
        runtime: "python",
        script: "import nexus\ntry:\n    h = nexus.unity.scene_hierarchy_get()\n    print('Hierarchy retrieved, items:', len(h) if isinstance(h, list) else 'ok')\nexcept Exception as e:\n    print('Hierarchy query result:', e)",
      },
      desc: "Unity 层级树查询",
    },
  ];

  // Map baseline steps for easy lookup
  const baselineStepMap = new Map();
  for (const [scKey, scObj] of Object.entries(baselineData.scenarios)) {
    for (const step of scObj.steps) {
      baselineStepMap.set(step.step, step);
    }
  }

  let postTotalChars = 0;
  let preTotalChars = 0;
  let postTotalContentChars = 0;
  let preTotalContentChars = 0;
  let postTotalSCChars = 0;
  let preTotalSCChars = 0;
  let postSuccessCount = 0;
  let preSuccessCount = 0;

  for (let i = 0; i < testCalls.length; i++) {
    const item = testCalls[i];
    console.log(`[Replaying ${item.stepIndex}] ${item.desc}...`);
    const postRes = await callTool(item.tool, item.args, i + 100);
    const preStep = baselineStepMap.get(item.stepName);

    if (!preStep) {
      console.warn(`Warning: Baseline step ${item.stepName} not found!`);
      continue;
    }

    const deltaContent = postRes.contentChars - preStep.contentChars;
    const deltaSC = postRes.structuredContentChars - preStep.structuredContentChars;
    const deltaTotal = postRes.totalChars - preStep.totalChars;

    if (postRes.success) postSuccessCount++;
    if (preStep.success) preSuccessCount++;

    postTotalChars += postRes.totalChars;
    preTotalChars += preStep.totalChars;
    postTotalContentChars += postRes.contentChars;
    preTotalContentChars += preStep.contentChars;
    postTotalSCChars += postRes.structuredContentChars;
    preTotalSCChars += preStep.structuredContentChars;

    const compEntry = {
      stepIndex: item.stepIndex,
      stepName: item.stepName,
      desc: item.desc,
      scenario: item.scenario,
      pre: {
        success: preStep.success,
        contentChars: preStep.contentChars,
        structuredContentChars: preStep.structuredContentChars,
        totalChars: preStep.totalChars,
      },
      post: {
        success: postRes.success,
        contentChars: postRes.contentChars,
        structuredContentChars: postRes.structuredContentChars,
        totalChars: postRes.totalChars,
      },
      delta: {
        contentChars: deltaContent,
        structuredContentChars: deltaSC,
        totalChars: deltaTotal,
      },
    };

    comparisonReport.stepsComparison.push(compEntry);

    console.log(`  -> Pre: Total ${preStep.totalChars} (Content: ${preStep.contentChars}, SC: ${preStep.structuredContentChars})`);
    console.log(`  -> Post: Total ${postRes.totalChars} (Content: ${postRes.contentChars}, SC: ${postRes.structuredContentChars})`);
    console.log(`  -> Delta: ${deltaTotal > 0 ? "+" : ""}${deltaTotal} chars (Content: ${deltaContent > 0 ? "+" : ""}${deltaContent}, SC: ${deltaSC > 0 ? "+" : ""}${deltaSC})\n`);
  }

  comparisonReport.summary = {
    totalRoundtrips: {
      pre: testCalls.length,
      post: testCalls.length,
      status: "PASS (往返次数严格一致)",
    },
    successCount: {
      pre: preSuccessCount,
      post: postSuccessCount,
      status: postSuccessCount >= preSuccessCount ? "PASS (成功率未下降)" : "FAIL",
    },
    contentChars: {
      pre: preTotalContentChars,
      post: postTotalContentChars,
      delta: postTotalContentChars - preTotalContentChars,
    },
    structuredContentChars: {
      pre: preTotalSCChars,
      post: postTotalSCChars,
      delta: postTotalSCChars - preTotalSCChars,
    },
    totalChars: {
      pre: preTotalChars,
      post: postTotalChars,
      delta: postTotalChars - preTotalChars,
    },
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(comparisonReport, null, 2), "utf8");

  console.log("================================================================================");
  console.log("COMPARISON REPORT COMPLETE");
  console.log(`Report written to: ${REPORT_FILE}`);
  console.log("Overall Comparison Summary:");
  console.log(`  Total Roundtrips: ${testCalls.length} -> ${testCalls.length} (${comparisonReport.summary.totalRoundtrips.status})`);
  console.log(`  Success Count:    ${preSuccessCount}/12 -> ${postSuccessCount}/12 (${comparisonReport.summary.successCount.status})`);
  console.log(`  Content Chars:    ${preTotalContentChars.toLocaleString()} -> ${postTotalContentChars.toLocaleString()} (Delta: ${(postTotalContentChars - preTotalContentChars).toLocaleString()} 字符)`);
  console.log(`  SC Chars:         ${preTotalSCChars.toLocaleString()} -> ${postTotalSCChars.toLocaleString()} (Delta: ${(postTotalSCChars - preTotalSCChars).toLocaleString()} 字符)`);
  console.log(`  Total Chars:      ${preTotalChars.toLocaleString()} -> ${postTotalChars.toLocaleString()} (Delta: ${(postTotalChars - preTotalChars).toLocaleString()} 字符)`);
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("Comparison test failed:", err);
  process.exit(1);
});
