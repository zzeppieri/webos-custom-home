import {useState, useEffect, useCallback, useMemo, useRef, type ReactNode} from 'react';
import Background from './components/Background';
import Settings from './components/Settings';
import Ambient from './components/Ambient';
import Home from './screens/Home';
import AltScreen from './screens/AltScreen';
import {useRemoteNav} from './hooks/useRemoteNav';
import {DIRECTION_TO_SCREEN, SCREENS, worldForScreen, type Direction, type ScreenDef, type ScreenId} from './lib/screens';
import type {AppItem} from './lib/apps';
import {buildLists, saveOrders, loadHidden, saveHidden, type CatId} from './lib/order';
import {ConfigContext, loadConfig, saveConfig, type HomeConfig} from './lib/config';
import {launchApp, listLaunchPoints, blockScreenSaver, assertSoundOutput, isWebOS} from './service/luna';

const IDLE_MS = 60_000;      // no input for this long → ambient clock
const JITTER_MS = 150_000;   // OLED guard: shift the whole UI ±2px this often

function Panel ({def, children}: {def?: ScreenDef; children: ReactNode}) {
	const panel = def ? def.panel : {x: '0%', y: '0%'};
	return (
		<div className="absolute inset-0 h-full w-full" style={{transform: `translate(${panel.x}, ${panel.y})`}}>
			{children}
		</div>
	);
}

export default function App () {
	const [screen, setScreen] = useState<ScreenId>('home');
	const [selected, setSelected] = useState(0);
	const [discovered, setDiscovered] = useState<AppItem[]>([]);
	const [hidden, setHidden] = useState<Set<string>>(loadHidden);
	// full per-category lists (hidden included); the visible slices drive the UI
	const [lists, setLists] = useState<Record<CatId, AppItem[]>>(() => buildLists());
	const [moving, setMoving] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [ambient, setAmbient] = useState(false);
	const [config, setConfig] = useState<HomeConfig>(loadConfig);
	const [toast, setToast] = useState<string | null>(null);
	const [launchFx, setLaunchFx] = useState<string | null>(null);   // app id pulsing
	const [jitter, setJitter] = useState({x: 0, y: 0});
	// snapshot of the list being reordered, restored on Back (cancel)
	const moveSnapshot = useRef<Record<CatId, AppItem[]> | null>(null);
	const lastInput = useRef(Date.now());
	const toastTimer = useRef(0);

	const visible = useMemo(() => ({
		game: lists.game.filter((a) => !hidden.has(a.id)),
		stream: lists.stream.filter((a) => !hidden.has(a.id)),
		media: lists.media.filter((a) => !hidden.has(a.id)),
		misc: lists.misc.filter((a) => !hidden.has(a.id))
	}), [lists, hidden]);

	const showToast = useCallback((msg: string) => {
		setToast(msg);
		window.clearTimeout(toastTimer.current);
		toastTimer.current = window.setTimeout(() => setToast(null), 2600);
	}, []);

	// Real app list (#3 of the old worklist): merge the TV's actual launch points
	// into the catalog — anything new lands in Misc (monogram art; WAM blocks
	// cross-app icon paths). Runs once; harmless no-op off-webOS.
	useEffect(() => {
		if (!isWebOS()) return;
		listLaunchPoints()
			.then((res) => {
				const known = new Set<string>();
				for (const cat of ['game', 'stream', 'media', 'misc'] as CatId[]) {
					for (const a of buildLists()[cat]) known.add(a.id);
				}
				const extra: AppItem[] = (res.launchPoints || [])
					.filter((lp) => !known.has(lp.id))
					.map((lp) => ({id: lp.id, title: lp.title, color: '#8ea2ff'}));
				if (extra.length) {
					setDiscovered(extra);
					setLists(buildLists(extra));
				}
			})
			.catch(() => { /* catalog-only is fine */ });
	}, []);

	// Keep the TV's own screensaver away — the ambient clock replaces it.
	useEffect(() => blockScreenSaver(), []);

	// eARC guard: LG home re-negotiates audio routing on focus changes; we don't,
	// so the receiver can lose audio after boot or after we launch an app.
	// Re-assert the configured sound output on startup and every time our app
	// regains the foreground (returning from a launched app).
	useEffect(() => {
		if (!isWebOS()) return;
		const kick = () => { assertSoundOutput().catch(() => { /* best-effort */ }); };
		kick();
		const onVis = () => { if (!document.hidden) kick(); };
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, []);

	// Idle → ambient. Any input exits ambient and resets the timer. Nav is
	// disabled while ambient, so the waking press does nothing but wake.
	useEffect(() => {
		const poke = () => { lastInput.current = Date.now(); setAmbient(false); };
		window.addEventListener('keydown', poke, true);
		window.addEventListener('pointermove', poke, true);
		window.addEventListener('mousedown', poke, true);
		const id = window.setInterval(() => {
			if (!settingsOpen && Date.now() - lastInput.current >= IDLE_MS) {
				setAmbient(true);
				setScreen('home');   // stars only run on home; also resets nav state
				setMoving(false);
			}
		}, 5000);
		return () => {
			window.clearInterval(id);
			window.removeEventListener('keydown', poke, true);
			window.removeEventListener('pointermove', poke, true);
			window.removeEventListener('mousedown', poke, true);
		};
	}, [settingsOpen]);

	// OLED guard: drift every fixed element by a couple of pixels now and then.
	useEffect(() => {
		const id = window.setInterval(() => {
			setJitter({x: Math.round(Math.random() * 4 - 2), y: Math.round(Math.random() * 4 - 2)});
		}, JITTER_MS);
		return () => window.clearInterval(id);
	}, []);

	// On entering a screen, start on the app nearest the edge we slid from (#2):
	// Up→bottom app, Left→right-most app; Down/Right→first app.
	useEffect(() => {
		setMoving(false);
		if (screen === 'home') { setSelected(0); return; }
		setSelected(SCREENS[screen].nearEnd ? visible[screen].length - 1 : 0);
	}, [screen]);   // eslint-disable-line react-hooks/exhaustive-deps

	const itemCount = screen === 'home' ? 0 : visible[screen].length;

	const onLaunch = useCallback(() => {
		if (screen === 'home') return;
		const app = visible[screen][selected];
		if (!app) return;
		if (app.launchType === 'internal') { setSettingsOpen(true); return; }
		// pulse the tile so the press visibly registered (webOS can take a beat)
		setLaunchFx(app.id);
		window.setTimeout(() => setLaunchFx(null), 700);
		if (isWebOS()) {
			// eARC guard: re-assert sound output once the launched app has taken
			// the foreground — the raw luna launch skips LG home's audio renegotiation.
			window.setTimeout(() => { assertSoundOutput().catch(() => { /* best-effort */ }); }, 1500);
			launchApp(app.id).catch((e: unknown) => {
				// eslint-disable-next-line no-console
				console.error('launch failed', app.id, e);
				showToast(`Couldn't launch ${app.title}`);
			});
		} else {
			// eslint-disable-next-line no-console
			console.log('launch (stub, not on webOS):', app.id, app.launchType);
		}
	}, [screen, selected, visible, showToast]);

	// --- Reorder (move) mode -------------------------------------------------
	const onMoveStart = useCallback(() => {
		if (screen === 'home') return;
		moveSnapshot.current = lists;
		setMoving(true);
	}, [screen, lists]);

	const onMoveStep = useCallback((delta: -1 | 1) => {
		if (screen === 'home') return;
		const vis = visible[screen];
		const target = selected + delta;
		if (target < 0 || target >= vis.length) return;
		// swap within the FULL list (hidden tiles keep their slots)
		const a = vis[selected].id, b = vis[target].id;
		setLists((prev) => {
			const next = [...prev[screen as CatId]];
			const ia = next.findIndex((x) => x.id === a), ib = next.findIndex((x) => x.id === b);
			[next[ia], next[ib]] = [next[ib], next[ia]];
			return {...prev, [screen]: next};
		});
		setSelected(() => target);   // focus travels with the tile
	}, [screen, selected, visible]);

	const onMoveCross = useCallback((dir: Direction) => {
		if (screen === 'home') return;
		const target = DIRECTION_TO_SCREEN[dir];
		if (target === screen) return;
		const app = visible[screen][selected];
		if (!app) return;
		setLists((prev) => {
			const from = prev[screen as CatId].filter((x) => x.id !== app.id);
			const to = [...prev[target], app];
			const next = {...prev, [screen]: from, [target]: to};
			saveOrders(next);
			return next;
		});
		setMoving(false);
		moveSnapshot.current = null;
		setSelected((p) => Math.max(0, Math.min(p, visible[screen].length - 2)));
		if (visible[screen].length <= 1) setScreen('home');
		showToast(`Moved ${app.title} to ${SCREENS[target].label}`);
	}, [screen, selected, visible, showToast]);

	const onMoveCommit = useCallback(() => {
		if (screen !== 'home') saveOrders(lists);
		setMoving(false);
		moveSnapshot.current = null;
	}, [screen, lists]);

	const onMoveCancel = useCallback(() => {
		if (moveSnapshot.current) {
			const snap = moveSnapshot.current;
			setLists(snap);
			if (screen !== 'home') {
				const len = snap[screen as CatId].filter((a) => !hidden.has(a.id)).length;
				setSelected((p) => Math.max(0, Math.min(p, len - 1)));
			}
		}
		setMoving(false);
		moveSnapshot.current = null;
	}, [screen, hidden]);

	// --- Settings ------------------------------------------------------------
	const onConfigChange = useCallback((c: HomeConfig) => { setConfig(c); saveConfig(c); }, []);
	const onOrderReset = useCallback(() => setLists(buildLists(discovered)), [discovered]);
	const closeSettings = useCallback(() => setSettingsOpen(false), []);
	const onToggleHide = useCallback((id: string) => {
		setHidden((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id); else next.add(id);
			saveHidden(next);
			return next;
		});
	}, []);

	useRemoteNav({
		screen, setScreen, selected, setSelected, itemCount, onLaunch,
		moving, onMoveStart, onMoveStep, onMoveCross, onMoveCommit, onMoveCancel,
		enabled: !settingsOpen && !ambient
	});
	const world = worldForScreen(screen);

	return (
		<ConfigContext.Provider value={config}>
			<div className="relative h-full w-full overflow-hidden bg-background">
				<Background screen={screen} ambient={ambient} />

				{/* World pan is a pure CSS transform transition — compositor-only, no
				   per-frame JS. Changing `screen` moves the whole cross of panels.
				   The extra px offset is the slow OLED anti-burn-in jitter. */}
				<div
					className="absolute inset-0 z-10 h-full w-full"
					style={{
						transform: `translate(calc(${world.x} + ${jitter.x}px), calc(${world.y} + ${jitter.y}px))`,
						// Longer, gentle ease-in-out — smoother in and out of home (user pref:
						// slower is fine if smoother). Compositor-only, so cost is unchanged.
						transition: 'transform 0.55s cubic-bezier(0.4, 0, 0.2, 1), opacity 1s ease',
						willChange: 'transform',
						opacity: ambient ? 0 : 1   // ambient: only stars + clock remain
					}}
				>
					<Panel><Home active={screen === 'home' && !ambient} /></Panel>
					{Object.values(SCREENS).map((def) => (
						<Panel key={def.id} def={def}>
							<AltScreen
								def={def}
								items={visible[def.id]}
								selected={def.id === screen ? selected : 0}
								active={def.id === screen}
								moving={moving && def.id === screen}
								launchingId={def.id === screen ? launchFx : null}
							/>
						</Panel>
					))}
				</div>

				{ambient && <Ambient />}

				{settingsOpen && (
					<Settings
						config={config} onChange={onConfigChange} onClose={closeSettings}
						onOrderReset={onOrderReset}
						lists={lists} hidden={hidden} onToggleHide={onToggleHide}
					/>
				)}

				{/* Feedback toast (launch errors, cross-category moves) */}
				<div
					className="absolute left-1/2 top-[6vh] z-50 -translate-x-1/2 whitespace-nowrap rounded-full px-7 py-3.5 text-lg font-medium"
					style={{
						color: '#eef1ff',
						background: 'rgba(20,24,38,0.92)',
						border: '1px solid rgba(124,168,255,0.4)',
						opacity: toast ? 1 : 0,
						transform: `translateX(-50%) translateY(${toast ? 0 : -8}px)`,
						transition: 'opacity 0.3s ease, transform 0.3s ease',
						pointerEvents: 'none'
					}}
				>
					{toast}
				</div>
			</div>
		</ConfigContext.Provider>
	);
}
