// Tests only: a D1-shaped wrapper over node:sqlite with the real D1 migrations applied.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import type { D1Database, D1PreparedStatement } from './d1';

export function testD1(): D1Database & { sqlite: DatabaseSync } {
	const sqlite = new DatabaseSync(':memory:');
	for (const file of readdirSync('migrations/d1').filter(f => f.endsWith('.sql')).sort())
		sqlite.exec(readFileSync(`migrations/d1/${file}`, 'utf8'));
	const statement = (query: string, values: unknown[] = []): D1PreparedStatement & { rows(): Record<string, unknown>[] } => {
		const rows = () => sqlite.prepare(query).all(...values as SQLInputValue[]) as Record<string, unknown>[];
		return {
			bind: (...next) => statement(query, next), rows,
			all: async <T>() => ({ results: rows() as T[] }),
			first: async <T>() => (rows()[0] ?? null) as T | null,
			run: async () => { rows(); return {}; },
		};
	};
	return {
		sqlite,
		prepare: query => statement(query),
		async batch<T>(list: D1PreparedStatement[]) {
			sqlite.exec('BEGIN');
			try {
				const out = list.map(s => ({ results: (s as ReturnType<typeof statement>).rows() as T[] }));
				sqlite.exec('COMMIT');
				return out;
			} catch (e) { sqlite.exec('ROLLBACK'); throw e; }
		},
	};
}
