import {useEffect, useRef} from 'react';

// Animated background — inspired by the Wallpaper Engine scene "Calm Space | Constellations
// | Minimalism" (workshop 3323607194): black bg, static colours (no hue shift), a red mouse
// trail, ~30fps. Composed as an explicit DEPTH STACK so each layer reads on its own:
//   • starfield  — dense tiny twinkling white stars (deepest texture)
//   • BACKGROUND — blue, small / dim / dense / slow   (far)
//   • MIDGROUND  — red, medium
//   • FOREGROUND — white, large / bright / sparse / fast (near, biggest parallax)
// + Magic-Remote hover (cursor joins the nearby network) + red pointer trail.
// Rendered at ~1440p (lighter than native 4K, crisp behind the scrim); geometry scales with
// resolution so the look is identical. PAUSES off-home so it never competes with scrolling.

type P = {x: number; y: number; vx: number; vy: number; r: number; ph: number};
type Star = {x: number; y: number; r: number; ph: number; spd: number; base: number};
type Layer = {rgb: number[]; core: number[]; count: number; speed: number; rMin: number; rMax: number; link: number; dotA: number; lineA: number; halo: number; pts: P[]};

const BG = '#000000', TAU = 6.28319, REF = 1920;

// depth stack geometry, ordered back → front (also the draw order); colors come
// from the selected THEME (user config).
const LAYER_GEO = [
	{count: 68, speed: 0.10, rMin: 0.8, rMax: 1.7, link: 150, dotA: 0.82, lineA: 0.42, halo: 0.16}, // BACKGROUND — small/dim/dense/slow
	{count: 48, speed: 0.17, rMin: 1.3, rMax: 2.4, link: 182, dotA: 0.92, lineA: 0.6,  halo: 0.2},  // MIDGROUND
	{count: 34, speed: 0.28, rMin: 2.0, rMax: 3.8, link: 232, dotA: 1.0,  lineA: 0.72, halo: 0.3}   // FOREGROUND — large/bright/sparse/fast
];

export type ConstellationTheme = 'classic' | 'mono' | 'ember' | 'aurora';
// [rgb, core] per depth layer (back → front) + pointer-trail color
const THEMES: Record<ConstellationTheme, {layers: [number[], number[]][]; trail: number[]}> = {
	classic: {layers: [[[95, 150, 205], [150, 197, 240]], [[206, 92, 92], [242, 156, 156]], [[216, 226, 238], [255, 255, 255]]], trail: [255, 50, 50]},
	mono:    {layers: [[[70, 120, 200], [120, 170, 240]], [[100, 150, 230], [160, 200, 255]], [[185, 210, 245], [235, 244, 255]]], trail: [120, 170, 255]},
	ember:   {layers: [[[190, 105, 55], [235, 165, 105]], [[215, 75, 55], [255, 140, 110]], [[242, 212, 170], [255, 242, 222]]], trail: [255, 120, 40]},
	aurora:  {layers: [[[55, 155, 135], [115, 215, 185]], [[85, 110, 215], [145, 170, 255]], [[190, 240, 220], [240, 255, 250]]], trail: [80, 230, 160]}
};

const STARS = {count: 300, rMin: 0.35, rMax: 1.7};      // dense faint twinkling starfield
const HOVER_REF = 300;

function mk (count: number, speed: number, rMin: number, rMax: number, W: number, H: number): P[] {
	const pts: P[] = [];
	for (let i = 0; i < count; i++) { const a = Math.random() * TAU; pts.push({x: Math.random() * W, y: Math.random() * H, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: rMin + Math.random() * (rMax - rMin), ph: Math.random() * TAU}); }
	return pts;
}
function mkStars (W: number, H: number, SC: number, density = 1): Star[] {
	const s: Star[] = [];
	for (let i = 0; i < Math.round(STARS.count * density); i++) { s.push({x: Math.random() * W, y: Math.random() * H, r: (STARS.rMin + Math.random() * (STARS.rMax - STARS.rMin)) * SC, ph: Math.random() * TAU, spd: 0.001 + Math.random() * 0.004, base: 0.3 + Math.random() * 0.65}); }
	return s;
}

// density/speed/theme are user config (Settings overlay); animated=false
// draws ONE static frame and never schedules another — zero per-frame cost.
export default function Constellations ({active, animated = true, density = 1, speed = 1, theme = 'classic'}: {active: boolean; animated?: boolean; density?: number; speed?: number; theme?: ConstellationTheme}) {
	const ref = useRef<HTMLCanvasElement>(null);
	const S = useRef<{key: string; layers: Layer[]; stars: Star[]; trail: {x: number; y: number; life: number}[]; mx: number; my: number; seen: number} | null>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d', {alpha: false});
		if (!ctx) return;
		const W = 2560;                                              // ~1440p render target
		const H = Math.round(2560 * window.innerHeight / window.innerWidth);
		const SC = W / REF;                                         // geometry scale (≈1.333)
		const HOVER = HOVER_REF * SC;
		canvas.width = W; canvas.height = H;

		// regenerate the field when the config knobs change (key mismatch)
		const colors = THEMES[theme] || THEMES.classic;
		const key = `${density}|${speed}|${theme}`;
		if (!S.current || S.current.key !== key) {
			S.current = {
				key,
				layers: LAYER_GEO.map((d, i) => ({...d, rgb: colors.layers[i][0], core: colors.layers[i][1], count: Math.round(d.count * density), link: d.link * SC, pts: mk(Math.round(d.count * density), d.speed * speed * SC, d.rMin * SC, d.rMax * SC, W, H)})),
				stars: mkStars(W, H, SC, density),
				trail: [], mx: -9999, my: -9999, seen: -99999
			};
		}
		const st = S.current;
		const TRAIL_RGB = colors.trail;

		const onMove = (e: MouseEvent) => {
			st.mx = e.clientX / window.innerWidth * W;
			st.my = e.clientY / window.innerHeight * H;
			st.seen = performance.now();
			st.trail.push({x: st.mx, y: st.my, life: 1});
			if (st.trail.length > 80) st.trail.shift();
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('pointermove', onMove);

		let raf = 0, last = 0;
		const frame = (t: number) => {
			raf = requestAnimationFrame(frame);
			if (t - last < 32) return;                       // ~30fps (config rate 29)
			const dt = last ? Math.min(2.2, (t - last) / 16.67) : 1; last = t;

			ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);

			// twinkling background starfield
			ctx.fillStyle = 'rgb(255,255,255)';
			for (const s of st.stars) { const b = s.base * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.spd + s.ph))); ctx.globalAlpha = b; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill(); }

			const age = t - st.seen, pOn = age < 1400, pFade = pOn ? Math.max(0, 1 - age / 1400) : 0;

			// depth layers back → front
			for (const L of st.layers) {
				const pts = L.pts;
				for (const p of pts) {
					p.x += p.vx * dt; p.y += p.vy * dt;
					if (pOn) { const dx = st.mx - p.x, dy = st.my - p.y, d2 = dx * dx + dy * dy; if (d2 < HOVER * HOVER) { const f = (1 - Math.sqrt(d2) / HOVER) * 0.05 * pFade; p.x += dx * f; p.y += dy * f; } }
					if (p.x < 0) p.x += W; else if (p.x > W) p.x -= W;
					if (p.y < 0) p.y += H; else if (p.y > H) p.y -= H;
				}
				ctx.strokeStyle = `rgb(${L.rgb[0]},${L.rgb[1]},${L.rgb[2]})`; ctx.lineWidth = SC;
				const l2 = L.link * L.link;
				for (let i = 0; i < pts.length; i++) {
					const a = pts[i];
					for (let j = i + 1; j < pts.length; j++) {
						const c = pts[j];
						const dx = a.x - c.x, dy = a.y - c.y, d2 = dx * dx + dy * dy;
						if (d2 < l2) { ctx.globalAlpha = (1 - Math.sqrt(d2) / L.link) * L.lineA; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); }
					}
				}
				ctx.fillStyle = `rgb(${L.rgb[0]},${L.rgb[1]},${L.rgb[2]})`;
				for (const p of pts) { const tw = 0.72 + 0.28 * Math.sin(t * 0.002 + p.ph); ctx.globalAlpha = L.dotA * tw * L.halo; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.8, 0, TAU); ctx.fill(); }
				ctx.fillStyle = `rgb(${L.core[0]},${L.core[1]},${L.core[2]})`;
				for (const p of pts) { const tw = 0.72 + 0.28 * Math.sin(t * 0.002 + p.ph); ctx.globalAlpha = L.dotA * tw; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
			}

			// magic hover — join the cursor into the nearby network + bright node
			if (pOn) {
				ctx.strokeStyle = 'rgb(190,215,240)'; ctx.lineWidth = SC;
				for (const L of st.layers) { for (const p of L.pts) { const dx = st.mx - p.x, dy = st.my - p.y, d2 = dx * dx + dy * dy; if (d2 < HOVER * HOVER) { ctx.globalAlpha = (1 - Math.sqrt(d2) / HOVER) * 0.5 * pFade; ctx.beginPath(); ctx.moveTo(st.mx, st.my); ctx.lineTo(p.x, p.y); ctx.stroke(); } } }
				ctx.globalAlpha = 0.95 * pFade; ctx.fillStyle = 'rgb(230,240,252)'; ctx.beginPath(); ctx.arc(st.mx, st.my, 3.4 * SC, 0, TAU); ctx.fill();
			}

			// red mouse trail
			if (st.trail.length) {
				ctx.fillStyle = `rgb(${TRAIL_RGB[0]},${TRAIL_RGB[1]},${TRAIL_RGB[2]})`;
				for (let i = st.trail.length - 1; i >= 0; i--) {
					const q = st.trail[i]; q.life -= 0.03 * dt;
					if (q.life <= 0) { st.trail.splice(i, 1); continue; }
					ctx.globalAlpha = q.life * 0.7; ctx.beginPath(); ctx.arc(q.x, q.y, (3 * q.life + 0.8) * SC, 0, TAU); ctx.fill();
				}
			}

			ctx.globalAlpha = 1;
		};

		if (active && animated) { last = 0; raf = requestAnimationFrame(frame); }
		else if (active) {
			// static mode: paint the field once (dt=0 movement is fine — pts start random)
			last = 0;
			raf = requestAnimationFrame((t) => { frame(t); cancelAnimationFrame(raf); });
		}
		return () => { cancelAnimationFrame(raf); window.removeEventListener('mousemove', onMove); window.removeEventListener('pointermove', onMove); };
	}, [active, animated, density, speed, theme]);

	return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{opacity: active ? 1 : 0, transition: 'opacity 0.55s ease-in-out', willChange: 'opacity'}} />;
}
