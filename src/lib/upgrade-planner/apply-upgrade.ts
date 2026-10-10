// Applies a Next Upgrades suggestion to the simulator state, so the player can see it in every card.
// Suggestions are keyed by what they change (see upgrades.ts); each one becomes the matching edit.

import { applyAccessorySet, parseAccessorySetKey } from './accessory-sets';
import { roleOf } from './roles';
import { nextBracer } from './bracer';
import type { HoningSlot } from './honing-data';
import { gemParts, isOtherLine, type AccessorySlot, type SimState } from './simulate';
import { ENGRAVING_BOOK_STEPS, karmaRank } from './tables';
import type { Loadout } from './types';
import { coreStates, type Upgrade } from './upgrades';

/** Karma level at which each rank starts (rank 1 at level 1, then every 4 levels). */
const RANK_FROM = [0, 1, 5, 9, 13, 17, 21];
const MAX_CORE_POINTS_PER_GEM = 5;

/** Returns false when the edit can't be made from the current state (e.g. no gem left at that level). */
export function applyUpgrade(l: Loadout, s: SimState, base: SimState, u: Upgrade): boolean {
	const [kind, a, b] = u.key.split(':');
	switch (kind) {
		case 'quality': {
			const slot = a as HoningSlot, target = Number(b);
			if (s.quality[slot] === undefined || !Number.isInteger(target) || target <= s.quality[slot]! || target > 100) return false;
			s.quality[slot] = target;
			return true;
		}
		case 'bracer': {
			const to = nextBracer(s.bracer);
			if (!to || to.grade !== a || to.honing !== Number(b)) return false;
			s.bracer = to;
			return true;
		}
		case 'honing':
		case 'advanced': {
			// honing:<slot>:<level> / advanced:<slot>:<level> → that piece at least at that level.
			const g = s.gear[a as HoningSlot];
			if (!g) return false;
			if (kind === 'honing') g.honing = Math.max(g.honing, Number(b));
			else g.advanced = Math.max(g.advanced, Number(b));
			return true;
		}
		case 'gem': {
			// gem:T4:7 → one gem of that tier still at Lv. 7 goes to Lv. 8.
			const parts = gemParts(l);
			const i = s.gems.findIndex((g, k) => parts[k]?.tier === a && g.level === Number(b));
			if (i < 0) return false;
			s.gems[i].level++;
			return true;
		}
		case 'core': {
			// core:<id>:<breakpoint> → add core points to the core's astrogems until it reaches the breakpoint.
			const c = coreStates(l).find((x) => x.id === Number(a));
			const core = s.arkGrid.find((x) => x.id === Number(a));
			if (!c || !core) return false;
			const placed = (st: SimState) => st.arkGrid.find((x) => x.id === c.id)?.gems.reduce((n, g) => n + (g.removed ? 0 : g.corePoints), 0) ?? 0;
			let need = Number(b) - (c.points + placed(s) - placed(base));
			for (const g of core.gems.filter((g) => !g.removed).toSorted((x, y) => y.corePoints - x.corePoints)) {
				const add = Math.min(need, MAX_CORE_POINTS_PER_GEM - g.corePoints);
				if (add <= 0) continue;
				g.corePoints += add;
				need -= add;
			}
			return need <= 0;
		}
		case 'astrogem': {
			// astrogem:<option id> → +1 level on an astrogem that has the option below Lv. 5.
			for (const core of s.arkGrid)
				for (const g of core.gems) {
					if (g.removed) continue;
					const opt = g.opts.find((o) => o.id === Number(a) && o.level < 5);
					if (opt) {
						opt.level++;
						return true;
					}
				}
			return false;
		}
		case 'engraving': {
			// engraving:<id>:books:<n>
			const e = s.engravings[Number(a)];
			const col = ENGRAVING_BOOK_STEPS.indexOf(Number(u.key.split(':')[3]));
			if (!e || col < 0) return false;
			e.books = Math.max(e.books, col);
			return true;
		}
		case 'accset': {
			// accset:<slot>:<line>.<tier>,… → a new accessory with exactly those lines.
			const set = parseAccessorySetKey(u.key);
			return !!set && applyAccessorySet(s, set);
		}
		case 'accessory': {
			// accessory:<slot>:<line> → that line at High, replacing a non-scoring or secondary line if it's missing.
			const slot = a as AccessorySlot;
			const lines = s.accessories[slot];
			if (!lines) return false;
			const at = lines.findIndex((ln) => ln.key === b);
			if (at >= 0) {
				lines[at] = { key: b, tier: 'high' };
				return true;
			}
			// Replace a line that doesn't score for this role first, then a secondary line (flat stats, Weapon Power).
			const roleLines = roleOf(l).accessoryLines;
			const rank = (key: string) => {
				const line = roleLines.find((x) => x.key === key);
				return !line ? 0 : !line.primary ? 1 : 2;
			};
			const candidates = lines
				.map((ln, i) => ({ i, rank: isOtherLine(ln) ? 0 : rank(ln.key) }))
				.filter((c) => c.rank < 2)
				.sort((x, y) => x.rank - y.rank);
			const replace = candidates[0]?.i ?? -1;
			if (replace < 0) return false;
			lines[replace] = { key: b, tier: 'high' };
			return true;
		}
		case 'karma': {
			if (a === 'evolution-level' && s.karma.evolution !== null) {
				s.karma.evolution = Math.max(s.karma.evolution, Number(b));
				return true;
			}
			if (a === 'enlightenment' && s.karma.enlightenment !== null) {
				s.karma.enlightenment = Math.max(s.karma.enlightenment, Number(b));
				return true;
			}
			if (a === 'evolution' && s.karma.evolution !== null) {
				const rank = Number(b);
				s.karma.evolution = Math.max(s.karma.evolution, RANK_FROM[rank] ?? s.karma.evolution);
				return karmaRank(s.karma.evolution) >= rank;
			}
			if (a === 'leap' && s.karma.leap !== null) {
				s.karma.leap = Math.max(s.karma.leap, Number(b));
				return true;
			}
			return false;
		}
	}
	return false;
}
