// The CP / DPS switch lives in the top bar, but the mode belongs to the page showing a character (the simulator, a
// shared build): that page puts its mode and setter here while it's on screen, and the bar shows the switch for it.

export interface NavMode {
	dpsMode: boolean;
	onmode: (mode: 'cp' | 'dps') => void;
}

export const navMode = $state<{ current: NavMode | null }>({ current: null });

/** Shows the switch for this page while `mode` is set; call from an $effect so it clears when the page goes. */
export function useNavMode(mode: NavMode | null) {
	navMode.current = mode;
	return () => {
		if (navMode.current === mode) navMode.current = null;
	};
}
