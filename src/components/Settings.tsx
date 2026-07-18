import {useEffect, useRef, useState} from 'react';
import {APP_VERSION, type HomeConfig} from '../lib/config';
import {resetOrder, CATS, type CatId} from '../lib/order';
import {SCREENS} from '../lib/screens';
import type {AppItem} from '../lib/apps';

// Remote-driven settings overlay (QOL config GUI). Up/Down picks a row,
// Left/Right cycles its value (saved immediately by App), OK fires actions,
// Back closes (or leaves the Manage-apps pane). No blur (TV GPU).

const ACCENT = '#7ca8ff';

type Row =
	| {kind: 'choice'; label: string; values: string[]; labels: string[]; get: (c: HomeConfig) => string; set: (c: HomeConfig, v: string) => HomeConfig}
	| {kind: 'action'; label: string; hint: string; action: 'reset' | 'apps'}
	| {kind: 'info'; label: string; value: string};

const ROWS: Row[] = [
	{
		kind: 'choice', label: 'Clock format', values: ['12', '24'], labels: ['12-hour', '24-hour'],
		get: (c) => (c.clock24 ? '24' : '12'), set: (c, v) => ({...c, clock24: v === '24'})
	},
	{
		kind: 'choice', label: 'Temperature', values: ['fahrenheit', 'celsius'], labels: ['°F', '°C'],
		get: (c) => c.tempUnit, set: (c, v) => ({...c, tempUnit: v as HomeConfig['tempUnit']})
	},
	{
		kind: 'choice', label: 'Background animation', values: ['on', 'off'], labels: ['On', 'Off'],
		get: (c) => (c.bgAnimated ? 'on' : 'off'), set: (c, v) => ({...c, bgAnimated: v === 'on'})
	},
	{
		kind: 'choice', label: 'Color theme', values: ['classic', 'mono', 'ember', 'aurora'], labels: ['Classic', 'Mono Blue', 'Ember', 'Aurora'],
		get: (c) => c.bgTheme, set: (c, v) => ({...c, bgTheme: v as HomeConfig['bgTheme']})
	},
	{
		kind: 'choice', label: 'Star density', values: ['low', 'normal', 'high'], labels: ['Low', 'Normal', 'High'],
		get: (c) => c.bgDensity, set: (c, v) => ({...c, bgDensity: v as HomeConfig['bgDensity']})
	},
	{
		kind: 'choice', label: 'Motion speed', values: ['slow', 'normal', 'fast'], labels: ['Slow', 'Normal', 'Fast'],
		get: (c) => c.bgSpeed, set: (c, v) => ({...c, bgSpeed: v as HomeConfig['bgSpeed']})
	},
	{kind: 'action', label: 'Manage apps', hint: 'OK to open', action: 'apps'},
	{kind: 'action', label: 'Reset app order', hint: 'OK to reset', action: 'reset'},
	{kind: 'info', label: 'Version', value: `v${APP_VERSION}`}
];

// Manage-apps pane: every app across all categories; OK (handled by the parent
// key handler) toggles shown/hidden.
function AppsPane ({lists, hidden, row}: {lists: Record<CatId, AppItem[]>; hidden: Set<string>; row: number}) {
	const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
	useEffect(() => { rowRefs.current[row]?.scrollIntoView({block: 'nearest'}); }, [row]);

	let i = -1;
	return (
		<div className="flex max-h-[52vh] flex-col gap-1 overflow-hidden overflow-y-auto pr-2">
			{CATS.map((cat) => (
				<div key={cat}>
					<div className="px-6 pb-1 pt-3 text-sm font-semibold uppercase tracking-widest" style={{color: SCREENS[cat].accent}}>
						{SCREENS[cat].label}
					</div>
					{lists[cat].map((app) => {
						i++;
						const idx = i;
						const focused = idx === row;
						const isHidden = hidden.has(app.id);
						return (
							<div
								key={app.id}
								ref={(el) => { rowRefs.current[idx] = el; }}
								className="flex items-center justify-between rounded-2xl px-6 py-2.5"
								style={{
									background: focused ? `${ACCENT}1f` : 'transparent',
									border: `1px solid ${focused ? `${ACCENT}66` : 'transparent'}`
								}}
							>
								<span className="text-lg font-medium" style={{color: isHidden ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.92)'}}>
									{app.title}
								</span>
								<span className="text-base font-medium" style={{color: isHidden ? 'rgba(255,255,255,0.4)' : '#7ee7a6'}}>
									{isHidden ? 'Hidden' : 'Shown'}
								</span>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}

export default function Settings ({config, onChange, onClose, onOrderReset, lists, hidden, onToggleHide}: {
	config: HomeConfig;
	onChange: (c: HomeConfig) => void;
	onClose: () => void;
	onOrderReset: () => void;
	lists: Record<CatId, AppItem[]>;
	hidden: Set<string>;
	onToggleHide: (id: string) => void;
}) {
	const [pane, setPane] = useState<'main' | 'apps'>('main');
	const [row, setRow] = useState(0);
	const [resetDone, setResetDone] = useState(false);

	// internal tiles (this settings screen) can't be hidden — you'd be locked out
	const manageable = {
		game: lists.game.filter((a) => a.launchType !== 'internal'),
		stream: lists.stream.filter((a) => a.launchType !== 'internal'),
		media: lists.media.filter((a) => a.launchType !== 'internal'),
		misc: lists.misc.filter((a) => a.launchType !== 'internal')
	};
	const flatApps = CATS.flatMap((cat) => manageable[cat]);
	const rowCount = pane === 'main' ? ROWS.length : flatApps.length;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const isBack = e.keyCode === 461 || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack';
			e.preventDefault();
			e.stopPropagation();
			if (isBack) {
				if (pane === 'apps') { setPane('main'); setRow(ROWS.findIndex((r) => r.kind === 'action' && r.action === 'apps')); }
				else onClose();
				return;
			}
			if (e.key === 'ArrowUp') { setRow((r) => Math.max(0, r - 1)); return; }
			if (e.key === 'ArrowDown') { setRow((r) => Math.min(rowCount - 1, r + 1)); return; }
			if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;

			if (pane === 'apps') {
				const app = flatApps[row];
				if (app && e.key === 'Enter') onToggleHide(app.id);
				return;
			}
			const def = ROWS[row];
			if (def.kind === 'info') return;
			if (def.kind === 'action') {
				if (e.key !== 'Enter') return;
				if (def.action === 'reset') { resetOrder(); onOrderReset(); setResetDone(true); }
				else { setPane('apps'); setRow(0); }
				return;
			}
			const cur = def.values.indexOf(def.get(config));
			const step = e.key === 'ArrowLeft' ? -1 : 1;
			const next = def.values[(cur + step + def.values.length) % def.values.length];
			onChange(def.set(config, next));
		};
		// capture phase so the app-wide nav handler never sees these keys
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [pane, row, rowCount, config, onChange, onClose, onOrderReset, flatApps, onToggleHide]);

	return (
		<div className="absolute inset-0 z-30 flex items-center justify-center" style={{background: 'rgba(0,0,0,0.72)'}}>
			<div className="m3-card w-[720px] px-10 py-8" style={{animation: 'rise-in 0.35s var(--m3-ease-emphasized) both'}}>
				<h2 className="mb-6 text-[34px] font-normal tracking-tight" style={{color: ACCENT}}>
					{pane === 'main' ? 'Settings' : 'Manage apps'}
				</h2>

				{pane === 'apps' ? (
					<AppsPane lists={manageable} hidden={hidden} row={row} />
				) : (
					<div className="flex flex-col gap-2">
						{ROWS.map((def, i) => {
							const focused = i === row;
							return (
								<div
									key={def.label}
									className="flex items-center justify-between rounded-2xl px-6 py-4"
									style={{
										background: focused ? `${ACCENT}1f` : 'transparent',
										border: `1px solid ${focused ? `${ACCENT}66` : 'transparent'}`,
										transition: 'background var(--m3-dur-short) var(--m3-ease-standard), border-color var(--m3-dur-short) var(--m3-ease-standard)'
									}}
								>
									<span className="text-xl font-medium text-white/92">{def.label}</span>
									{def.kind === 'choice' ? (
										<span className="flex items-center gap-3 text-lg" style={{color: focused ? ACCENT : 'rgba(255,255,255,0.55)'}}>
											{focused && <span className="opacity-70">‹</span>}
											<span className="min-w-[104px] text-center font-medium">{def.labels[def.values.indexOf(def.get(config))]}</span>
											{focused && <span className="opacity-70">›</span>}
										</span>
									) : def.kind === 'info' ? (
										<span className="text-lg font-medium text-white/40">{def.value}</span>
									) : (
										<span className="text-lg font-medium" style={{color: focused ? ACCENT : 'rgba(255,255,255,0.55)'}}>
											{def.action === 'reset' && resetDone ? 'Done ✓' : def.hint}
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}

				<p className="mt-6 text-center text-base text-white/40">
					{pane === 'apps' ? '↑↓ select · OK show/hide · Back to settings' : '↑↓ select · ‹ › change · Back to close'}
				</p>
			</div>
		</div>
	);
}
