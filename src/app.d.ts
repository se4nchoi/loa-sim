import type { D1Database } from '$lib/server/d1';

declare global {
	namespace App {
		interface Platform {
			env?: { STATS_DB?: D1Database };
		}
	}
}

export {};
