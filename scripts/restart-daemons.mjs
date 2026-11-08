import { execSync, spawn } from 'node:child_process';

console.log('Stopping localbridge processes...');
try {
  execSync('taskkill /F /IM localbridge-desktop.exe /T', { stdio: 'ignore' });
} catch {}
try {
  execSync('taskkill /F /IM tunnel-client-runtime-cloudflared.exe /T', { stdio: 'ignore' });
} catch {}

console.log('Spawning fresh localbridge-desktop.exe...');
const child = spawn('E:\\workspace\\release\\verify_install\\localbridge-desktop.exe', [], {
  detached: true,
  stdio: 'ignore',
});
child.unref();

console.log('Spawned successfully with PID:', child.pid);
