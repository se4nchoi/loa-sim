import { describe, expect, it } from 'vitest';
import type { ClearSnapshot } from '$lib/bible-data';
import { snapshotFitsRun } from './clear-snapshots';

// Soulshan's two setups (10-26): Full Moon Harvester played, while lostark.bible kept the Night's Edge one.
const snap = (enlightenment: { id: number; level: number }[]) => ({ arkPassive: { enlightenment } }) as unknown as ClearSnapshot;
const fullMoon = [{ id: 2460000, lv: 3 }, { id: 2460100, lv: 3 }, { id: 2460300, lv: 3 }];

describe('snapshotFitsRun', () => {
	it('trusts a snapshot whose enlightenment is the one the run recorded', () => {
		expect(snapshotFitsRun(snap([{ id: 2460300, level: 3 }, { id: 2460000, level: 3 }, { id: 2460100, level: 3 }, { id: 2460200, level: 0 }]), fullMoon)).toBe(true);
	});
	it("rejects lostark.bible's other setup", () => {
		expect(snapshotFitsRun(snap([{ id: 2460400, level: 5 }, { id: 2460600, level: 3 }, { id: 2460700, level: 3 }]), fullMoon)).toBe(false);
		expect(snapshotFitsRun(snap([{ id: 2460000, level: 3 }, { id: 2460100, level: 2 }, { id: 2460300, level: 3 }]), fullMoon)).toBe(false);
	});
	it('trusts the snapshot when either side has no enlightenment', () => {
		expect(snapshotFitsRun(snap([]), fullMoon)).toBe(true);
		expect(snapshotFitsRun(snap([{ id: 2460400, level: 5 }]), null)).toBe(true);
	});
});
