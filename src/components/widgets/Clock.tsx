import {useEffect, useState} from 'react';
import {ElasticText} from '../godui/elastic-text';
import {useConfig} from '../../lib/config';

function useNow (tickMs = 1000) {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), tickMs);
		return () => clearInterval(id);
	}, [tickMs]);
	return now;
}

export function Analog ({date, size = 104}: {date: Date; size?: number}) {
	const s = date.getSeconds();
	const m = date.getMinutes();
	const h = date.getHours() % 12;
	const c = size / 2;
	const hand = (angle: number, len: number, w: number, color: string, key: string, cap = true) => {
		const rad = (angle - 90) * (Math.PI / 180);
		return (
			<line
				key={key}
				x1={c} y1={c}
				x2={c + Math.cos(rad) * len} y2={c + Math.sin(rad) * len}
				stroke={color} strokeWidth={w} strokeLinecap={cap ? 'round' : 'butt'}
			/>
		);
	};
	return (
		<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{filter: 'drop-shadow(0 0 10px rgba(140,170,255,0.18))'}}>
			<circle cx={c} cy={c} r={c - 2} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.10)" strokeWidth={1.5} />
			{Array.from({length: 12}, (_, i) => {
				const rad = (i * 30 - 90) * (Math.PI / 180);
				const r1 = c - 7, r2 = c - 4;
				return (
					<line
						key={i}
						x1={c + Math.cos(rad) * r1} y1={c + Math.sin(rad) * r1}
						x2={c + Math.cos(rad) * r2} y2={c + Math.sin(rad) * r2}
						stroke="rgba(255,255,255,0.18)" strokeWidth={1.5}
					/>
				);
			})}
			{hand(h * 30 + m * 0.5, c * 0.48, 3, 'rgba(255,255,255,0.85)', 'h')}
			{hand(m * 6 + s * 0.1, c * 0.70, 2, 'rgba(255,255,255,0.85)', 'm')}
			{hand(s * 6, c * 0.78, 1, 'var(--primary)', 's')}
			<circle cx={c} cy={c} r={2.5} fill="var(--primary)" />
		</svg>
	);
}

// compact: smaller face + digits so the widget card clears the Misc chip at 1080p
export default function Clock ({compact = false}: {compact?: boolean}) {
	const now = useNow(1000);
	const {clock24} = useConfig();
	const hh = now.getHours();
	const mm = now.getMinutes();
	const h12 = ((hh + 11) % 12) + 1;
	const digital = clock24
		? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
		: `${h12}:${String(mm).padStart(2, '0')}`;
	const ampm = clock24 ? '' : hh < 12 ? 'AM' : 'PM';

	return (
		<div className="flex items-center gap-5">
			<Analog date={now} size={compact ? 80 : 100} />
			<div className="flex items-baseline gap-2 leading-none">
				{/* Re-keyed by minute → one gentle elastic sweep each minute change */}
				<div className={`${compact ? 'text-[50px]' : 'text-[68px]'} font-medium tracking-tight text-white/95`}>
					<ElasticText key={digital} loop={false} startOnView={false} duration={1.3} minWeight={340} maxWeight={640}>
						{digital}
					</ElasticText>
				</div>
				{ampm && <div className="text-xl font-medium text-white/50">{ampm}</div>}
			</div>
		</div>
	);
}
