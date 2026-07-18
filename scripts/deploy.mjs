// One-shot deploy: build -> package (no ares minify) -> install -> launch on the TV.
// Usage: npm run deploy
import {execSync} from 'node:child_process';
import {readdirSync, rmSync} from 'node:fs';
import {homedir} from 'node:os';

const APP_ID = 'tld.my.customhome';
const DEVICE = process.env.TV_DEVICE || 'tv';   // your ares-setup-device profile name
const TV_IP = process.env.TV_IP || '192.168.1.153';   // override: TV_IP=x.x.x.x npm run deploy
const SVC = '/media/developer/apps/usr/palm/services/tld.my.customhome.service';
const run = (cmd) => { console.log(`\n$ ${cmd}`); execSync(cmd, {stdio: 'inherit'}); };

// 1. Build (Vite + Lightning CSS downlevel to Chromium 108)
run('npm run build');

// 2. Clean old ipks, then package APP (dist) + the Home-button/autostart SERVICE together,
// without ares' legacy minifier (it chokes on Vite output).
for (const f of readdirSync('.').filter((f) => f.endsWith('.ipk'))) rmSync(f);
run('ares-package dist service -o . --no-minify');

// 3. Install + launch on device "tv"
const ipk = readdirSync('.').find((f) => f.endsWith('.ipk'));
run(`ares-install --device ${DEVICE} ${ipk}`);

// Launch the app AND re-arm the Home-button watcher in one step. ares-install kills the
// running service process, so we run its autostart script (kills any stale watcher, then
// starts `node service.js --boot --watch` = launch app + watch HOME). Without this, every
// deploy silently leaves Home dead until the next reboot.
run(`ssh -i "${homedir()}/.ssh/id_ed25519" -o StrictHostKeyChecking=no root@${TV_IP} "sh ${SVC}/autostart.sh"`);

console.log('\n✓ deployed; app launched + Home watcher re-armed');
