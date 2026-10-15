// Item rarity, indexed like the catalog's icon backgrounds.
const GRADES = [
	{ name: 'Common', color: '#e5e7eb' },
	{ name: 'Uncommon', color: '#91e35e' },
	{ name: 'Rare', color: '#5ab6ff' },
	{ name: 'Epic', color: '#c985ff' },
	{ name: 'Legendary', color: '#ffbd48' },
	{ name: 'Relic', color: '#ff8750' },
	{ name: 'Ancient', color: '#e8d7ad' },
	{ name: 'Sidereal', color: '#55dbc8' }
];
export const itemGrade = (grade: number) => GRADES[grade] ?? GRADES[0];
