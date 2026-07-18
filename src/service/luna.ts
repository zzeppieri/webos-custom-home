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
	return lunaCall<{soundOutput?: string; settingsSoundOutputs?: string[]}>(
		'com.webos.service.audio', 'getSoundOutput'
	).then((s) => {
		const out = s.settingsSoundOutputs?.[0] ?? s.soundOutput ?? 'external_arc';
		return lunaCall('com.webos.service.audio', 'setSoundOutput', {soundOutput: out}).then(() => undefined);
	});
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
