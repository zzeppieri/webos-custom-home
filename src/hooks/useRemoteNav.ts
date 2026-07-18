import {useEffect, useRef} from 'react';
import {DIRECTION_TO_SCREEN, SCREENS, type Direction, type ScreenId} from '../lib/screens';

const KEY_TO_DIR: Record<string, Direction> = {
	ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right'
};

const HOLD_MS = 550;   // OK held this long on a tile → move (reorder) mode

interface Handlers {
	screen: ScreenId;
	setScreen: (s: ScreenId) => void;
	// alt-screen list state
	selected: number;
	setSelected: (updater: (prev: number) => number) => void;
	itemCount: number;
	onLaunch: () => void;
	// reorder (move) mode
	moving: boolean;
	onMoveStart: () => void;
	onMoveStep: (delta: -1 | 1) => void;
	/** cross-axis press while moving → send the tile to that spatial category */
	onMoveCross: (dir: Direction) => void;
	onMoveCommit: () => void;
	onMoveCancel: () => void;
	/** settings overlay open → it owns the keys, this hook goes quiet */
	enabled: boolean;
}

// One handler for the whole app. On home, directions change screen. On an alt
// screen, the along-axis arrows move the list selection, the cross-axis arrow or
// Back returns home, a short OK press launches, and HOLDING OK enters move mode
// (arrows reorder the tile, OK saves, Back cancels).
export function useRemoteNav ({screen, setScreen, selected, setSelected, itemCount, onLaunch, moving, onMoveStart, onMoveStep, onMoveCross, onMoveCommit, onMoveCancel, enabled}: Handlers) {
	// long-press bookkeeping survives re-renders but never triggers them
	const hold = useRef<{timer: number; fired: boolean}>({timer: 0, fired: false});

	useEffect(() => {
		if (!enabled) return;

		const onKeyDown = (e: KeyboardEvent) => {
			const isBack = e.keyCode === 461 || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack';
			const dir = KEY_TO_DIR[e.key];

			if (e.key === 'Enter') {
				if (screen === 'home') return;
				e.preventDefault();
				if (e.repeat) return;
				// commit reorder; flag the press so its keyup can't double as a launch
				if (moving) { hold.current.fired = true; onMoveCommit(); return; }
				// arm the long-press; a short press launches on keyup instead
				hold.current.fired = false;
				hold.current.timer = window.setTimeout(() => {
					hold.current.fired = true;
					onMoveStart();
				}, HOLD_MS);
				return;
			}

			if (isBack) {
				if (moving) { e.preventDefault(); onMoveCancel(); return; }
				if (screen !== 'home') { e.preventDefault(); setScreen('home'); }
				return;
			}
			if (!dir) return;
			e.preventDefault();

			if (screen === 'home') {
				setScreen(DIRECTION_TO_SCREEN[dir]);
				return;
			}

			const def = SCREENS[screen];
			const along = def.orientation === 'vertical'
				? {next: 'down', prev: 'up'}
				: {next: 'right', prev: 'left'};

			// Move mode: along-axis arrows shift the held tile; ends clamp (never
			// exits the screen mid-reorder); a cross-axis press sends the tile to
			// that spatial category (up=Gaming, down=Streaming, left=Media, right=Misc).
			if (moving) {
				if (dir === along.next) onMoveStep(1);
				else if (dir === along.prev) onMoveStep(-1);
				else onMoveCross(dir);
				return;
			}

			// On an alt screen: move along the list axis. Pressing PAST either end —
			// including the reverse of the direction you entered with — returns home,
			// as does any cross-axis press. (Enter Gaming via Up → Down returns home;
			// enter Media via Left → Right returns home.)
			if (dir === along.next) {
				if (selected >= itemCount - 1) setScreen('home');
				else setSelected((p) => Math.min(itemCount - 1, p + 1));
			} else if (dir === along.prev) {
				if (selected <= 0) setScreen('home');
				else setSelected((p) => Math.max(0, p - 1));
			} else {
				// cross-axis press leaves the screen (e.g. left/right on a vertical list)
				setScreen('home');
			}
		};

		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key !== 'Enter') return;
			window.clearTimeout(hold.current.timer);
			// short press (hold never fired) while not in move mode → launch
			if (!hold.current.fired && !moving && screen !== 'home') onLaunch();
			hold.current.fired = false;
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.clearTimeout(hold.current.timer);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [screen, setScreen, selected, setSelected, itemCount, onLaunch, moving, onMoveStart, onMoveStep, onMoveCross, onMoveCommit, onMoveCancel, enabled]);
}
