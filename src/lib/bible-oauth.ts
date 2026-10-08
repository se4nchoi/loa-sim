// Sign in with lostark.bible (OAuth 2: Authorization Code + PKCE, public client) to list the player's roster.
// Tokens last 90 days with no refresh; the player signs in again after that. The token stays in this browser
// (localStorage) and only reads the player's own user/roster data from bible's OAuth API (CORS-enabled).

import { dev } from '$app/environment';
import { REGIONS, normalizeName, type Region } from './bible-data';

export const OAUTH_ORIGIN = 'https://lostark.bible';
const CLIENT_ID = dev ? 'qvijci2n42byjf4eg7vd4yo2s4' : 'uvwecxlovozyjsnmekppj4dr4i';
const SCOPE = 'identify rosters';
const TOKEN_KEY = 'loa-sim:bible-token';
const PENDING_KEY = 'loa-sim:bible-sign-in';
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
/** Used when localStorage is blocked: signed in for this page only. */
let memoryToken: string | null = null;

/** The registered redirect URIs: the site root in production, /oauth-test on localhost. */
export const redirectUri = () => (dev ? `${location.origin}/oauth-test` : location.origin);
const sameUri = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '');

function base64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sends the player to lostark.bible to sign in; they come back to redirectUri(). */
export async function startSignIn() {
	const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
	const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
	const redirect = redirectUri();
	sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, verifier, redirect, at: Date.now() }));
	const url = new URL('/oauth/authorize', OAUTH_ORIGIN);
	url.search = new URLSearchParams({
		client_id: CLIENT_ID,
		redirect_uri: redirect,
		response_type: 'code',
		scope: SCOPE,
		state,
		code_challenge: challenge,
		code_challenge_method: 'S256'
	}).toString();
	location.href = url.href;
}

/**
 * Finishes a sign-in this app started, if the URL is its callback. Returns false when there's nothing to finish
 * (no callback, or one started elsewhere, e.g. the dev OAuth inspector). Throws a player-readable error otherwise.
 */
export async function completeSignIn(url: URL): Promise<boolean> {
	if (!url.searchParams.has('code') && !url.searchParams.has('error')) return false;
	const raw = sessionStorage.getItem(PENDING_KEY);
	if (!raw) return false;
	sessionStorage.removeItem(PENDING_KEY);
	// Single-use code: take it out of the address bar whatever happens next.
	history.replaceState(history.state, '', url.pathname);
	const pending = JSON.parse(raw) as { state: string; verifier: string; redirect: string; at: number };
	if (
		url.searchParams.get('state') !== pending.state ||
		Date.now() - pending.at > PENDING_MAX_AGE_MS ||
		!sameUri(pending.redirect, `${url.origin}${url.pathname}`)
	)
		throw new Error('Sign-in expired or could not be verified. Please sign in again.');
	if (url.searchParams.has('error')) throw new Error(`Sign-in was cancelled (${url.searchParams.get('error')}).`);
	const res = await fetch(`${OAUTH_ORIGIN}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code: url.searchParams.get('code')!,
			redirect_uri: pending.redirect,
			client_id: CLIENT_ID,
			code_verifier: pending.verifier
		})
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok || typeof body.access_token !== 'string')
		throw new Error(`Sign-in failed (${res.status}): ${body.error_description ?? body.error ?? 'unknown error'}`);
	const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 90 * 24 * 3600;
	try {
		localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: body.access_token, expiresAt: Date.now() + expiresIn * 1000 }));
	} catch {
		memoryToken = body.access_token;
	}
	return true;
}


/** The stored access token, or null when signed out or expired. */
export function bibleToken(): string | null {
	try {
		const raw = localStorage.getItem(TOKEN_KEY);
		if (raw) {
			const { token, expiresAt } = JSON.parse(raw) as { token: string; expiresAt: number };
			if (Date.now() < expiresAt) return token;
			localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(ROSTER_KEY);
		}
	} catch {
		/* fall through */
	}
	return memoryToken;
}

export function signOut() {
	memoryToken = null;
	try {
		localStorage.removeItem(TOKEN_KEY);
	} catch {
		/* nothing stored */
	}
}

export interface RosterCharacter {
	name: string;
	region: Region;
	/** bible class id (e.g. "soul_eater"), when given. */
	classId?: string;
	ilvl?: number;
	/** Last time bible saw the character, epoch ms. */
	lastUpdate?: number;
	/** Combat Power, when the roster includes it (support = the support score). */
	cp?: { score: number; support: boolean };
}

const asRegion = (v: unknown): Region | null => {
	const r = String(v ?? '').toUpperCase();
	return (REGIONS as readonly string[]).includes(r) ? (r as Region) : null;
};
const asTime = (v: unknown): number | undefined => {
	const t = typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : NaN;
	return Number.isFinite(t) ? (t < 1e12 ? t * 1000 : t) : undefined;
};

/** A combat power given as a number or as bible's { id, score } (id 2 = support). */
const asCp = (v: unknown): RosterCharacter['cp'] => {
	if (typeof v === 'number') return { score: v, support: false };
	const o = v as { id?: number; score?: number } | null;
	return typeof o?.score === 'number' ? { score: o.score, support: o.id === 2 } : undefined;
};

/** Reads the rosters response: a list of rosters (or { rosters }), each with a region and its characters. */
export function parseRosters(body: unknown): RosterCharacter[] {
	const rosters = Array.isArray(body) ? body : ((body as { rosters?: unknown[] })?.rosters ?? []);
	const out: RosterCharacter[] = [];
	for (const roster of rosters as Record<string, unknown>[]) {
		const chars = (roster?.characters ?? roster?.chars ?? []) as Record<string, unknown>[];
		for (const c of chars) {
			const region = asRegion(c.region ?? roster.region);
			if (!region || typeof c.name !== 'string' || !c.name) continue;
			out.push({
				name: normalizeName(c.name),
				region,
				classId: typeof c.class === 'string' ? c.class : typeof c.classId === 'string' ? c.classId : undefined,
				ilvl: typeof c.ilvl === 'number' ? c.ilvl : undefined,
				lastUpdate: asTime(c.lastUpdate),
				cp: asCp(c.combatPower ?? c.cp)
			});
		}
	}
	return out.sort((a, b) => (b.ilvl ?? 0) - (a.ilvl ?? 0));
}

/** The signed-in player's characters. Throws 'signed-out' when the token is missing or no longer valid. */
const ROSTER_KEY = 'loa-sim:bible-roster';
/** How long a cached roster is used before it's fetched again on page load. */
export const ROSTER_TTL_MS = 60 * 60 * 1000;

/** The roster saved by the last fetch in this browser, if any. */
export function cachedRoster(): { at: number; roster: RosterCharacter[] } | null {
	try {
		const v = JSON.parse(localStorage.getItem(ROSTER_KEY) ?? 'null');
		return v && typeof v.at === 'number' && Array.isArray(v.roster) ? v : null;
	} catch {
		return null;
	}
}

/** The signed-in player's roster from lostark.bible; saved in this browser for the next visit. */
export async function fetchRoster(): Promise<RosterCharacter[]> {
	const token = bibleToken();
	if (!token) throw new Error('signed-out');
	const res = await fetch(`${OAUTH_ORIGIN}/api/oauth/rosters`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
	if (res.status === 401) {
		signOut();
		throw new Error('signed-out');
	}
	if (!res.ok) throw new Error(`lostark.bible returned ${res.status}`);
	const roster = parseRosters(await res.json());
	try {
		localStorage.setItem(ROSTER_KEY, JSON.stringify({ at: Date.now(), roster }));
	} catch {
		/* storage blocked: fetch again next time */
	}
	return roster;
}
