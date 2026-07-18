import {useEffect, useState} from 'react';
import {Analog} from './widgets/Clock';
import {useConfig} from '../lib/config';

// Ambient idle screen (60s of no input): the UI fades out, the screen dims a
// touch, and a big analog clock floats over the constellation field. The clock
// DRIFTS to a new spot every minute (OLED burn-in guard) and everything is
// semi-transparent — no bright static pixels. Any input exits (handled in App).
export default function Ambient () {
	const {clock24} = useConfig();
	const [now, setNow] = useState(() => new Date());
	// drift offset in vw/vh around center; new spot each minute, eased by CSS
	const [pos, setPos] = useState({x: 0, y: 0});

	useEffect(() => {
		const tick = setInterval(() => setNow(new Date()), 1000);
		const drift = setInterval(() => {
			setPos({x: (Math.random() * 2 - 1) * 7, y: (Math.random() * 2 - 1) * 6});
		}, 60_000);
		return () => { clearInterval(tick); clearInterval(drift); };
	}, []);

	const hh = now.getHours();
	const mm = String(now.getMinutes()).padStart(2, '0');
	const digital = clock24
		? `${String(hh).padStart(2, '0')}:${mm}`
		: `${((hh + 11) % 12) + 1}:${mm}${hh < 12 ? ' AM' : ' PM'}`;
	const dateLine = now.toLocaleDateString([], {weekday: 'long', month: 'long', day: 'numeric'});

	return (
		<div
			className="absolute inset-0 z-40"
			style={{background: 'rgba(0,0,0,0.45)', animation: 'rise-in 1.2s ease both'}}
		>
			<div
				className="absolute left-1/2 top-1/2 flex flex-col items-center gap-6"
				style={{
					transform: `translate(calc(-50% + ${pos.x}vw), calc(-50% + ${pos.y}vh))`,
					transition: 'transform 3s ease-in-out'
				}}
			>
				<div style={{opacity: 0.9}}>
					<Analog date={now} size={340} />
				</div>
				<div className="text-center">
					<div className="text-[40px] font-light leading-none tracking-tight text-white/70">{digital}</div>
					<div className="mt-3 text-lg font-normal tracking-[0.02em] text-white/35">{dateLine}</div>
				</div>
			</div>
		</div>
	);
}
