#!/usr/bin/env tsx
/**
 * Quick Neon/Postgres connectivity check (no secrets printed).
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('FAIL: DATABASE_URL is not set');
  process.exit(1);
}

const hostMatch = databaseUrl.match(/@([^/]+)/);
const host = hostMatch?.[1] ?? 'unknown';
console.log(`Target: ${host}`);
console.log(`SSL: ${databaseUrl.includes('sslmode=require') ? 'required' : 'check URL'}`);
console.log('Connecting (up to 45s — Neon free tier may cold-start)...');

const started = Date.now();
const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 45,
  idle_timeout: 5,
});

const watchdog = setTimeout(() => {
  console.error('FAIL: timed out after 45s (DB may be paused, credentials wrong, or network blocked)');
  process.exit(2);
}, 46_000);

try {
  const [ping] = await sql`SELECT 1 AS ok, current_database() AS db`;
  console.log(`OK: connected in ${Date.now() - started}ms`);
  console.log(`Database name: ${ping.db}`);

  const tables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log(`Public tables: ${tables.length}`);
  for (const row of tables.slice(0, 15)) {
    console.log(`  - ${row.tablename}`);
  }
  if (tables.length > 15) {
    console.log(`  ... +${tables.length - 15} more`);
  }

  const required = ['markets', 'orders', 'trades', 'positions'];
  const copyTrading = ['tracked_traders', 'copied_trades'];
  const names = new Set(tables.map((t) => t.tablename));
  const missing = required.filter((t) => !names.has(t));
  if (missing.length) {
    console.warn(`WARN: missing core tables: ${missing.join(', ')} — run: pnpm db:push`);
  } else {
    console.log('OK: core trading tables present');
  }
  const missingCopy = copyTrading.filter((t) => !names.has(t));
  if (missingCopy.length) {
    console.warn(
      `WARN: copy-trading tables missing (${missingCopy.join(', ')}) — run: pnpm db:push if you use copy trading`
    );
  } else {
    console.log('OK: copy-trading tables present');
  }
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`FAIL: ${msg}`);
  process.exit(1);
} finally {
  clearTimeout(watchdog);
  await sql.end({ timeout: 5 });
}
