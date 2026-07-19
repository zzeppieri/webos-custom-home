// Minimal luna-service2 bridge for webOS web apps — no webOSTV.js dependency.
// webOS injects window.PalmServiceBridge into every web app; each call is a
// fresh bridge whose single response arrives on `onservicecallback`.

type Params = Record<string, unknown>;

interface PalmBridge {
	onservicecallback: ((msg: string) => void) | null;
	call (uri: string, params: string): void;
	cancel? (): void;
}
declare global {
	interface Window {
		PalmServiceBridge?: {new (): PalmBridge};
	}
}

export function isWebOS (): boolean {
	return typeof window !== 'undefined' && typeof window.PalmServiceBridge === 'function';
}

/** One-shot luna call. Resolves the parsed response, rejects on returnValue:false,
 *  bad JSON, a thrown bridge error, or timeout. */
export function lunaCall<T = unknown> (service: string, method: string, params: Params = {}, timeoutMs = 4000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const Bridge = typeof window !== 'undefined' ? window.PalmServiceBridge : undefined;
		if (!Bridge) { reject(new Error('PalmServiceBridge unavailable (not on webOS)')); return; }

		const bridge = new Bridge();
		let done = false;
		const finish = (fn: () => void) => {
			if (done) return;
			done = true;
			try { bridge.cancel?.(); } catch { /* noop */ }
			fn();
		};

		bridge.onservicecallback = (msg) => {
			let data: unknown;
			try { data = JSON.parse(msg); }
			catch (e) { finish(() => reject(e as Error)); return; }
			const rv = (data as {returnValue?: boolean}).returnValue;
			if (rv === false) {
				const err = (data as {errorText?: string}).errorText || `luna ${service}/${method} failed`;
				finish(() => reject(new Error(err)));
			} else {
				finish(() => resolve(data as T));
			}
		};

		try { bridge.call(`luna://${service}/${method}`, JSON.stringify(params)); }
		catch (e) { finish(() => reject(e as Error)); return; }

		setTimeout(() => finish(() => reject(new Error(`luna ${service}/${method} timeout`))), timeoutMs);
	});
}

/** Launch (or switch input to) an app by webOS appId. */
export function launchApp (id: string, params: Params = {}): Promise<unknown> {
	return lunaCall('com.webos.applicationManager', 'launch', {id, params});
}

/**
 * Re-assert the user's configured sound output (eARC receiver). LG's own home
 * re-negotiates audio routing on focus changes; a raw applicationManager/launch
 * skips that, so the receiver can lose audio until LG home is visited. Re-setting
 * the already-configured output is idempotent and kicks audiod into re-routing.
 * Param name verified on this TV (webOS 24): {soundOutput: ...}, NOT {output: ...}.
 */
export function assertSoundOutput (): Promise<void> {
	return getSoundOutputState().then(({configured}) =>
		lunaCall('com.webos.service.audio', 'setSoundOutput', {soundOutput: configured}).then(() => undefined)
	);
}

/** Read both the user's *configured* sound output (persisted) and the *current*
 *  live one. audiod reports the persisted config in settingsSoundOutputs, so we
 *  target that — never the (possibly fallen-back) current value. */
export function getSoundOutputState (): Promise<{configured: string; current: string}> {
	return lunaCall<{soundOutput?: string; settingsSoundOutputs?: string[]}>(
		'com.webos.service.audio', 'getSoundOutput'
	).then((s) => ({
		configured: s.settingsSoundOutputs?.[0] ?? s.soundOutput ?? 'external_arc',
		current: s.soundOutput ?? '',
	}));
}

/**
 * Cold-boot audio guard. On a cold boot the TV resumes its last HDMI input and
 * grabs audio focus *before* the eARC receiver has finished its (slow, cold)
 * handshake — the receiver is powering up at the same time — so audiod has no
 * eARC sink yet and falls back to sound_output:tv_speaker. A single re-assert
 * fired at app mount loses this race: it runs before eARC is ready and gets
 * bounced straight back to tv_speaker, with nothing to retry it (the old
 * single-shot kick's exact failure). This polls getSoundOutput and re-asserts
 * the *configured* output until it reads back stable (two consecutive confirms,
 * to survive a transient-then-bounce) or the window elapses. A cold eARC link
 * can take 15-30s, so the window is generous. Returns a cancel fn; no-op
 * off-webOS. Hub timeouts/errors are swallowed and simply retried next tick.
 */
export function guardSoundOutputOnBoot (windowMs = 45_000, intervalMs = 2_000): () => void {
	if (!isWebOS()) return () => { /* not on webOS */ };
	let cancelled = false;
	let confirms = 0;
	const start = Date.now();
	const tick = () => {
		if (cancelled) return;
		getSoundOutputState()
			.then(({configured, current}) => {
				if (cancelled) return undefined;
				if (current === configured) { confirms += 1; return undefined; }
				confirms = 0;
				return lunaCall('com.webos.service.audio', 'setSoundOutput', {soundOutput: configured})
					.then(() => undefined).catch(() => undefined);
			})
			.catch(() => { confirms = 0; })
			.finally(() => {
				if (cancelled) return;
				if (confirms >= 2) return;                    // stable on configured output — done
				if (Date.now() - start >= windowMs) return;   // window elapsed — give up quietly
				window.setTimeout(tick, intervalMs);
			});
	};
	tick();
	return () => { cancelled = true; };
}

export interface LaunchPoint {id: string; title: string; icon: string; launchPointId?: string}

/** The apps the user actually has on their launcher ribbon (excludes hidden system apps). */
export function listLaunchPoints (): Promise<{launchPoints?: LaunchPoint[]}> {
	return lunaCall('com.webos.applicationManager', 'listLaunchPoints', {});
}

/**
 * Keep the TV's built-in screensaver from covering us (our ambient clock replaces
 * it). tvpower asks registered clients before showing the saver; answering
 * ack:false vetoes it (same mechanism youtube-webos uses). Long-lived
 * SUBSCRIPTION bridge — returns a cancel fn. No-op off-webOS. Does not affect
 * the panel's off-timer / power saving.
 */
export function blockScreenSaver (clientName = 'tld.my.customhome'): () => void {
	const Bridge = typeof window !== 'undefined' ? window.PalmServiceBridge : undefined;
	if (!Bridge) return () => { /* not on webOS */ };

	const bridge = new Bridge();
	bridge.onservicecallback = (msg) => {
		let data: {timestamp?: string} = {};
		try { data = JSON.parse(msg); } catch { return; }
		if (data.timestamp === undefined) return;
		lunaCall('com.webos.service.tvpower', 'power/responseScreenSaverRequest', {
			clientName, ack: false, timestamp: data.timestamp
		}).catch(() => { /* best-effort — worst case the saver shows */ });
	};
	try {
		bridge.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
			JSON.stringify({clientName, subscribe: true}));
	} catch { /* noop */ }
	return () => { try { bridge.cancel?.(); } catch { /* noop */ } };
}
