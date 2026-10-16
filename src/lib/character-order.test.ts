import { beforeEach, expect, it, vi } from 'vitest';
import { moveBefore, ordered, readOrder, writeOrder } from './character-order';
const storage = new Map<string, string>();
beforeEach(() => {
	storage.clear();
	vi.stubGlobal('localStorage', {getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v)});
});
const rows = ['A', 'B', 'C'].map(name => ({region: 'NA', name}));
it('retains custom order on refreshed source order and appends new characters', () => {
	writeOrder('roster', ['na/c', 'na/a', 'na/b']);
	expect(ordered([...rows].reverse().concat({region: 'NA', name: 'D'}), readOrder('roster')).map(c => c.name)).toEqual(['C', 'A', 'B', 'D']);
});
it('moves in both directions, preserving other rows and section independence', () => {
	expect(moveBefore(['a', 'hidden', 'b', 'c'], 'a', 'c')).toEqual(['hidden', 'b', 'c', 'a']);
	expect(moveBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
	writeOrder('characters', ['na/b', 'na/a']);
	expect(readOrder('roster')).toEqual([]);
	writeOrder('characters', []);
	expect(ordered(rows, readOrder('characters'))).toEqual(rows);
});
it('ignores damaged preferences and reports blocked writes', () => {
	storage.set('loa-sim:character-order:v1:roster', '{');
	expect(readOrder('roster')).toEqual([]);
	vi.stubGlobal('localStorage', {setItem() {throw new Error('blocked');}});
	expect(() => writeOrder('roster', ['a'])).toThrow('could not be saved');
});
