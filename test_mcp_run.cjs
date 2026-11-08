const cp = require('child_process');

function parseSse(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  return null;
}

const pyCode = "from autocad_mcp.server import mcp; mcp.settings.host='127.0.0.1'; mcp.settings.port=9107; mcp.run(transport='streamable-http')";

const child = cp.spawn('uv', [
  'run',
  '--with',
  'mcp>=1.26.0',
  '--with',
  'autocad-mcp',
  'python',
  '-c',
  pyCode
], { stdio: 'inherit' });

setTimeout(async () => {
  try {
    console.log('Fetching initialize from 9107...');
    const res = await fetch('http://127.0.0.1:9107/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', clientInfo: { name: 'test', version: '1.0' }, capabilities: {} }
      })
    });
    const sessionId = res.headers.get('mcp-session-id');
    console.log('Init status:', res.status, 'SessionId:', sessionId);
    const text = await res.text();
    console.log('Init result:', parseSse(text));

    const headers2 = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (sessionId) headers2['mcp-session-id'] = sessionId;

    const res2 = await fetch('http://127.0.0.1:9107/mcp', {
      method: 'POST',
      headers: headers2,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });
    console.log('Tools status:', res2.status);
    const text2 = await res2.text();
    const json2 = parseSse(text2);
    console.log('Tools count:', json2?.result?.tools?.length);
    console.log('Tool names:', json2?.result?.tools?.map(t => t.name));
  } catch(e) {
    console.error('Error:', e);
  } finally {
    child.kill();
    process.exit(0);
  }
}, 4000);
