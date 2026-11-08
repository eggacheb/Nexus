const Database = require('better-sqlite3');
const crypto = require('crypto');
const http = require('http');

const path = require('path');
const db = new Database(path.join(process.env.LOCALAPPDATA, 'LocalBridge', 'server', 'localbridge.db'));
const rawToken = 'lb_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
const now = Date.now();

db.prepare(`
  INSERT OR REPLACE INTO tokens (id, type, token_hash, name, scopes, created_at, purpose)
  VALUES ('tok_test', 'mcp', ?, 'Test MCP Token', '["read","write","execute","purpose:chatgpt"]', ?, 'chatgpt')
`).run(hash, now);

console.log('Inserted test token into verify_install db with hash:', hash);

// Now test port 18080 /mcp with this token
const payload = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'nexus-debug',
      version: '1.0.0'
    }
  }
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 18080,
  path: '/mcp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${rawToken}`
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status 18080:', res.statusCode);
    console.log('Headers 18080:', res.headers);
    console.log('Body 18080:', data);
  });
});

req.write(payload);
req.end();
