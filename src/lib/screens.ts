// The hub is a cross of 5 panels. Home is the center; the four categories sit
// above/below/left/right of it. Picking a direction pans the "world" so that
// panel centers — a 250ms directional slide. Background crossfades separately.

export type ScreenId = 'home' | 'game' | 'stream' | 'media' | 'misc';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface ScreenDef {
	id: Exclude<ScreenId, 'home'>;
	label: string;
	direction: Direction;
	/** app list layout on this screen */
	orientation: 'vertical' | 'horizontal';
	/** accent color — drives the effect-background wash + label glow */
	accent: string;
	/** where this panel sits relative to home (CSS % of viewport) */
	panel: {x: string; y: string};
	/** world translate that brings this panel to center */
	world: {x: string; y: string};
	/**
	 * The user enters this panel from the edge nearest home, so the nearest app
	 * — the one that should be focused on entry and sit closest to that edge —
	 * is the LAST item when `nearEnd` is true, else the FIRST. (Up→bottom app,
	 * Left→right-most app; Down→top app, Right→left-most app.)
	 */
	nearEnd: boolean;
	/** fraction (0..1) along the list axis where the focused tile rests, leaning
	 *  toward the entry edge instead of dead-center. */
	anchor: number;
}

// Locked mapping: Up=Game, Down=Stream, Left=Media, Right=Misc.
export const SCREENS: Record<Exclude<ScreenId, 'home'>, ScreenDef> = {
	game: {
		id: 'game', label: 'Gaming', direction: 'up', orientation: 'vertical',
		accent: '#b39cff', panel: {x: '0%', y: '-100%'}, world: {x: '0%', y: '100%'},
		nearEnd: true, anchor: 0.58   // enter from bottom → rest low, focus last
	},
	stream: {
		id: 'stream', label: 'Streaming', direction: 'down', orientation: 'vertical',
		accent: '#7ca8ff', panel: {x: '0%', y: '100%'}, world: {x: '0%', y: '-100%'},
		nearEnd: false, anchor: 0.44   // enter from top → rest high, focus first
	},
	media: {
		id: 'media', label: 'Media', direction: 'left', orientation: 'horizontal',
		accent: '#5eead4', panel: {x: '-100%', y: '0%'}, world: {x: '100%', y: '0%'},
		nearEnd: true, anchor: 0.60   // enter from right → rest right, focus last
	},
	misc: {
		id: 'misc', label: 'Misc', direction: 'right', orientation: 'horizontal',
		accent: '#7ee7a6', panel: {x: '100%', y: '0%'}, world: {x: '-100%', y: '0%'},
		nearEnd: false, anchor: 0.40   // enter from left → rest left, focus first
	}
};

export const DIRECTION_TO_SCREEN: Record<Direction, Exclude<ScreenId, 'home'>> = {
	up: 'game', down: 'stream', left: 'media', right: 'misc'
};

export const HOME_WORLD = {x: '0%', y: '0%'};

export function worldForScreen (screen: ScreenId) {
	return screen === 'home' ? HOME_WORLD : SCREENS[screen].world;
}

export function accentForScreen (screen: ScreenId): string | null {
	return screen === 'home' ? null : SCREENS[screen].accent;
}
