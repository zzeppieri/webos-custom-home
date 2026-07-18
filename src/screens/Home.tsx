import {useEffect, useState} from 'react';
import {ChevronUp, ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import WidgetCluster from '../components/widgets/WidgetCluster';
import {SCREENS, type Direction} from '../lib/screens';
import {useConfig} from '../lib/config';

const CHEVRON: Record<Direction, typeof ChevronUp> = {
	up: ChevronUp, down: ChevronDown, left: ChevronLeft, right: ChevronRight
};

// Idle nudge — CSS keyframes (compositor-only), and ONLY while home is active so
// nothing animates behind an open app list. See index.css @keyframes nudge-*.
const NUDGE_ANIM: Record<Direction, string> = {
	up: 'nudge-up', down: 'nudge-down', left: 'nudge-left', right: 'nudge-right'
};

// All home chips share the Streaming blue (user pref) — screens keep their own
// accents once you enter them.
const HOME_CHIP_ACCENT = '#7ca8ff';

const PLACE: Record<Direction, string> = {
	up: 'top-[7vh] left-1/2 -translate-x-1/2',
	down: 'bottom-[7vh] left-1/2 -translate-x-1/2',
	left: 'left-[5vw] top-1/2 -translate-y-1/2',
	right: 'right-[5vw] top-1/2 -translate-y-1/2'
};
const FLOW: Record<Direction, string> = {
	up: 'flex-col', down: 'flex-col-reverse', left: 'flex-row', right: 'flex-row-reverse'
};

function greetingFor (h: number): string {
	if (h < 5) return 'Good night';
	if (h < 12) return 'Good morning';
	if (h < 17) return 'Good afternoon';
	if (h < 22) return 'Good evening';
	return 'Good night';
}

// Material You assist chip for each direction, tucked near its edge. Entrance +
// idle nudge are pure CSS (no framer-motion) so nothing runs JS during a pan.
function Hint ({direction, label, accent, active, index}: {direction: Direction; label: string; accent: string; active: boolean; index: number}) {
	const Icon = CHEVRON[direction];
	return (
		<div className={`absolute ${PLACE[direction]}`}>
			<div
				className={`flex items-center gap-2.5 rounded-full px-6 py-3.5 ${FLOW[direction]}`}
				style={{
					background: `${accent}1f`,
					border: `1px solid ${accent}52`,
					boxShadow: `0 10px 28px -14px ${accent}80`,
					animation: `chip-in 0.5s ease ${0.25 + index * 0.08}s both`
				}}
			>
				<span
					style={{
						color: accent,
						display: 'inline-flex',
						animation: active ? `${NUDGE_ANIM[direction]} 2.6s ease-in-out infinite` : 'none'
					}}
				>
					<Icon size={26} strokeWidth={2.4} />
				</span>
				<span className="text-lg font-medium tracking-wide" style={{color: '#eef1ff'}}>{label}</span>
			</div>
		</div>
	);
}

export default function Home ({active}: {active: boolean}) {
	const {location} = useConfig();
	const [greeting, setGreeting] = useState(() => greetingFor(new Date().getHours()));
	useEffect(() => {
		const id = setInterval(() => setGreeting(greetingFor(new Date().getHours())), 60_000);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="relative h-full w-full">
			<div className="absolute right-[5vw] top-[5vh]">
				<WidgetCluster />
			</div>

			{/* Centred greeting — the home's focal point. Outer div centres; inner rises in. */}
			<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
				<div style={{animation: 'rise-in 0.7s cubic-bezier(0.05,0.7,0.1,1) 0.1s both'}}>
					<h1 className="relative text-[64px] font-light leading-none tracking-tight text-white/95">{greeting}</h1>
					<p className="relative mt-4 text-lg font-normal tracking-[0.02em] text-white/45">{location.name}</p>
				</div>
			</div>

			{/* Direction chips, staggered in on mount (CSS). */}
			{Object.values(SCREENS).map((s, i) => (
				<Hint key={s.id} direction={s.direction} label={s.label} accent={HOME_CHIP_ACCENT} active={active} index={i} />
			))}
		</div>
	);
}
