// The parts of Cloudflare's D1 binding that the stats code uses. Declared here instead of pulling in
// @cloudflare/workers-types for the whole project. The binding is STATS_DB in wrangler.toml.
export interface D1Result<T = Record<string, unknown>> { results: T[] }
export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	run(): Promise<unknown>;
}
export interface D1Database {
	prepare(query: string): D1PreparedStatement;
	/** Runs the statements in one transaction: all of them commit, or none do. */
	batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/** The stats database for this request, or undefined outside Cloudflare (dev, tests) or without the binding. */
export const statsDb = (platform: App.Platform | undefined): D1Database | undefined => platform?.env?.STATS_DB;
