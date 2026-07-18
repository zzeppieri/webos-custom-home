// Weather via Open-Meteo — no API key. Placeholder location; set your own below.
export const LOCATION = {
	name: 'Your City',
	latitude: 40.7128,
	longitude: -74.0060,
	temperatureUnit: 'fahrenheit' as 'fahrenheit' | 'celsius'
};

const WMO: Record<number, [string, string]> = {
	0: ['Clear', '☀'], 1: ['Mostly clear', '🌤'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁'],
	45: ['Fog', '🌫'], 48: ['Rime fog', '🌫'],
	51: ['Drizzle', '🌦'], 53: ['Drizzle', '🌦'], 55: ['Drizzle', '🌧'],
	61: ['Rain', '🌧'], 63: ['Rain', '🌧'], 65: ['Heavy rain', '🌧'],
	71: ['Snow', '🌨'], 73: ['Snow', '🌨'], 75: ['Heavy snow', '❄'],
	80: ['Showers', '🌦'], 81: ['Showers', '🌧'], 82: ['Downpour', '⛈'],
	95: ['Storm', '⛈'], 96: ['Storm', '⛈'], 99: ['Storm', '⛈']
};

export interface WeatherNow {
	temp: number; unit: string; label: string; glyph: string;
}
export interface ForecastHour { hour: number; temp: number; glyph: string }
export interface ForecastDay { label: string; hi: number; lo: number; glyph: string }
export interface Forecast { now: WeatherNow; hours: ForecastHour[]; days: ForecastDay[] }

function wmo (code: number): [string, string] {
	return WMO[code] || ['—', '🌡'];
}

/** Current conditions + next 5 hours + 3-day outlook, one Open-Meteo call. */
export function fetchForecast (loc = LOCATION): Promise<Forecast> {
	const url = 'https://api.open-meteo.com/v1/forecast' +
		`?latitude=${loc.latitude}&longitude=${loc.longitude}` +
		'&current=temperature_2m,weather_code' +
		'&hourly=temperature_2m,weather_code' +
		'&daily=weather_code,temperature_2m_max,temperature_2m_min' +
		'&forecast_days=3&timezone=auto' +
		`&temperature_unit=${loc.temperatureUnit}`;
	return fetch(url)
		.then((r) => { if (!r.ok) throw new Error(`weather ${r.status}`); return r.json(); })
		.then((data) => {
			const cur = data.current || {};
			const [label, glyph] = wmo(cur.weather_code as number);
			const now: WeatherNow = {
				temp: Math.round(cur.temperature_2m),
				unit: loc.temperatureUnit === 'celsius' ? '°C' : '°F',
				label, glyph
			};

			// next 5 hours, starting after the current one (times are TV-local via timezone=auto)
			const hTimes: string[] = data.hourly?.time || [];
			const nowIso = cur.time as string;
			let start = hTimes.findIndex((t) => t > nowIso);
			if (start < 0) start = 0;
			const hours: ForecastHour[] = [];
			for (let i = start; i < Math.min(start + 5, hTimes.length); i++) {
				hours.push({
					hour: parseInt(hTimes[i].slice(11, 13), 10),
					temp: Math.round(data.hourly.temperature_2m[i]),
					glyph: wmo(data.hourly.weather_code[i])[1]
				});
			}

			const dTimes: string[] = data.daily?.time || [];
			const days: ForecastDay[] = dTimes.slice(0, 3).map((t, i) => ({
				// parse as local noon so the weekday never shifts across the date line
				label: i === 0 ? 'Today' : new Date(`${t}T12:00:00`).toLocaleDateString([], {weekday: 'short'}),
				hi: Math.round(data.daily.temperature_2m_max[i]),
				lo: Math.round(data.daily.temperature_2m_min[i]),
				glyph: wmo(data.daily.weather_code[i])[1]
			}));

			return {now, hours, days};
		});
}
