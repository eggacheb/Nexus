const cp = require('child_process');

function parseSse(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  return null;
}

const pyScript = `
import sys
import json
import urllib.request
import urllib.parse
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Wikipedia-Knowledge")
USER_AGENT = "NexusKnowledgeBot/1.3"

@mcp.tool()
def search_wikipedia(query: str, limit: int = 5) -> str:
    """Search Wikipedia for articles matching the query."""
    return json.dumps([{"title": "Search Result", "query": query}])

@mcp.tool()
def get_wikipedia_summary(title: str) -> str:
    """Get introductory summary of Wikipedia article."""
    return f"Summary for {title}"

@mcp.tool()
def get_wikipedia_article(title: str) -> str:
    """Get full plaintext content of a Wikipedia article."""
    return f"Full content for {title}"

@mcp.tool()
def get_random_wikipedia_article() -> str:
    """Fetch random Wikipedia article summary."""
    return "Random article summary"

if __name__ == "__main__":
    import os
    port = int(os.environ.get("MCP_PORT", "9108"))
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = port
    mcp.run(transport="streamable-http")
`;

const child = cp.spawn('uv', [
  'run',
  '--with',
  'mcp<2,>=1.26.0',
  'python',
  '-c',
  pyScript
], {
  env: { ...process.env, MCP_PORT: '9108' },
  stdio: 'pipe'
});

child.stdout.on('data', d => console.log('STDOUT:', d.toString()));
child.stderr.on('data', d => console.log('STDERR:', d.toString()));

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9108/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test', version: '1.0' }, capabilities: {} }
      })
    });
    console.log('Wikipedia Init status:', res.status);
    const sid = res.headers.get('mcp-session-id');

    const headers2 = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
    if (sid) headers2['mcp-session-id'] = sid;

    const res2 = await fetch('http://127.0.0.1:9108/mcp', {
      method: 'POST',
      headers: headers2,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    });
    const text2 = await res2.text();
    const json2 = parseSse(text2);
    console.log('Wikipedia Tools count:', json2?.result?.tools?.length);
    console.log('Tool names:', json2?.result?.tools?.map(t => t.name));
  } catch(e) {
    console.error('Fetch err:', e.message);
  } finally {
    child.kill();
    process.exit(0);
  }
}, 5000);
