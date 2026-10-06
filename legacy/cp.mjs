// Combat Power from lostark.bible's battlePoint parts. Mirrors bible's own client code:
//   CP = base_attack_point / 1e4 * Π (1 + part / 1e4)   over every non-defense part.
// Parts with {min, max} instead of {value} (pet specialty) give a range; bible shows the max.
// Verified exact on Soulshan (NA): 6785.48.

export const PART_TYPES = {
  1: 'Base attack power', 2: 'Base HP', 3: 'Character level', 4: 'Weapon quality',
  5: 'Ark Passive: Evolution', 6: 'Ark Passive: Enlightenment', 7: 'Ark Passive: Leap',
  8: 'Karma: Evolution rank', 9: 'Karma: Leap level',
  10: 'Engraving', 11: 'Engraving (defense)',
  12: 'Elixir set', 13: 'Elixir (attack)', 14: 'Elixir (defense)',
  15: 'Accessory roll', 16: 'Accessory roll (defense)',
  17: 'Accessory roll (combat effect)', 18: 'Accessory roll (combat effect, defense)',
  19: 'Bracelet stat type', 20: 'Bracelet effect', 21: 'Bracelet effect (defense)',
  22: 'Gem', 23: 'Esther weapon', 24: 'Transcendence (armor)', 25: 'Transcendence (bonus)',
  26: 'Combat stats', 27: 'Card set', 28: 'Pet specialty',
  29: 'Ark Grid core', 30: 'Ark Grid core (defense)', 31: 'Ark Grid gem', 32: 'Ark Grid gem (defense)',
  33: 'Paradise orb', 34: 'Paradise orb (defense)',
};

export const DEFENSE_TYPES = new Set([2, 11, 14, 16, 18, 21, 30, 32, 34]);

const lo = p => ('value' in p ? p.value : p.min);
const hi = p => ('value' in p ? p.value : p.max);

export function computeCombatPower(parts) {
  const base = parts.find(p => p.type === 1);
  if (!base) throw new Error('No base attack point in battlePoint parts');
  let attackMin = lo(base) / 1e4, attackMax = hi(base) / 1e4;
  for (const p of parts) {
    if (p.type === 1 || DEFENSE_TYPES.has(p.type)) continue;
    attackMin *= 1 + lo(p) / 1e4;
    attackMax *= 1 + hi(p) / 1e4;
  }
  return { attackMin, attackMax };
}

// Percentage CP gain if one part's value went from `from` to `to` (everything else fixed).
export function cpGainPct(from, to) {
  return ((1 + to / 1e4) / (1 + from / 1e4) - 1) * 100;
}
