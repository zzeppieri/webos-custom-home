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

/** Parsed shape of a getSoundOutput response / subscription push. */
interface SoundOutputMsg {
	soundOutput?: string;
	settingsSoundOutputs?: string[];
	subscribed?: boolean;
	returnValue?: boolean;
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
	return lunaCall<SoundOutputMsg>(
		'com.webos.service.audio', 'getSoundOutput'
	).then((s) => ({
		configured: s.settingsSoundOutputs?.[0] ?? s.soundOutput ?? 'external_arc',
		current: s.soundOutput ?? '',
	}));
}

/**
 * Persistent subscription to the live sound output. audiod pushes a fresh
 * getSoundOutput payload every time it re-routes the sink, so `onPush` fires the
 * instant the output flips — falls back to tv_speaker, or eARC links and the OS
 * switches to external_arc. Long-lived SUBSCRIPTION bridge, modelled on
 * blockScreenSaver — returns a cancel fn. No-op off-webOS. getSoundOutput
 * supports {subscribe:true} on this TV (com.webos.service.audio, API level 13).
 */
export function subscribeSoundOutput (onPush: (msg: SoundOutputMsg) => void): () => void {
	const Bridge = typeof window !== 'undefined' ? window.PalmServiceBridge : undefined;
	if (!Bridge) return () => { /* not on webOS */ };

	const bridge = new Bridge();
	bridge.onservicecallback = (msg) => {
		let data: SoundOutputMsg;
		try { data = JSON.parse(msg); } catch { return; }
		if (data.returnValue === false) return;
		onPush(data);
	};
	try {
		bridge.call('luna://com.webos.service.audio/getSoundOutput', JSON.stringify({subscribe: true}));
	} catch { /* noop */ }
	return () => { try { bridge.cancel?.(); } catch { /* noop */ } };
}

/**
 * Sound-output guard. Keeps audio pinned to the user's configured output (the
 * eARC receiver) two complementary ways at once:
 *   1. a persistent getSoundOutput SUBSCRIPTION that re-asserts the moment audiod
 *      reports the live sink drifting off the configured one — catches runtime
 *      fallbacks (e.g. after we raw-launch an app) event-driven, with no polling.
 *   2. a bounded boot-window RETRY that re-asserts every `retryMs`, because the
 *      cold-boot race can leave the output STUCK on tv_speaker with *no* change
 *      event to push: on a cold power-cycle the receiver powers up *with* the TV,
 *      so eARC isn't a ready sink yet and setSoundOutput gets bounced. A
 *      subscription can't observe a non-event, so we keep retrying until eARC
 *      links (typically 15-30s cold) and the assert finally sticks.
 * `configured` comes from settingsSoundOutputs (the persisted preference, never
 * the possibly-fallen-back live value) and is refreshed from any payload that
 * carries it. Returns a cancel fn; no-op off-webOS. Hub timeouts / eARC-not-ready
 * errors are swallowed and simply retried on the next push or tick. Supersedes
 * the old single-window poll (guardSoundOutputOnBoot).
 */
export function guardSoundOutput (bootWindowMs = 60_000, retryMs = 2_000): () => void {
	if (!isWebOS()) return () => { /* not on webOS */ };
	let cancelled = false;
	let configured = '';
	const start = Date.now();

	const reassert = () => {
		if (!configured) return;
		// eARC-not-ready yields "No matched extended item: soundOutput" — swallow
		// and let the next push / boot tick retry once the sink exists.
		lunaCall('com.webos.service.audio', 'setSoundOutput', {soundOutput: configured})
			.catch(() => { /* retried on the next event/tick */ });
	};

	// Shared by subscription pushes and boot-window polls: track the configured
	// output (only from payloads that actually carry it) and correct any drift.
	const handle = (msg: SoundOutputMsg) => {
		if (cancelled) return;
		if (msg.settingsSoundOutputs?.[0]) configured = msg.settingsSoundOutputs[0];
		const current = msg.soundOutput ?? '';
		if (configured && current && current !== configured) reassert();
	};

	const cancelSub = subscribeSoundOutput(handle);

	// Boot-window retry — the backstop that wins the cold-eARC race the
	// subscription structurally can't (a stuck output emits no change event).
	const tick = () => {
		if (cancelled) return;
		lunaCall<SoundOutputMsg>('com.webos.service.audio', 'getSoundOutput', {})
			.then(handle)
			.catch(() => { /* hub busy under boot load — try again */ })
			.finally(() => {
				if (cancelled || Date.now() - start >= bootWindowMs) return;
				window.setTimeout(tick, retryMs);
			});
	};

	// Prime `configured` from the persisted preference (falls back to external_arc
	// if the hub is too busy to answer), then start the retry loop.
	getSoundOutputState()
		.then(({configured: cfg}) => cfg)
		.catch(() => 'external_arc')
		.then((cfg) => {
			if (cancelled) return;
			if (!configured) configured = cfg;
			tick();
		});

	return () => { cancelled = true; cancelSub(); };
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
