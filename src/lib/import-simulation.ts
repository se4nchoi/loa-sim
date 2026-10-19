import { normalizeName } from '$lib/bible-data';
import { loadSavedCharacter, saveCharacter } from '$lib/saved-character';
import { parseSimulation, saveSimulation } from '$lib/upgrade-planner/saved-simulations';

/** Import opens the saved build explicitly and never replaces an existing character's active snapshot. */
export function importSimulation(json: string): string {
 const s = parseSimulation(json);
 const key = s.characterKey.toLowerCase();
 if (!/^(na|ce)\/[^/?#\s]{1,40}$/u.test(key)) throw new Error('This file has an unsupported character region or name.');
 const [region, rawName] = key.split('/');
 const plan = saveSimulation(key, s.name, s.loadout, s.state);
 if (!loadSavedCharacter(key)) {
  saveCharacter({ name: normalizeName(rawName), region: region.toUpperCase(), header: null,
   loadout: s.loadout, loadouts: { current: s.loadout }, loadoutKind: 'current' });
  if (!loadSavedCharacter(key)) throw new Error('Browser storage is blocked; the character could not be imported.');
 }
 return `/sim?c=${encodeURIComponent(key)}&build=${encodeURIComponent(plan.id)}`;
}
