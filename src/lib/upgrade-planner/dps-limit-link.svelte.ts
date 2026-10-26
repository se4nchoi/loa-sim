// "no DPS" chips on the simulator's cards point at the DPS sim's explanation of that limit: DpsModePanel opens its
// hint and scrolls to the limit's card.
export type DpsLimitKey = 'cores' | 'karma' | 'paradise' | 'stacks' | 'summons' | 'cooldown' | 'bracelet';

export const dpsLimitRequest = $state<{ key: DpsLimitKey | null; count: number }>({ key: null, count: 0 });

export function showDpsLimit(key: DpsLimitKey) {
	dpsLimitRequest.key = key;
	dpsLimitRequest.count++;
}
