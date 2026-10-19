import { ENGRAVING_ICONS } from './game-data';

/** All selectable combat engravings; 1800+ are ability-stone penalties, not engraving choices. */
export const COMBAT_ENGRAVING_IDS = Object.keys(ENGRAVING_ICONS).map(Number).filter((id) => id < 1800);
export const ZERO_ENGRAVING_TABLE = Array.from({ length: 5 }, () => Array<number>(5).fill(0));
export const constantEngravingTable = (value: number) => Array.from({ length: 5 }, () => Array<number>(5).fill(value));
