import {useEffect, useState} from 'react';
import Clock from './Clock';
import {fetchForecast, LOCATION, type Forecast} from '../../service/weather';
import {useConfig} from '../../lib/config';

function DateLine () {
	const [d, setD] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setD(new Date()), 60_000);
		return () => clearInterval(id);
	}, []);
	const weekday = d.toLocaleDateString([], {weekday: 'long'});
	const rest = d.toLocaleDateString([], {month: 'long', day: 'numeric'});
	return (
		<div className="text-right">
			<div className="text-[26px] font-medium leading-tight tracking-tight text-white/92">{weekday}</div>
			<div className="text-base font-normal text-white/55">{rest}</div>
		</div>
	);
}

function hourLabel (h: number, clock24: boolean): string {
	if (clock24) return String(h).padStart(2, '0');
	const h12 = ((h + 11) % 12) + 1;
	return `${h12}${h < 12 ? 'am' : 'pm'}`;
}

// Current conditions + next-5-hours strip + 3-day outlook, one Open-Meteo call.
function WeatherBlock () {
	const {tempUnit, clock24} = useConfig();
	const [fc, setFc] = useState<Forecast | null>(null);
	const [err, setErr] = useState(false);
	useEffect(() => {
		let alive = true;
		const load = () => fetchForecast({...LOCATION, temperatureUnit: tempUnit})
			.then((f) => { if (alive) { setFc(f); setErr(false); } })
			.catch(() => { if (alive) setErr(true); });
		load();
		const id = setInterval(load, 15 * 60_000);
		return () => { alive = false; clearInterval(id); };
	}, [tempUnit]);

	if (err) return <div className="text-right text-base font-normal text-white/40">Weather —</div>;
	if (!fc) return <div className="text-right text-base font-normal text-white/40">Loading…</div>;

	return (
		<div className="flex w-full flex-col items-end gap-3">
			{/* now */}
			<div className="flex items-center justify-end gap-3">
				<span className="text-[32px] leading-none opacity-95">{fc.now.glyph}</span>
				<div className="text-right leading-tight">
					<div className="text-2xl font-medium text-white/92">{fc.now.temp}{fc.now.unit}</div>
					<div className="text-sm font-normal text-white/55">{fc.now.label}</div>
				</div>
			</div>

			{/* next 5 hours */}
			<div className="flex justify-end gap-3">
				{fc.hours.map((h) => (
					<div key={h.hour} className="flex w-11 flex-col items-center gap-0.5">
						<span className="text-xs font-medium text-white/45">{hourLabel(h.hour, clock24)}</span>
						<span className="text-lg leading-tight opacity-90">{h.glyph}</span>
						<span className="text-sm font-medium text-white/80">{h.temp}°</span>
					</div>
				))}
			</div>

			<div className="m3-divider" />

			{/* 3-day outlook — columns, not rows, to keep the card short */}
			<div className="flex w-full justify-between px-1">
				{fc.days.map((d) => (
					<div key={d.label} className="flex flex-col items-center gap-0.5">
						<span className="text-xs font-medium text-white/50">{d.label}</span>
						<span className="text-lg leading-tight opacity-90">{d.glyph}</span>
						<span className="text-sm font-medium tabular-nums">
							<span className="text-white/85">{d.hi}°</span>
							<span className="text-white/40">/{d.lo}°</span>
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// Top-right Material 3 elevated card: date · weather+forecast · clock, softly
// separated. No backdrop-blur — it re-rasterizes over the moving background each
// frame and tanks the TV GPU; the .m3-card tonal gradient fakes the surface for free.
export default function WidgetCluster () {
	return (
		<div className="m3-card flex w-[340px] flex-col items-end gap-3 px-8 py-5">
			<DateLine />
			<div className="m3-divider" />
			<WeatherBlock />
			<div className="m3-divider" />
			<Clock compact />
		</div>
	);
}
