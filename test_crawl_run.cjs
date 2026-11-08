const cp = require('child_process');

const pyScript = `
import os
import re
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("Crawl4ai-Dehydrator")

@mcp.tool()
def crawl_url(url: str) -> str:
    """Crawl a webpage and extract clean, ad-free Markdown text without token waste."""
    import urllib.request
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        html = resp.read().decode('utf-8', errors='replace')
        
    html = re.sub(r'<script[\\s\\S]*?</script>', '', html, flags=re.I)
    html = re.sub(r'<style[\\s\\S]*?</style>', '', html, flags=re.I)
    text = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>', r'\\n\\n# \\1\\n', html, flags=re.I)
    text = re.sub(r'<p[^>]*>(.*?)</p>', r'\\n\\n\\1\\n', text, flags=re.I)
    text = re.sub(r'<li[^>]*>(.*?)</li>', r'\\n* \\1', text, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\\n{3,}', '\\n\\n', text)
    return text.strip()

@mcp.tool()
def extract_markdown(html_content: str) -> str:
    """Dehydrate raw HTML into clean structured Markdown text."""
    clean = re.sub(r'<script[\\s\\S]*?</script>', '', html_content, flags=re.I)
    clean = re.sub(r'<style[\\s\\S]*?</style>', '', clean, flags=re.I)
    text = re.sub(r'<[^>]+>', ' ', clean)
    return ' '.join(text.split())

if __name__ == "__main__":
    mcp.settings.host = "127.0.0.1"
    mcp.settings.port = 9111
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
  stdio: 'pipe'
});

child.stdout.on('data', d => console.log('STDOUT:', d.toString()));
child.stderr.on('data', d => console.log('STDERR:', d.toString()));

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9111/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test', version: '1.0' }, capabilities: {} }
      })
    });
    console.log('Init status:', res.status);
    const sessionId = res.headers.get('mcp-session-id');

    const headers2 = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
    if (sessionId) headers2['mcp-session-id'] = sessionId;

    const res2 = await fetch('http://127.0.0.1:9111/mcp', {
      method: 'POST',
      headers: headers2,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    });
    const text2 = await res2.text();
    console.log('Tools list body:', text2);
  } catch(e) {
    console.error('Fetch err:', e.message);
  } finally {
    child.kill();
    process.exit(0);
  }
}, 3000);
