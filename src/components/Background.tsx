import {SCREENS, type ScreenId} from '../lib/screens';
import {useConfig, DENSITY_MULT, SPEED_MULT} from '../lib/config';
import Constellations from './Constellations';

// Home wears an animated constellation field (Constellations.tsx — a light Canvas-2D plexus,
// NOT a video: this TV is memory-starved, and a 4K clip bloated the renderer to ~218MB and
// wedged cold launches). The category screens keep the cheap dynamic-color wash.
// Fixed layer — it never pans; only cross-fades opacity with the screen change.
function wash (tone: string): string {
	return (
		`radial-gradient(ellipse 130% 85% at 50% -12%, ${tone}42, transparent 55%),` +
		`radial-gradient(ellipse 110% 75% at 50% 116%, ${tone}1c, transparent 60%)`
	);
}

// Accent washes for the four category screens (home uses the poster instead).
const ACCENTS: {id: ScreenId; tone: string}[] = Object.values(SCREENS).map((s) => ({id: s.id as ScreenId, tone: s.accent}));

export default function Background ({screen, ambient = false}: {screen: ScreenId; ambient?: boolean}) {
	const onHome = screen === 'home';
	const cfg = useConfig();

	return (
		<div className="pointer-events-none fixed inset-0 z-0" style={{background: '#050506'}}>
			{/* Home background — animated constellation field (pauses off-home; keeps
			   running under the ambient idle clock). Animation / density / speed /
			   theme are user config (Settings overlay). */}
			<Constellations
				active={onHome || ambient}
				animated={cfg.bgAnimated}
				density={DENSITY_MULT[cfg.bgDensity]}
				speed={SPEED_MULT[cfg.bgSpeed]}
				theme={cfg.bgTheme}
			/>
			{/* Home legibility scrim — darker top & bottom (behind widgets / chips / fire),
			   lighter in the middle so the greeting reads without hiding the scene. */}
			<div
				className="absolute inset-0"
				style={{
					opacity: onHome ? 1 : 0,
					transition: 'opacity 0.55s ease-in-out',
					background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.12) 30%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.55) 100%)'
				}}
			/>

			{/* Category accent washes (over the black base; poster is hidden on alt screens) */}
			{ACCENTS.map((l) => (
				<div
					key={l.id}
					className="absolute inset-0"
					style={{background: wash(l.tone), opacity: screen === l.id ? 1 : 0, transition: 'opacity 0.55s ease-in-out', willChange: 'opacity'}}
				/>
			))}

			{/* Legibility vignette */}
			<div
				className="absolute inset-0"
				style={{background: 'radial-gradient(ellipse at 50% 42%, transparent 32%, rgba(0,0,0,0.5) 100%)'}}
			/>
		</div>
	);
}
