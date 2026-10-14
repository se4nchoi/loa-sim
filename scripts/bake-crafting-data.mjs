// Bake public workshop facts from Lost Ark Codex. Raw indexes and pages are cached locally.
import fs from 'node:fs';
const root = 'cache/crafting';
fs.mkdirSync(root, { recursive: true });
async function cached(name, url) {
	const path = `${root}/${name}`;
	if (fs.existsSync(path)) return fs.readFileSync(path, 'utf8');
	const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
	if (!r.ok) throw new Error(`${url}: ${r.status}`);
	const text = await r.text();
	fs.writeFileSync(path, text);
	return text;
}
const plain = (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
const items = JSON.parse(fs.readFileSync('cache/maxroll-items.json', 'utf8'));
const rows = JSON.parse(await cached('recipes.json', 'https://lostarkcodex.com/query.php?a=recipes&type=town&l=us')).aaData;
const categories = {};
for (const [slug, category] of Object.entries({ battle: 'Battle Item', culinary: 'Cooking', buildings: 'Structure', tools: 'Tools', other: 'Special' })) {
	const data = JSON.parse(await cached(`${slug}.json`, `https://lostarkcodex.com/query.php?a=recipes&type=town&slot=${slug}&l=us`));
	for (const row of data.aaData) categories[row[0]] = category;
}
function stacks(html, detail) {
	return html.split('<div class="iconset_wrapper_medium inlinediv">').filter((block) => block.includes('data-id="item--')).map((block) => {
		const id = block.match(/data-id="item--(\d+)"/)[1];
		const item = items[id];
		const name = item?.name ?? plain(detail.match(new RegExp(`data-id="item--${id}"[^>]*>([^<]+)</a>`))?.[1] ?? `Item ${id}`);
		const icon = item?.icon ?? block.match(/\/icons\/([^".]+)/)?.[1];
		return { material: { id, name, icon: icon ?? 'Use_10_82', grade: item?.grade ?? Number(block.match(/icon_grade_(\d+)/)?.[1] ?? 0), bundle: item && item.category >= 70200 && item.category < 70300 ? 100 : 1 }, quantity: Number((block.match(/class="quantity[^>]*title="([\d,]+)"/)?.[1] ?? '1').replaceAll(',', '')) };
	});
}
const output = [];
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
	while (cursor < rows.length) {
		const row = rows[cursor++];
		const id = row[0];
		const html = await cached(`${id}.html`, `https://lostarkcodex.com/us/recipe/${id}/`);
		const content = html.slice(html.indexOf(`ID: ${id}`), html.indexOf('You are not signed in!'));
		const time = content.match(/Time Taken:\s*([^<]+)/)?.[1];
		const minutes = time ? [...time.matchAll(/(\d+)\s*([dhms])/g)].reduce((sum, m) => sum + Number(m[1]) * ({ d: 1440, h: 60, m: 1, s: 1 / 60 })[m[2]], 0) : null;
		const money = (type) => Number(content.match(new RegExp(`([\\d,]+)<img src="/images/icon_${type}\\.webp"`))?.[1]?.replaceAll(',', '') ?? 0);
		const products = stacks(row[5], content);
		const ingredients = stacks(row[4], content);
		if (products.length !== 1 || !ingredients.length || minutes === null) throw new Error(`Incomplete recipe ${id}`);
		const product = products[0].material;
		product.name = plain(row[2]);
		const category = categories[id] ?? (ingredients.some((i) => i.material.id.startsWith('689')) ? 'Farm (Bound)' : 'Special');
		const path = content.match(/Crafting Recipe:[^<]*?\((Foraging|Logging|Mining|Hunting|Fishing|Excavating)\)/)?.[1] ?? category;
		let tradeable = items[product.id]?.bindType === 0;
		if (!items[product.id] && category !== 'Farm (Bound)') {
			const itemPage = await cached(`item-${product.id}.html`, `https://lostarkcodex.com/us/item/${product.id}/`);
			const itemText = plain(itemPage.slice(itemPage.indexOf(`ID: ${product.id}`), itemPage.indexOf('You are not signed in!')));
			tradeable = !/Bound to|Untradable|Cannot be traded|Unable to trade/i.test(itemText);
		}
		const manorCategory = category === 'Farm (Bound)' ? product.name.startsWith('Cooking:') ? 'Cooking' : product.name.startsWith('Battle Item:') ? 'Battle Item' : product.name.startsWith('Tool:') ? 'Tools' : 'Special' : category;
		output.push({ id: String(id), product, category, manorCategory, path, output: products[0].quantity, gold: money('gold'), silver: money('silver'), minutes, energy: money('town_energy'), ingredients,
			tradeable: tradeable && category !== 'Farm (Bound)', source: `https://lostarkcodex.com/us/recipe/${id}/` });
		if (output.length % 50 === 0) console.log(`${output.length}/${rows.length}`);
	}
}));
output.sort((a, b) => a.product.name.localeCompare(b.product.name) || a.id.localeCompare(b.id));
fs.writeFileSync('src/lib/crafting/catalog.json', JSON.stringify(output, null, 2) + '\n');
console.log(`Baked ${output.length} workshop recipes.`);
