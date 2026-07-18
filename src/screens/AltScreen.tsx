import {useState, memo} from 'react';
import type {ScreenDef} from '../lib/screens';
import type {AppItem} from '../lib/apps';

// PERF: no per-tile motion components and NO filter:blur layers (blur is the most
// expensive thing this TV GPU does — 24 of them tanked the framerate). The track is
// ONE compositor transform with a CSS transition; focus = transform:scale + opacity
// + a single box-shadow glow on the one focused tile (which sits ~still at the anchor).
//
// Fixed tile metrics → focus-follow needs no measurement.
const V = {tile: 'h-[104px] w-[560px]', size: 104, step: 128, half: 52};   // vertical rows
const H = {tile: 'h-[320px] w-[248px]', size: 248, step: 276, half: 124};  // horizontal cards

const EASE = 'var(--m3-dur-medium) var(--m3-ease-emphasized)';

// Real app icon (file:// on the TV) with a monogram fallback if it's missing or
// off-device. The tonal chip behind it carries the brand color either way.
function AppArt ({app, size}: {app: AppItem; size: number}) {
	const [broken, setBroken] = useState(false);
	const show = app.icon && !broken;
	return (
		<div
			className="flex shrink-0 items-center justify-center overflow-hidden"
			style={{width: size, height: size, borderRadius: size * 0.28, background: `${app.color}33`}}
		>
			{show ? (
				<img
					src={app.icon}
					alt=""
					draggable={false}
					onError={() => setBroken(true)}
					style={{width: '100%', height: '100%', objectFit: 'cover'}}
				/>
			) : (
				<span className="font-semibold text-white" style={{fontSize: size * 0.42}}>{app.title[0]}</span>
			)}
		</div>
	);
}

// memo: on each move only the two tiles whose `focused` flips re-render, not all 12.
const Tile = memo(function Tile ({app, focused, vertical, tileClass, moving, launching}: {app: AppItem; focused: boolean; vertical: boolean; tileClass: string; moving: boolean; launching: boolean}) {
	const held = focused && moving;   // this tile is being reordered
	return (
		<div className={`relative shrink-0 ${tileClass}`}>
			<div
				className={`absolute inset-0 flex items-center overflow-hidden rounded-[28px] ${vertical ? 'flex-row px-6' : 'flex-col p-6'}`}
				style={{
					border: held ? `2px dashed ${app.color}` : `1px solid ${focused ? app.color : `${app.color}2b`}`,
					transform: held ? 'scale(1.09)' : focused ? 'scale(1.05)' : 'scale(1)',
					opacity: focused ? 1 : moving ? 0.4 : 0.68,
					// quick press-pulse so a launch visibly registered (webOS can take a beat)
					animation: launching ? 'launch-pulse 0.55s var(--m3-ease-emphasized)' : 'none',
					transition: `transform ${EASE}, opacity ${EASE}`,
					background: focused
						? `linear-gradient(160deg, ${app.color}4d, ${app.color}14)`
						: `linear-gradient(160deg, ${app.color}1a, rgba(255,255,255,0.02))`,
					boxShadow: focused
						? `0 0 22px -4px ${app.color}a0, 0 14px 36px -24px rgba(0,0,0,0.85)`
						: 'none'
				}}
			>
				{vertical ? (
					<>
						<AppArt app={app} size={56} />
						<span className="ml-5 truncate text-2xl font-medium text-white/95">{app.title}</span>
					</>
				) : (
					<>
						<div className="flex flex-1 items-center justify-center">
							<AppArt app={app} size={96} />
						</div>
						<span className="w-full truncate text-center text-xl font-medium text-white/95">{app.title}</span>
					</>
				)}
			</div>
		</div>
	);
});

export default function AltScreen ({def, items, selected, active, moving, launchingId}: {def: ScreenDef; items: AppItem[]; selected: number; active: boolean; moving: boolean; launchingId: string | null}) {
	const vertical = def.orientation === 'vertical';
	const g = vertical ? V : H;

	// Inactive panels rest at their own entry index so becoming active never
	// triggers a stray scroll (#2: entry starts on the near-edge app).
	const idx = active ? selected : (def.nearEnd ? items.length - 1 : 0);

	// Anchor the focused tile near the entry edge (lean, not dead-center).
	const axisPct = def.anchor * 100;
	const scrollPx = idx * g.step + g.half;
	const transform = vertical
		? `translate3d(-50%, calc(${axisPct}vh - ${scrollPx}px), 0)`
		: `translate3d(calc(${axisPct}vw - ${scrollPx}px), -50%, 0)`;

	return (
		<div className="relative h-full w-full">
			<h1 className="absolute left-[5vw] top-[8vh] z-10 text-[42px] font-normal tracking-tight" style={{color: def.accent}}>
				{def.label}
			</h1>

			{/* Reorder hint — shown while a tile is held; hold OK on a tile to start. */}
			<div
				className="absolute bottom-[6vh] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-6 py-3 text-lg font-medium"
				style={{
					color: '#eef1ff',
					background: `${def.accent}1f`,
					border: `1px solid ${def.accent}52`,
					opacity: moving ? 1 : 0,
					transition: `opacity ${EASE}`,
					pointerEvents: 'none'
				}}
			>
				Moving “{items[selected]?.title}” — {vertical ? '↑ ↓ reorder · ← Media  → Misc' : '← → reorder · ↑ Gaming  ↓ Streaming'} · OK save · Back cancel
			</div>

			<div
				className={`absolute ${vertical ? 'left-1/2 top-0 flex-col' : 'left-0 top-1/2 flex-row'} flex items-center`}
				style={{
					gap: g.step - g.size,
					transform,
					willChange: 'transform',
					transition: `transform ${EASE}`
				}}
			>
				{items.map((app, i) => (
					<Tile key={app.id} app={app} focused={active && i === idx} vertical={vertical} tileClass={g.tile} moving={moving} launching={app.id === launchingId} />
				))}
			</div>
		</div>
	);
}
