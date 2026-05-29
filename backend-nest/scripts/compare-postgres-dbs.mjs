#!/usr/bin/env node
const SOURCE_URL =
  process.env.SOURCE_DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  process.env.OLD_DATABASE_URL;
const TARGET_URL =
  process.env.TARGET_DATABASE_URL ||
  process.env.VULTR_DATABASE_URL ||
  process.env.NEW_DATABASE_URL;

const shouldChecksum = !process.argv.includes('--counts-only');

if (!SOURCE_URL || !TARGET_URL) {
  console.error(`Missing database URLs.

Set both values, then rerun:
  SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." npm run db:compare

Aliases also accepted:
  NEON_DATABASE_URL / OLD_DATABASE_URL
  VULTR_DATABASE_URL / NEW_DATABASE_URL`);
  process.exit(2);
}

const { Client } = await import('pg');

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function maskUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '<invalid-url>';
  }
}

async function withClient(name, connectionString, callback) {
  const client = new Client({
    connectionString,
    application_name: `engr-db-compare-${name}`,
  });
  await client.connect();
  try {
    await client.query("SELECT set_config('statement_timeout', '10min', false)");
    await client.query('SET default_transaction_read_only = on');
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function getTables(client) {
  const result = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);
  return result.rows;
}

async function getTableStats(client, table) {
  const qualifiedName = `${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`;
  const sql = shouldChecksum
    ? `
      SELECT
        count(*)::bigint AS row_count,
        md5(coalesce(string_agg(row_hash, '' ORDER BY row_hash), '')) AS table_hash
      FROM (
        SELECT md5(to_jsonb(t)::text) AS row_hash
        FROM ${qualifiedName} AS t
      ) rows
    `
    : `SELECT count(*)::bigint AS row_count, NULL::text AS table_hash FROM ${qualifiedName}`;
  const result = await client.query(sql);
  return {
    rowCount: Number(result.rows[0].row_count),
    tableHash: result.rows[0].table_hash,
  };
}

async function getMigrations(client) {
  const exists = await client.query(`
    SELECT to_regclass('public._prisma_migrations') AS table_name
  `);
  if (!exists.rows[0].table_name) return [];

  const result = await client.query(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM public._prisma_migrations
    ORDER BY started_at, migration_name
  `);
  return result.rows;
}

async function getSequences(client) {
  const result = await client.query(`
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY sequence_schema, sequence_name
  `);

  const sequences = [];
  for (const row of result.rows) {
    const qualifiedName = `${quoteIdent(row.sequence_schema)}.${quoteIdent(row.sequence_name)}`;
    const sequenceResult = await client.query(
      `SELECT last_value::bigint AS last_value, is_called FROM ${qualifiedName}`,
    );
    sequences.push({
      schema: row.sequence_schema,
      name: row.sequence_name,
      lastValue: Number(sequenceResult.rows[0].last_value),
      isCalled: sequenceResult.rows[0].is_called,
    });
  }
  return sequences;
}

async function snapshot(name, connectionString) {
  return withClient(name, connectionString, async (client) => {
    const tables = await getTables(client);
    const tableStats = new Map();

    for (const table of tables) {
      const key = `${table.table_schema}.${table.table_name}`;
      tableStats.set(key, await getTableStats(client, table));
    }

    return {
      url: maskUrl(connectionString),
      tables: tableStats,
      migrations: await getMigrations(client),
      sequences: await getSequences(client),
    };
  });
}

function compareMaps(source, target, label, formatter) {
  const allKeys = new Set([...source.keys(), ...target.keys()]);
  const mismatches = [];

  for (const key of [...allKeys].sort()) {
    const sourceValue = source.get(key);
    const targetValue = target.get(key);
    if (JSON.stringify(sourceValue) !== JSON.stringify(targetValue)) {
      mismatches.push({
        key,
        source: sourceValue ? formatter(sourceValue) : '<missing>',
        target: targetValue ? formatter(targetValue) : '<missing>',
      });
    }
  }

  if (!mismatches.length) {
    console.log(`OK ${label} match`);
    return 0;
  }

  console.log(`FAIL ${label} mismatch (${mismatches.length})`);
  for (const mismatch of mismatches) {
    console.log(`  ${mismatch.key}`);
    console.log(`    source: ${mismatch.source}`);
    console.log(`    target: ${mismatch.target}`);
  }
  return mismatches.length;
}

function migrationMap(snapshotData) {
  return new Map(
    snapshotData.migrations.map((migration) => [
      migration.migration_name,
      {
        finished: Boolean(migration.finished_at),
        rolledBack: Boolean(migration.rolled_back_at),
      },
    ]),
  );
}

function sequenceMap(snapshotData) {
  return new Map(
    snapshotData.sequences.map((sequence) => [
      `${sequence.schema}.${sequence.name}`,
      {
        lastValue: sequence.lastValue,
        isCalled: sequence.isCalled,
      },
    ]),
  );
}

console.log('Comparing Postgres databases');
console.log(`  source: ${maskUrl(SOURCE_URL)}`);
console.log(`  target: ${maskUrl(TARGET_URL)}`);
console.log(`  checksums: ${shouldChecksum ? 'enabled' : 'disabled'}`);

const [source, target] = await Promise.all([
  snapshot('source', SOURCE_URL),
  snapshot('target', TARGET_URL),
]);

let failures = 0;

failures += compareMaps(
  source.tables,
  target.tables,
  'tables',
  (value) =>
    shouldChecksum
      ? `rows=${value.rowCount}, hash=${value.tableHash}`
      : `rows=${value.rowCount}`,
);

failures += compareMaps(migrationMap(source), migrationMap(target), 'Prisma migrations', (value) =>
  `finished=${value.finished}, rolledBack=${value.rolledBack}`,
);

failures += compareMaps(sequenceMap(source), sequenceMap(target), 'sequences', (value) =>
  `lastValue=${value.lastValue}, isCalled=${value.isCalled}`,
);

if (failures > 0) {
  console.log(`\nResult: FAIL (${failures} mismatch group(s))`);
  process.exit(1);
}

console.log('\nResult: OK - source and target match for checked tables, migrations, and sequences');
