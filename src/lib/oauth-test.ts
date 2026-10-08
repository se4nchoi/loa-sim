// Development-only browser OAuth inspector. Access tokens stay in memory.
export const OAUTH_ORIGIN = 'https://lostark.bible';
export const DEVELOPMENT_CLIENT_ID = 'qvijci2n42byjf4eg7vd4yo2s4';
const PENDING_KEY = 'loa-sim:oauth-test:pending';

interface PendingAuthorization {
	state: string;
	verifier: string;
	redirectUri: string;
	createdAt: number;
}

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function authorizationUrl(redirectUri: string): Promise<string> {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
	const pending: PendingAuthorization = { state, verifier, redirectUri, createdAt: Date.now() };
	sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
	const url = new URL('/oauth/authorize', OAUTH_ORIGIN);
	url.search = new URLSearchParams({
		client_id: DEVELOPMENT_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
		scope: 'identify rosters logs', state, code_challenge: challenge, code_challenge_method: 'S256'
	}).toString();
	return url.href;
}

export async function exchangeCallback(url: URL): Promise<string | null> {
	if (!url.searchParams.has('code') && !url.searchParams.has('error')) return null;
	const raw = sessionStorage.getItem(PENDING_KEY);
	sessionStorage.removeItem(PENDING_KEY);
	// Remove single-use codes from the address bar even when validation fails.
	history.replaceState(history.state, '', url.pathname);
	const pending: PendingAuthorization | null = raw ? JSON.parse(raw) : null;
	if (!pending || url.searchParams.get('state') !== pending.state
		|| Date.now() - pending.createdAt > 10 * 60 * 1000
		|| pending.redirectUri !== `${url.origin}${url.pathname}`)
		throw new Error('Sign-in expired or could not be verified. Connect again.');
	if (url.searchParams.has('error')) throw new Error(`Sign-in failed: ${url.searchParams.get('error')}`);
	const response = await fetch(`${OAUTH_ORIGIN}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code')!,
			redirect_uri: pending.redirectUri, client_id: DEVELOPMENT_CLIENT_ID, code_verifier: pending.verifier })
	});
	const body = await response.json();
	if (!response.ok || typeof body.access_token !== 'string')
		throw new Error(`Token exchange failed (${response.status}): ${body.error_description ?? body.error ?? 'Unknown error'}`);
	return body.access_token;
}

export async function inspectEndpoint(token: string, path: string): Promise<{ status: number; body: unknown }> {
	const url = new URL(path, OAUTH_ORIGIN);
	if (url.origin !== OAUTH_ORIGIN || !url.pathname.startsWith('/api/oauth/')) throw new Error('Invalid API endpoint');
	const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
	return { status: response.status, body: await response.json() };
}
