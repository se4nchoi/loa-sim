/** A cap must be stated in this option. Conflicting caps need a named-stack model, not a guess.
 * @param {string} description */
export function stackCap(description) {
	const caps = [...description.matchAll(/\b(?:Max\.?\s+(\d+)\s+stacks|Up to\s+(\d+)\s+stacks|stackable up to\s+(\d+)\s+times|max stack count increases to\s+(\d+))/gi)]
		.map(m => Number(m[1] ?? m[2] ?? m[3] ?? m[4]));
	const unique = [...new Set(caps)];
	return unique.length === 1 && unique[0] > 0 ? unique[0] : null;
}

/** Normalize only explicit damage bonuses. Target names still have to resolve in the game's skill table.
 * @param {string} line
 * @param {string} description
 * @param {string} previous */
export function assumedDamage(line, description, previous = '') {
	if (/cooldown|Skill Tree|always hits as|Selected skill|Damage Increase effect|party members/i.test(line)) return null;
	let s = line.replace(/\.$/, '').trim();
	let assumed;
	let stacks;
	const perStack = / per stack$/.test(s);
	if (perStack || /^At max stacks, /.test(s)) {
		stacks = stackCap(description);
		if (!stacks) return null;
		assumed = 'max-stacks';
		if (perStack) s = s.replace(/ per stack$/, '');
		s = s.replace(/^At max stacks, /, '').replace(/^Also, the max stack count increases to \d+, and /, '');
		// These effects consume their stacks on a named skill; the damage clause can be in the same sentence.
		s = s.replace(/^Consumed (?:on|upon using) .+?, increasing /, '');
		if (/^Damage [+-][\d.]+%$/.test(s)) {
			const consumers = [...previous.matchAll(/(?:On (.+?) use, consume|Consumed (?:on|upon using) (.+?) use[.,])/g)];
			const consumer = consumers.at(-1);
			if (!consumer) return null;
			s = `${consumer[1] ?? consumer[2]} ${s}`;
		}
	}
	// One trigger, one named damage bonus. Multiple alternative trigger bonuses on the same skill aren't combined.
	if (/^Upon (?:using|entering) [^,]+, /.test(s)) {
		s = s.replace(/^Upon (?:using|entering) [^,]+, (?:next )?/, '');
		assumed ??= 'full-uptime';
	}
	if (/^Damage of next (.+) ([+-][\d.]+%)/.test(s)) {
		s = s.replace(/^Damage of next (.+) ([+-][\d.]+%)/, '$1 Damage $2');
		assumed ??= 'full-uptime';
	}
	if (/ for [\d.]+s$| for \d+ (?:use\(s\)|time\(s\)|casts?)$/.test(s)) {
		s = s.replace(/ for [\d.]+s$| for \d+ (?:use\(s\)|time\(s\)|casts?)$/, '');
		assumed ??= 'full-uptime';
	}
	if (!assumed || !/^(?:.+? Damage|Damage to foes) [+-][\d.]+%$/.test(s)) return null;
	// The cap is metadata for threshold bonuses; only a per-stack amount is multiplied by it.
	return { line: s, assumed, ...(stacks ? { stacks } : {}), scale: perStack ? stacks : 1 };
}
