// Bakes order Ark Grid cores (bonuses by points) and their effects, parsed for the DPS meter, from the Maxroll feed
// cache (cache/maxroll-items.json, cache/maxroll-stats.json) into src/lib/upgrade-planner/order-cores.ts.
//   node scripts/bake-order-cores.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { groupNames, SKILL_ALIASES } from './skill-group-map.mjs';

const items = JSON.parse(readFileSync('cache/maxroll-items.json', 'utf8'));
const options = JSON.parse(readFileSync('cache/maxroll-stats.json', 'utf8')).arkGridCoreOptions;
const skillTable = JSON.parse(readFileSync('cache/maxroll-skills.json', 'utf8'));
// Class → skill name → ids, for effects on one skill ("Astaros Damage +18%").
const skillIds = {};
for (const [id, k] of Object.entries(skillTable)) if (k?.class && k.name) ((skillIds[k.class] ??= {})[k.name] ??= []).push(Number(id));

// A class's Hyper Awakening Techniques: level-1 skills learned at 50 that sit in a class group.
const hyper = {};
const awakening = {};
for (const [id, k] of Object.entries(skillTable)) {
	if (!k?.class || k.maxLevel !== 1 || !(k.learn >= 50)) continue;
	((k.category > 0 ? hyper : awakening)[k.class] ??= []).push(Number(id));
}

// Tripods: their names per class ("Possession", "Blue Heart"), and per skill by tier, as a character's skills list them
// (tier 1-3, 1-based within the tier; the tier is in the icon name, "Tripod_Tier_2_33").
const tripodNames = {};
const tripodTiers = {};
for (const [id, k] of Object.entries(skillTable)) {
	if (!k?.class || !k.tripods?.length) continue;
	const tiers = [[], [], []];
	for (const t of k.tripods) {
		if (!t?.name) continue;
		const tier = Number(t.icon?.match(/Tripod_Tier_(\d)/)?.[1] ?? 0);
		if (tier >= 1 && tier <= 3) tiers[tier - 1].push(t.name);
		(tripodNames[k.class] ??= new Set()).add(t.name);
	}
	tripodTiers[id] = tiers;
}
const usedTripodSkills = new Set();

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/**
 * A skill's ids by the name an effect gives it: exactly, ignoring case ("Esoteric skill: Azure Dragon Supreme Fist"), or
 * as the end of one skill's "<kind>: <name>" ("A.C.T" is "Barrage: A.C.T").
 */
const skillByName = (cls, name) => {
	const all = skillIds[cls] ?? {};
	if (all[name]) return all[name];
	const lower = name.toLowerCase();
	const found = Object.keys(all).filter((n) => n.toLowerCase() === lower || n.toLowerCase().endsWith(`: ${lower}`));
	return found.length === 1 ? all[found[0]] : undefined;
};
// What an effect names, part by part ("Ghast Skill and Deathlord Skill", "Rending Finisher and Exploding Finisher",
// "Phantom Beast Skills"): each part is one of the class's groups (scripts/skill-group-map.mjs) or a skill by name.
// → { groups, skills }; undefined when a part is neither.
const targetOf = (target, cls) => {
	// "Skill Damage +1.5%": every skill.
	if (/^Skills?$/.test(target)) return { groups: null };
	// "Charge-type skill" is the Charge group; "Esoteric Skill: Azure Dragon Supreme Fist" is that skill when the game
	// data names it without the prefix (some Esoteric skills keep it).
	target = target.replace(/-type [Ss]kills?\b/g, ' Skill');
	if (/^Esoteric Skill: /.test(target) && !skillByName(cls, target)) target = target.replace(/^Esoteric Skill: /, '');
	const names = groupNames(cls);
	const groups = [], skillList = [];
	const parts = target.split(/, and |, or |, | and | or |\//).map((p) => p.trim());
	// "Normal and Encroachment Skill": the last part's "Skill" names the groups before it too.
	const shared = / Skills?$/.test(parts.at(-1));
	for (const part of parts) {
		// "Normal and Encroachment Skill" shares the last "Skill"; a group the effect names bare ("Supreme Art Form Damage")
		// when no skill has that name.
		if ((shared || !skillByName(cls, part)) && names.includes(part)) { groups.push(part); continue; }
		const group = part.match(/^(.+?) Skills?$/)?.[1];
		if (group && names.includes(group)) { groups.push(group); continue; }
		// "Emperor Card": Arcanist's card skill of that name.
		const alias = SKILL_ALIASES[cls]?.[part];
		if (Array.isArray(alias)) { const ids = alias.flatMap((n) => skillByName(cls, n) ?? []); if (!ids.length) return undefined; skillList.push(...ids); continue; }
		// "Rending Finisher's Charge Mode": that skill (in its charge mode, which the logs don't split out).
		const bare = part.replace(/'s Charge Mode$/, '');
		const name = alias ?? (skillByName(cls, bare) ? bare : bare.replace(/ Card$/, ''));
		const ids = skillByName(cls, name) ?? (group ? skillByName(cls, group) : undefined);
		if (!ids) return undefined;
		skillList.push(...ids);
	}
	return { ...(groups.length ? { groups } : {}), ...(skillList.length ? { skills: skillList } : {}) };
};

/**
 * One option's effects. A sentence is valued when it is "<groups> Skill Damage +a%" or "Damage to foes +a%":
 *   - with no condition: always on ({ pct, groups });
 *   - on Destiny (a Destiny buff's own line, or "On Destiny activation, next ..."): on the damage LOA Logs recorded
 *     under that buff ({ pct, groups, feature, level }); the buff's log id shares the feature id's first five digits.
 * Anything else is kept as text ({ text }) so the meter can say what it doesn't value.
 */
function effectsOf(option, cls) {
	const feature = option.stats.find((s) => s.type === 28);
	const out = [];
	let inBuff = false, sticky, stickyTripod, buffName, prev = '';
	const desc = strip(option.desc.replace(/<br>|\n/gi, '\n')).replace(/\s*\((?:Max|Up to) [^)]*\)/gi, '').replace(/%\.(?=[A-Z])/g, '%. ').replace(/([+-]) (?=\d)/g, '$1').replace(/theDestiny/g, 'the Destiny') // "Damage + 15.0%", "gain theDestiny: …"
		.replace(/(\d[\d.]*s) (Destiny: [^:]+:)/g, '$1. $2'); // "… for 20.0s Destiny: Hyperfocus: …" (a missing period)
	for (const line of desc.split(/(?<=\.)\s+(?=[A-Z])/)) {
		let s = line.trim();
		if (!s) continue;
		// A Destiny buff's lines: "Destiny: Death Sentence: ..." and the sentences after it.
		let destiny = inBuff;
		const named = s.match(/^(Destiny: [^:]+): (.*)$/);
		if (named) { buffName = named[1]; s = named[2].replace(/^Next /, ''); destiny = inBuff = true; }
		if (/^On Destiny (is )?activation, gain the Destiny: .* effect/.test(s)) continue; // the buff line follows
		const onDestiny = s.match(/^On Destiny (?:is )?activation, (?:next )?(.*)$/);
		if (onDestiny) { s = onDestiny[1]; destiny = true; }
		// "While Destiny: Decimation is active, ...": in the state of that Destiny buff (the logs name it).
		const whileDestiny = !destiny && s.match(/^While (?:the )?(Destiny: [^,]+?)(?: effect)? is active, (.*)$/);
		if (whileDestiny) { sticky = whileDestiny[1]; s = whileDestiny[2]; }
		// Inside a Destiny effect the buff's own uptime stands for its condition ("Destiny: Decimation: While in Hype Mode, ...").
		if (destiny) s = s.replace(/^(?:In|While in|While using) [A-Z][\w' ]+, /, '');
		// A state the effect needs ("In Deathlord Mode, ...", "With Possession, ..."): valued on the damage dealt in it.
		let when = sticky;
		sticky = undefined;
		const onCrit = s.match(/^On (?:(.+?) )?Crit Hit, (Damage(?: to foes)? [+-][\d.]+%\.?)$/);
		let crit = false;
		// "On Rifle Skill Crit Hit, Damage to foes +6.5%": the crits of those skills, not every skill's; "On Crit Hit,
		// Damage +2.0%": every skill's crits.
		if (onCrit) { s = onCrit[1] ? onCrit[1] + ' ' + onCrit[2].replace(/^Damage to foes/, 'Damage') : onCrit[2].replace(/^Damage(?! to foes)/, 'Damage to foes'); crit = true; }
		// "With Exploding Finisher's Blue Heart, ..." / "With Possession, ...": a tripod, checked against the character's skills.
		let needs = stickyTripod;
		stickyTripod = undefined;
		const tripod = !destiny && s.match(/^With ([A-Z][\w ]+)'s ([A-Z][\w' ]+), (.*)$/);
		if (tripod) {
			s = tripod[3];
			needs = stickyTripod = tripod[2];
			if (/^Damage ?[+-] ?[\d.]+%/.test(s) && skillByName(cls, tripod[1])) s = s.replace(/^Damage/, tripod[1] + ' Damage');
		}
		const classTripod = !destiny && !tripod && s.match(/^With ([A-Z][\w' ]+), (.*)$/);
		if (classTripod && tripodNames[cls]?.has(classTripod[1])) { needs = stickyTripod = classTripod[1]; s = classTripod[2]; }
		// A sentence with its own tripod condition doesn't carry on the state before it ("During Charge Mode for Piercing
		// Shock, … With Piercing Shock's Death Blow, Damage +20.0%").
		if (tripod || (classTripod && needs)) when = undefined;
		const state = !destiny && !tripod && !(classTripod && needs) && s.match(/^(?:(?:In|While in) ([A-Z][\w' ]+ (?:Mode|Stance|Zone))|With ([A-Z][\w' ]+)|During ([A-Z][\w' ]+?)(?<! use)), (.*)$/); // "During Perfect Shot use" is a skill-use condition
		if (state) { when = sticky = state[1] ?? state[2] ?? state[3]; s = state[4]; } // and the sentence after it
		s = s.charAt(0).toUpperCase() + s.slice(1);
		// Conditions the logs do show, in other words: "When Destiny: X effect is active, ..." (that buff), "When using A or
		// B, Damage +x%" (those skills), "When A's B Skill Tree is applied, Damage +x%" (that tripod), "On Back Attack hit,
		// Damage to foes +x%" (back attacks), and "on Crit Hit" after a state ("During Phantom Beast Awakening, on Crit Hit").
		const whenDestiny = !destiny && s.match(/^When (?:the )?(Destiny: [^,]+?)(?: effect)? is active, (.*)$/);
		if (whenDestiny) { when = whenDestiny[1]; s = whenDestiny[2]; }
		const whenUsing = s.match(/^When using (.+?), (Damage [+-][\d.]+%\.?)$/);
		if (whenUsing) s = `${whenUsing[1]} ${whenUsing[2]}`;
		const whenTree = !destiny && s.match(/^When ([A-Z][\w' ]+)'s ([A-Z][\w' ]+) Skill Tree is applied, (Damage [+-][\d.]+%\.?)$/);
		if (whenTree && skillByName(cls, whenTree[1])) { needs = whenTree[2]; s = `${whenTree[1]} ${whenTree[3]}`; }
		const onPosition = s.match(/^On (Back|Frontal) Attack hit, Damage(?: to foes)? ([+-][\d.]+%\.?)$/);
		if (onPosition) s = `${onPosition[1]} Attack Damage ${onPosition[2]}`;
		const lateCrit = !crit && s.match(/^On Crit Hit, (Damage(?: to foes)? [+-][\d.]+%\.?)$/);
		if (lateCrit) { s = lateCrit[1].replace(/^Damage(?! to foes)/, 'Damage to foes'); crit = true; }
		const except = [];
		let exceptUnknown = false;
		s = s.replace(/\s*\((?:excluding|Excluding) ([^)]*)\)/g, (_, list) => {
			for (const item of list.split(/, and |, | and /).map((x) => x.trim()).filter(Boolean)) {
				if (/Hyper Awakening Technique/i.test(item)) except.push(...(hyper[cls] ?? []));
				else if (/^Awakening Skills?$/i.test(item)) except.push(...(awakening[cls] ?? []));
				else if (skillByName(cls, item)) except.push(...skillByName(cls, item));
				else exceptUnknown = true;
			}
			return '';
		});
		// "Lightning Tiger Strike Damage +10.5% when it hits as a Back Attack": that skill's back attack damage.
		let hitPosition;
		s = s.replace(/ (?:when it hits|if it lands) as a (Back|Frontal) Attack/, (_, p) => { hitPosition = p === 'Back' ? 'back' : 'front'; return ''; });
		// A Destiny sentence whose damage is its last clause ("When Shock Skill ends, Shock Energy +100 and Shock Skill
		// Damage +0.5%."): the buff's uptime stands for the condition, so the clause is the effect.
		const whole = s.replace(/\.$/, '');
		const last = whole.split(/, and |, | and (?=[A-Z])/).at(-1);
		let head = '';
		// Outside a Destiny buff a leading condition the run can't show ("When Supreme Art is at Third Form or above, ...")
		// keeps it text.
		const conditional = !destiny && /^(?:When|On|Upon|If|After|Each|For each) /.test(whole);
		// Nor when the whole sentence is a list of skills ("Quake Smash, Piercing Shock, and Rending Finisher's Charge Mode Damage").
		const listTarget = whole.match(/^(.+?) Damage(?: to foes)? ?[+-] ?[\d.]+%$/)?.[1];
		const listed = !!listTarget && targetOf(listTarget, cls) !== undefined;
		if (!conditional && !listed && last !== whole && /^(?:[A-Z].* )?Damage(?: to foes)? ?[+-] ?[\d.]+%$/.test(last) && !/^[A-Z][^,]* Damage [+-][\d.]+%$/.test(whole) && !/Crit|Stagger|per stack/.test(last)) {
			head = whole.slice(0, whole.length - last.length);
			s = last;
		}
		// A damage clause next to a side change with no damage stat (speed, a meter's gain, Stagger, MP recovery): "Charged
		// Shot Casting Speed +15% and Damage +10.0%", "Attack Speed and Move Speed +10.0% and Manifestation Skill Damage
		// +57.0%", "Sonic Vibration Damage +35.0% and Serenade Meter gained on hit +30.0%". The damage is valued, the side kept
		// as text. A cooldown or skill tree trade changes the rotation: left as text.
		let speed = '';
		if (!head && !/cooldown|Skill Tree/i.test(whole)) {
			const SPEED = String.raw`(?:(?:(?:Casting|Charge|Attack|Atk\.|Move)(?: Speed and (?:Move|Attack))? Speed|Atk\./Move Speed|Serenade Meter gained(?: on hit)?|Stagger Damage|MP Recovery Speed) [+-] ?[\d.]+%)`;
			const DAMAGE = String.raw`(?:.* )?(?:Damage(?: to foes)?|Crit (?:Damage|Rate)) ?[+-] ?[\d.]+%`;
			const first = whole.match(new RegExp(`^(.*?)\\s*(${SPEED}) and (${DAMAGE})$`));
			const after = whole.match(new RegExp(`^(${DAMAGE}) and (${SPEED})$`));
			const bareFirst = first && /^(?:Damage|Crit )/.test(first[3]);
			if (first && (bareFirst || !first[1])) { speed = first[2]; s = bareFirst && first[1] ? `${first[1]} ${first[3]}` : first[3]; }
			else if (after) { speed = after[2]; s = after[1]; }
		}
		// Crit Rate / Crit Damage of skills ("Hurricane Sword Crit Damage +60.0%", "Overdrive Crit Rate +10.0%"): valued
		// with each skill's logged crit rate and crit multiplier. Read as a damage line, marked by `stat`.
		let stat;
		const critStat = s.match(/^(?:(.+?) )?Crit (Damage|Rate) ([+-]) ?([\d.]+)%(.*)$/);
		if (critStat && !/^On /.test(s)) {
			stat = critStat[2] === 'Rate' ? 'critRate' : 'critDamage';
			// No skill named ("Crit Damage +10.0%"): every skill's.
			s = `${critStat[1] ? critStat[1] + ' Damage' : 'Damage to foes'} ${critStat[3]}${critStat[4]}%${critStat[5]}`;
		}
		// A bare "Damage +13.0%." continues the sentence before it (one Korean sentence split in two): the skills named
		// there ("While using World Decimation, all incoming Damage -30.0%. Damage + 13.0%.").
		const bare = s.match(/^Damage ?([+-]) ?([\d.]+)%\.?$/);
		if (bare) {
			const before = head || prev;
			const named = Object.keys(skillIds[cls] ?? {}).filter((n) => n.length > 3 && before.includes(n));
			const longest = named.filter((n) => !named.some((m) => m !== n && m.includes(n)));
			const groups = groupNames(cls).filter((g) => ` ${before} `.includes(` ${g} Skill`)).map((g) => `${g} Skill`);
			const parts = [...longest, ...groups];
			if (parts.length) s = `${parts.join(' and ')} Damage ${bare[1]}${bare[2]}%`;
		}
		const position = s.match(/^(Frontal|Front|Back) Attack Damage ([+-][\d.]+)%(.*)$/);
		if (position) s = `Damage to foes ${position[2]}%${position[3]}`;
		const foes = s.match(/^Damage to foes ([+-][\d.]+)%(.*)$/);
		const skill = s.match(/^(.+?) Damage ([+-][\d.]+)%(.*)$/);
		const target = foes ? { groups: null } : skill ? targetOf(skill[1], cls) : undefined;
		const pct = Number(foes ? foes[1] : skill?.[2]) / 100;
		const tail = (foes ? foes[2] : skill?.[3] ?? '').replace(/\.$/, '').trim();
		if (!destiny && !when) {
			const trailing = tail.match(/^in ([A-Z][\w' ]+ Mode)$/);
			if (trailing) when = trailing[1];
		}
		// "per stack" grows with stacks the logs don't count: not valued as a flat bonus.
		const perStack = /per stack/i.test(tail);
		const plain = !destiny && !perStack && (tail === '' || when);
		if (target !== undefined && !exceptUnknown && Number.isFinite(pct) && (plain || (destiny && (feature || (inBuff && buffName)) && !perStack))) {
			out.push({ pct, ...target, ...(except.length ? { except: [...new Set(except)] } : {}), ...(destiny ? { ...(feature ? { feature: feature.index, level: feature.value } : {}), ...(inBuff && buffName ? { buff: buffName } : {}) } : {}), ...(when ? { when } : {}), ...(crit ? { crit: true } : {}), ...(needs ? { tripod: needs } : {}), ...(stat ? { stat } : {}), ...(position ? { position: position[1] === 'Back' ? 'back' : 'front' } : hitPosition ? { position: hitPosition } : {}) });
			if (speed) out.push({ text: speed });
		} else out.push({ text: line.trim() });
		prev = line;
	}
	return out;
}

const cores = {};
const effects = {};
for (const [id, item] of Object.entries(items)) {
	const core = item.arkCore;
	if (!core || core.attr !== 0 || !item.class) continue;
	cores[id] = { cls: item.class, name: strip(core.name), bonuses: core.bonuses.map((b) => [b.points, b.id]) };
	for (const b of core.bonuses) if (options[b.id] && !effects[b.id]) effects[b.id] = effectsOf(options[b.id], item.class);
}

const header = `// Generated by scripts/bake-order-cores.mjs from the Maxroll feed. Do not edit by hand.
// Order Ark Grid cores: per item id, the class, name and bonuses (core points needed, option id); per option id, its
// effects parsed for the DPS meter (see the script for what each shape means).
export interface OrderCoreEffect {
	pct?: number;
	/** Skill groups the damage applies to; null = every skill. */
	groups?: string[] | null;
	/** And/or these skills (ids). */
	skills?: number[];
	/** Skills left out ("excluding Hyper Awakening Technique", "excluding Last Request"). */
	except?: number[];
	/** Only with this tripod on the effect's skills ("Possession" on Gluttony): checked against the character's skills. */
	tripod?: string;
	/** A Crit Rate / Crit Damage change (pct in percentage points) instead of a damage multiplier. */
	stat?: 'critRate' | 'critDamage';
	/** On crit hits only: valued on the crit share of the damage. */
	crit?: boolean;
	/** Frontal or back attacks only: valued on the logged front/back attack damage. */
	position?: 'front' | 'back';
	/** Only while in this state ("Deathlord Mode", "Brawl King Stance", "Possession"): valued on the damage the logs
	 *  recorded under the player's buff of that name. */
	when?: string;
	/** A Destiny effect: the ability feature and its level, and the buff's name when the effect names it (the logs
	 *  record the buff under that name: "Destiny: Footsteps of the Dead"). */
	buff?: string;
	feature?: number;
	level?: number;
	/** Not valued: the option's own words. */
	text?: string;
}
`;
for (const es of Object.values(effects)) for (const e of es) if (e.tripod) for (const id of e.skills ?? []) usedTripodSkills.add(id);
const tiers = Object.fromEntries([...usedTripodSkills].filter((id) => tripodTiers[id]).map((id) => [id, tripodTiers[id]]));
writeFileSync('src/lib/upgrade-planner/order-cores.ts', `${header}
export const ORDER_CORES: Record<number, { cls: string; name: string; bonuses: [points: number, option: number][] }> = ${JSON.stringify(cores)};

export const ORDER_CORE_EFFECTS: Record<number, OrderCoreEffect[]> = ${JSON.stringify(effects)};

/** Tripod names by tier, for the skills tripod effects name (a character's skills pick one per tier, 1-based). */
export const TRIPOD_TIERS: Record<number, string[][]> = ${JSON.stringify(tiers)};
`);
console.log(Object.keys(cores).length, 'cores,', Object.keys(effects).length, 'options');
