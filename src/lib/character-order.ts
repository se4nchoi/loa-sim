import { characterKey } from './saved-character';

export type CharacterSection = 'roster' | 'characters';
const key = (section: CharacterSection) => `loa-sim:character-order:v1:${section}`;
export function readOrder(section: CharacterSection): string[] {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(key(section)) ?? '[]');
		return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.toLowerCase()))] : [];
	} catch { return []; }
}
export function writeOrder(section: CharacterSection, order: string[]) {
	try { localStorage.setItem(key(section), JSON.stringify(order)); }
	catch { throw new Error('Browser storage is blocked; character order could not be saved.'); }
}
export function ordered<T extends {region: string; name: string}>(rows: T[], order: string[]): T[] {
	const positions = new Map(order.map((id, index) => [id, index]));
	return [...rows].sort((a, b) => (positions.get(characterKey(a)) ?? Infinity) - (positions.get(characterKey(b)) ?? Infinity));
}
/** Moving visible rows preserves hidden rows in the saved order. New rows retain source order. */
export function moveBefore(order: string[], id: string, target: string): string[] {
	if (id === target || !order.includes(id) || !order.includes(target)) return order;
	const next = order.filter(k => k !== id);
	next.splice(order.indexOf(target), 0, id);
	return next;
}
