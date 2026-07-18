import {APPS, type AppItem} from './apps';
import type {ScreenId} from './screens';

export type CatId = Exclude<ScreenId, 'home'>;
export const CATS: CatId[] = ['game', 'stream', 'media', 'misc'];

// Persisted layout state (QOL): per-category tile order — which may now contain
// ids MOVED IN from other categories — plus a hidden-app list. The catalog in
// apps.ts (+ apps discovered live from the TV) stays the source of truth for
// what exists: removed apps drop out, brand-new ones append to their default
// category, so nothing here ever needs a code edit.
const ORDER_KEY = 'home-app-order-v1';
const HIDDEN_KEY = 'home-hidden-v1';

function loadOrders (): Partial<Record<CatId, string[]>> {
	try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '{}'); }
	catch { return {}; }
}

/**
 * Assemble the full per-category lists (hidden apps INCLUDED — the caller
 * filters for display). `discovered` are launch points read off the TV that
 * aren't in the curated catalog; they default to Misc.
 */
export function buildLists (discovered: AppItem[] = []): Record<CatId, AppItem[]> {
	const byId = new Map<string, AppItem>();
	const defaultCat = new Map<string, CatId>();
	for (const cat of CATS) {
		for (const app of APPS[cat]) { byId.set(app.id, app); defaultCat.set(app.id, cat); }
	}
	for (const app of discovered) {
		if (!byId.has(app.id)) { byId.set(app.id, app); defaultCat.set(app.id, 'misc'); }
	}

	const saved = loadOrders();
	const claimed = new Set<string>();
	const out = {game: [], stream: [], media: [], misc: []} as Record<CatId, AppItem[]>;

	// saved orders claim first (they may hold ids moved across categories)
	for (const cat of CATS) {
		for (const id of saved[cat] || []) {
			const app = byId.get(id);
			if (app && !claimed.has(id)) { out[cat].push(app); claimed.add(id); }
		}
	}
	// everything unclaimed appends to its default category, catalog order
	for (const [id, app] of byId) {
		if (!claimed.has(id)) out[defaultCat.get(id)!].push(app);
	}
	return out;
}

/** Persist the given categories' current id sequences (merge into stored). */
export function saveOrders (lists: Partial<Record<CatId, AppItem[]>>): void {
	const all = loadOrders();
	for (const cat of CATS) {
		const apps = lists[cat];
		if (apps) all[cat] = apps.map((a) => a.id);
	}
	try { localStorage.setItem(ORDER_KEY, JSON.stringify(all)); } catch { /* storage full/blocked — order just won't persist */ }
}

export function resetOrder (): void {
	try { localStorage.removeItem(ORDER_KEY); } catch { /* noop */ }
}

// --- hidden apps -----------------------------------------------------------

export function loadHidden (): Set<string> {
	try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
	catch { return new Set(); }
}

export function saveHidden (ids: Set<string>): void {
	try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids])); } catch { /* noop */ }
}
