// Bakes order Ark Grid cores (bonuses by points) and their effects, parsed for the DPS meter, from the Maxroll feed
// cache (cache/maxroll-items.json, cache/maxroll-stats.json) into src/lib/upgrade-planner/order-cores.ts.
//   node scripts/bake-order-cores.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { groupNames } from './skill-group-map.mjs';

const items = JSON.parse(readFileSync('cache/maxroll-items.json', 'utf8'));
const options = JSON.parse(readFileSync('cache/maxroll-stats.json', 'utf8')).arkGridCoreOptions;
const skillTable = JSON.parse(readFileSync('cache/maxroll-skills.json', 'utf8'));
// Class → skill name → ids, for effects on one skill ("Astaros Damage +18%").
const skillIds = {};
for (const [id, k] of Object.entries(skillTable)) if (k?.class && k.name) ((skillIds[k.class] ??= {})[k.name] ??= []).push(Number(id));

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// What an effect names, part by part ("Ghast Skill and Deathlord Skill", "Rending Finisher and Exploding Finisher",
// "Phantom Beast Skills"): each part is one of the class's groups (scripts/skill-group-map.mjs) or a skill by name.
// → { groups, skills }; undefined when a part is neither.
const targetOf = (target, cls) => {
	const names = groupNames(cls);
	const groups = [], skillList = [];
	for (const raw of target.split(' and ')) {
		const part = raw.trim();
		const group = part.match(/^(.+?) Skills?$/)?.[1];
		if (group && names.includes(group)) { groups.push(group); continue; }
		const ids = skillIds[cls]?.[part] ?? (group ? skillIds[cls]?.[group] : undefined);
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
	let inBuff = false, sticky, buffName;
	for (const line of strip(option.desc.replace(/<br>|\n/gi, '\n')).split(/(?<=\.)\s+(?=[A-Z])/)) {
		let s = line.trim();
		if (!s) continue;
		// A Destiny buff's lines: "Destiny: Death Sentence: ..." and the sentences after it.
		let destiny = inBuff;
		const named = s.match(/^(Destiny: [^:]+): (.*)$/);
		if (named) { buffName = named[1]; s = named[2]; destiny = inBuff = true; }
		if (/^On Destiny (is )?activation, gain the Destiny: .* effect/.test(s)) continue; // the buff line follows
		const onDestiny = s.match(/^On Destiny (?:is )?activation, (?:next )?(.*)$/);
		if (onDestiny) { s = onDestiny[1]; destiny = true; }
		// "While Destiny: Decimation is active, ...": in the state of that Destiny buff (the logs name it).
		const whileDestiny = !destiny && s.match(/^While (Destiny: [^,]+) is active, (.*)$/);
		if (whileDestiny) { sticky = whileDestiny[1]; s = whileDestiny[2]; }
		// Inside a Destiny effect the buff's own uptime stands for its condition ("Destiny: Decimation: While in Hype Mode, ...").
		if (destiny) s = s.replace(/^(?:In|While in|While using) [A-Z][\w' ]+, /, '');
		// A state the effect needs ("In Deathlord Mode, ...", "With Possession, ..."): valued on the damage dealt in it.
		let when = sticky;
		const state = !destiny && s.match(/^(?:(?:In|While in) ([A-Z][\w' ]+ (?:Mode|Stance))|With ([A-Z][\w' ]+)), (.*)$/);
		if (state) { when = sticky = state[1] ?? state[2]; s = state[3]; } // and the sentences after it
		s = s.charAt(0).toUpperCase() + s.slice(1);
		// A Destiny sentence whose damage is its last clause ("When Shock Skill ends, Shock Energy +100 and Shock Skill
		// Damage +0.5%."): the buff's uptime stands for the condition, so the clause is the effect.
		const last = s.replace(/\.$/, '').split(/, | and (?=[A-Z])/).at(-1);
		if (destiny && last !== s.replace(/\.$/, '') && /^[A-Z].* Damage [+-][\d.]+%$/.test(last) && !/^[A-Z][^,]* Damage [+-][\d.]+%\.?$/.test(s)) s = last;
		const foes = s.match(/^Damage to foes ([+-][\d.]+)%(.*)$/);
		const skill = s.match(/^(.+?) Damage ([+-][\d.]+)%(.*)$/);
		const target = foes ? { groups: null } : skill ? targetOf(skill[1], cls) : undefined;
		const pct = Number(foes ? foes[1] : skill?.[2]) / 100;
		const tail = (foes ? foes[2] : skill?.[3] ?? '').replace(/\.$/, '').trim();
		if (!destiny && !when) {
			const trailing = tail.match(/^in ([A-Z][\w' ]+ Mode)$/);
			if (trailing) when = trailing[1];
		}
		const plain = !destiny && (tail === '' || when);
		if (target !== undefined && Number.isFinite(pct) && (plain || (destiny && feature))) {
			out.push({ pct, ...target, ...(destiny ? { feature: feature.index, level: feature.value, ...(inBuff && buffName ? { buff: buffName } : {}) } : {}), ...(when ? { when } : {}) });
		} else out.push({ text: line.trim() });
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
writeFileSync('src/lib/upgrade-planner/order-cores.ts', `${header}
export const ORDER_CORES: Record<number, { cls: string; name: string; bonuses: [points: number, option: number][] }> = ${JSON.stringify(cores)};

export const ORDER_CORE_EFFECTS: Record<number, OrderCoreEffect[]> = ${JSON.stringify(effects)};
`);
console.log(Object.keys(cores).length, 'cores,', Object.keys(effects).length, 'options');
