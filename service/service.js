// Custom Home launcher service (registered dev-mode webOS service, so
// applicationManager/launch is permitted — a bare script isn't). Lives entirely in the
// app package; touches no OS files and never grabs input (reads only).
//
// Flags:
//   --boot   on start, launch the app, retrying until the app manager is ready. Used by
//            the webosbrew autostart script so the TV boots straight into the custom home.
//   --watch  also read the remote (no grab) and launch the app when HOME is pressed.
var Service = require('webos-service');
var fs = require('fs');

var APP_ID = 'tld.my.customhome';
var HOME_CODE = 773;          // HOME on this TV's Magic Remote
var EV_KEY = 1;
var EVENT_SIZE = 16;          // 32-bit input_event
var LOG = '/tmp/home-svc.log';
var ARGS = process.argv.slice(2);

function log(msg) { try { fs.appendFileSync(LOG, '[' + Date.now() + '] ' + msg + '\n'); } catch (e) { /* ignore */ } }

// webos-service idle-exits in ~5s unless timeouts are disabled (its own flag, read when the
// ActivityManager is built inside `new Service`). Push it first so we stay resident.
if (process.argv.indexOf('--disable-timeouts') === -1) { process.argv.push('--disable-timeouts'); }

var service = new Service('tld.my.customhome.service');
try { fs.writeFileSync('/tmp/home-svc.pid', String(process.pid)); } catch (e) { /* ignore */ }
log('start pid=' + process.pid + ' args=[' + ARGS.join(' ') + ']');

service.register('status', function (m) { m.respond({ returnValue: true, running: true, pid: process.pid }); });

function launchId(id, reason) {
	service.call('luna://com.webos.applicationManager/launch', { id: id }, function (m) {
		log('launch ' + id + ' (' + reason + '): ' + JSON.stringify(m && m.payload));
	});
}

var launching = false;
function launchApp(reason) {
	if (launching) return;
	launching = true;
	setTimeout(function () { launching = false; }, 800);
	launchId(APP_ID, reason);
}

// Cold boot: the app manager isn't ready the instant we start, so retry until it accepts
// the launch (returnValue:true), or give up after ~60s.
function bootLaunch(attempt) {
	attempt = attempt || 1;
	service.call('luna://com.webos.applicationManager/launch', { id: APP_ID }, function (m) {
		var ok = m && m.payload && m.payload.returnValue === true;
		log('bootLaunch #' + attempt + ': ' + JSON.stringify(m && m.payload));
		if (!ok && attempt < 30) { setTimeout(function () { bootLaunch(attempt + 1); }, 2000); }
	});
}

// Read every input device (no grab). Robust to device renumbering across reboots — we
// don't hardcode an eventN; whichever device carries HOME, we'll see it.
//
// IMPORTANT: use NON-BLOCKING fds polled from one timer, NOT blocking fs.read per device.
// Blocking reads each pin a libuv threadpool thread; with ~32 input nodes that exhausts
// the 4-thread pool and starves the read on the device that actually carries HOME. The
// non-blocking readSync returns EAGAIN instantly when idle (like capture.py's select loop).
function watchAll() {
	var files;
	try { files = fs.readdirSync('/dev/input').filter(function (f) { return f.indexOf('event') === 0; }); }
	catch (e) { log('readdir /dev/input: ' + e.message); return; }
	var fds = [];
	files.forEach(function (f) {
		try { fds.push(fs.openSync('/dev/input/' + f, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)); }
		catch (e) { /* phantom/unreadable node — skip */ }
	});
	log('watching ' + fds.length + ' input devices (nonblocking poll)');
	var buf = Buffer.alloc(EVENT_SIZE * 64);
	setInterval(function () {
		for (var i = 0; i < fds.length; i++) {
			var bytes = 0;
			try { bytes = fs.readSync(fds[i], buf, 0, buf.length, null); }
			catch (e) { continue; }   // EAGAIN: no data waiting on this device
			for (var off = 0; off + EVENT_SIZE <= bytes; off += EVENT_SIZE) {
				if (buf.readUInt16LE(off + 8) === EV_KEY && buf.readUInt16LE(off + 10) === HOME_CODE && buf.readInt32LE(off + 12) === 1) {
					log('HOME key');
					launchApp('home-key');
				}
			}
		}
	}, 16);
}

// eARC auto-recovery (eARC EDITION only — gated by the `EARC` marker file baked into that ipk;
// the standard ipk omits it, so none of this fires and the service is never elevated). On cold
// boot AND wake-from-standby the TV<->AVR eARC link can come up desynced: soundOutput reads
// external_arc and a codec negotiates, but no audio reaches the AVR. The ONLY fix is
// re-handshaking the eARC *feature* (toggle eArcSupport and back); toggling is safe — it
// re-negotiates and leaves the setting where it started. We can't detect the desync (broken and
// healthy look identical from every observable), so we toggle whenever the output is external_arc.
var EARC_ENABLED = fs.existsSync(__dirname + '/EARC');
log('eARC recovery ' + (EARC_ENABLED ? 'ENABLED (earc edition)' : 'disabled (standard edition)'));
var earcBusy = false;
function recoverEarc(reason) {
	if (earcBusy) { log('earc(' + reason + '): skip (busy)'); return; }
	earcBusy = true;
	var done = function () { earcBusy = false; };
	// 4s no-response guard on each luna call, so a hung reply can't wedge earcBusy forever.
	function call4s(uri, params, cb) {
		var fired = false;
		var to = setTimeout(function () { if (!fired) { fired = true; log('earc(' + reason + '): timeout ' + uri); done(); } }, 4000);
		service.call(uri, params, function (m) {
			if (fired) return;
			fired = true; clearTimeout(to);
			cb(m);
		});
	}
	call4s('luna://com.webos.settingsservice/getSystemSettings', { category: 'sound', keys: ['soundOutput', 'eArcSupport'] }, function (m) {
		var s = (m && m.payload && m.payload.settings) || {};
		log('earc(' + reason + '): read output=' + s.soundOutput + ' eArcSupport=' + s.eArcSupport);
		if (s.soundOutput !== 'external_arc') { log('earc(' + reason + '): skip (output=' + s.soundOutput + ')'); done(); return; }
		// Re-handshake by toggling to the OPPOSITE of the current eArcSupport, then back — this
		// preserves the user's setting (an ARC-only receiver on eArcSupport:off stays off) instead
		// of forcing eARC on. Either transition triggers the re-negotiation that fixes the desync.
		var orig = (s.eArcSupport === 'off') ? 'off' : 'on';
		var flip = (orig === 'on') ? 'off' : 'on';
		call4s('luna://com.webos.settingsservice/setSystemSettings', { category: 'sound', settings: { eArcSupport: flip } }, function (m2) {
			log('earc(' + reason + '): ' + flip + ' -> ' + JSON.stringify(m2 && m2.payload));
			setTimeout(function () {
				call4s('luna://com.webos.settingsservice/setSystemSettings', { category: 'sound', settings: { eArcSupport: orig } }, function (m3) {
					log('earc(' + reason + '): restore ' + orig + ' -> ' + JSON.stringify(m3 && m3.payload));
					done();
				});
			}, 2000);
		});
	});
}

// Command hook: launch whatever appId is written to /tmp/home-svc-cmd (consumed once), or run
// the manual eARC recovery when the file contains 'earc-fix'.
setInterval(function () {
	try {
		if (fs.existsSync('/tmp/home-svc-cmd')) {
			var id = ('' + fs.readFileSync('/tmp/home-svc-cmd')).trim();
			fs.unlinkSync('/tmp/home-svc-cmd');
			if (id === 'earc-fix') { recoverEarc('manual'); }
			else if (id) { launchId(id, 'cmd'); }
		}
	} catch (e) { /* ignore */ }
}, 250);

if (ARGS.indexOf('--boot') !== -1) {
	setTimeout(function () { bootLaunch(1); }, 1000);
	// Cold-boot eARC re-handshake (eARC edition only), after the panel/AVR link has settled.
	if (EARC_ENABLED) { setTimeout(function () { recoverEarc('boot'); }, 10000); }
}
if (ARGS.indexOf('--watch') !== -1) { watchAll(); }

// Wake-from-standby relaunch. webosbrew init.d autostart only runs on COLD boot, not on
// standby-resume ("rest"). But this process is merely FROZEN during rest, so a 1s heartbeat
// fires seconds/minutes late on resume — a big wall-clock gap means the panel just woke, so
// we relaunch the app a few times (the app manager + compositor take a moment to come back).
function wakeRelaunch () {
	var tries = 0;
	var iv = setInterval(function () {
		tries++;
		service.call('luna://com.webos.applicationManager/launch', { id: APP_ID }, function (m) { log('wake launch ' + tries + ': ' + JSON.stringify(m && m.payload)); });
		if (tries >= 4) clearInterval(iv);   // fire at 0 / 1.5 / 3 / 4.5s after wake
	}, 1500);
}
var lastBeat = Date.now();
setInterval(function () {
	var now = Date.now(), gap = now - lastBeat; lastBeat = now;
	if (gap > 10000) {
		log('WAKE detected (slept ~' + Math.round(gap / 1000) + 's) -> relaunch');
		wakeRelaunch();
		// Give the compositor/eARC a beat after resume, then re-handshake (eARC edition only).
		if (EARC_ENABLED) { setTimeout(function () { recoverEarc('wake'); }, 10000); }
	}
}, 1000); // also serves as the keep-alive
