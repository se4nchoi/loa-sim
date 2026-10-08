import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizationUrl, exchangeCallback, inspectEndpoint } from './oauth-test';

afterEach(() => vi.unstubAllGlobals());

describe('OAuth inspector', () => {
	it('creates a PKCE request without a secret and binds it to the callback', async () => {
		const pending = new Map<string, string>();
		vi.stubGlobal('sessionStorage', { setItem: (k: string, v: string) => pending.set(k, v) });
		const url = new URL(await authorizationUrl('http://localhost:5173/oauth-test'));
		const saved = JSON.parse([...pending.values()][0]);
		expect(url.searchParams.get('state')).toBe(saved.state);
		expect(url.searchParams.get('code_challenge_method')).toBe('S256');
		expect(url.searchParams.get('code_challenge')).not.toBe(saved.verifier);
		expect(saved.verifier).toHaveLength(43);
		expect(url.searchParams.has('client_secret')).toBe(false);
	});

	it('rejects mismatched state before exchanging a code and removes it from the URL', async () => {
		vi.stubGlobal('sessionStorage', {
			getItem: () => JSON.stringify({ state: 'expected', createdAt: Date.now(), redirectUri: 'http://localhost:5173/oauth-test' }),
			removeItem: vi.fn()
		});
		const replaceState = vi.fn();
		vi.stubGlobal('history', { replaceState });
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(exchangeCallback(new URL('http://localhost:5173/oauth-test?code=test&state=wrong'))).rejects.toThrow('could not be verified');
		expect(fetch).not.toHaveBeenCalled();
		expect(replaceState).toHaveBeenCalledWith(undefined, '', '/oauth-test');
	});

	it('never sends a bearer token to another origin', async () => {
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		await expect(inspectEndpoint('test-token', 'https://example.com/api/oauth/user')).rejects.toThrow('Invalid API endpoint');
		expect(fetch).not.toHaveBeenCalled();
	});
});
