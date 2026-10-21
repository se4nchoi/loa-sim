// The DPS tab became DPS mode on the Simulator; old links land there.
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const c = url.searchParams.get('c');
	redirect(308, `/sim?${c ? `c=${encodeURIComponent(c)}&` : ''}mode=dps`);
};
