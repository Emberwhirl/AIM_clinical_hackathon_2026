import postgres from "npm:postgres";
import {
  COLUMNS,
  type Resource,
  roundTripDifference,
  type SourceRow,
  type SourceTables,
  TABLES,
  toFhir,
} from "../supabase/functions/_shared/fhir.ts";
import { schemaName } from "../supabase/functions/_shared/spe.ts";

/**
 * CLI: deno run -A scripts/export-fhir.ts <requestId>
 *
 * Maps the secure processing environment spe_<requestId> to HL7 FHIR R4
 * (docs/fhir-mapping.md) and stores the resources in
 * spe_<requestId>.fhir_resources, locked down like the other SPE tables.
 * It reads and writes only that schema: public tables, and so every API
 * answer, stay unchanged. The export aborts unless mapping the resources
 * back reproduces every source row.
 */

type Sql = ReturnType<typeof postgres>;
const BATCH = 2000;

export async function exportFhir(
  sql: Sql,
  requestId: string,
): Promise<Record<string, number>> {
  const schema = schemaName(requestId);
  return await sql.begin(async (tx) => {
    // Same lock as createSpe, so a rebuild cannot swap the cohort mid-export.
    await tx.unsafe(
      "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [schema],
    );
    const present = await tx.unsafe(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = $1`,
      [schema],
    );
    if (!present.length) throw new Error(`No secure environment ${schema}`);
    const source: SourceTables = {};
    for (const table of TABLES) {
      // Identifiers come from the code's allowlist, filtered by the catalogue.
      const columns = COLUMNS[table].filter((c) =>
        present.some((r) => r.table_name === table && r.column_name === c)
      );
      if (!columns.length) continue;
      source[table] = await tx.unsafe(
        `SELECT ${columns.map((c) => `${c}::text AS ${c}`).join(", ")}
         FROM ${schema}.${table} ORDER BY ${columns.join(", ")}`,
      ) as unknown as SourceRow[];
    }
    const resources: Resource[] = toFhir(source);
    const difference = roundTripDifference(source, resources);
    if (difference) throw new Error(`Mapping is not lossless: ${difference}`);

    await tx.unsafe(`DROP TABLE IF EXISTS ${schema}.fhir_resources`);
    await tx.unsafe(
      `CREATE TABLE ${schema}.fhir_resources (
         resource_type text NOT NULL,
         id text NOT NULL,
         resource jsonb NOT NULL,
         PRIMARY KEY (resource_type, id)
       )`,
    );
    for (let i = 0; i < resources.length; i += BATCH) {
      await tx.unsafe(
        `INSERT INTO ${schema}.fhir_resources (resource_type, id, resource)
         SELECT r->>'resourceType', r->>'id', r
         FROM jsonb_array_elements($1::text::jsonb) AS r`,
        [JSON.stringify(resources.slice(i, i + BATCH))],
      );
    }
    await tx.unsafe(
      `ALTER TABLE ${schema}.fhir_resources ENABLE ROW LEVEL SECURITY`,
    );
    await tx.unsafe(
      `REVOKE ALL ON TABLE ${schema}.fhir_resources FROM PUBLIC, anon, authenticated`,
    );
    await tx.unsafe(
      `GRANT SELECT ON TABLE ${schema}.fhir_resources TO service_role`,
    );
    const counts: Record<string, number> = {};
    for (const r of resources) {
      counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
    }
    return counts;
  });
}

if (import.meta.main) {
  try {
    if (Deno.args.length !== 1) {
      throw new Error("Usage: deno run -A scripts/export-fhir.ts <requestId>");
    }
    const url = Deno.env.get("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = postgres(url, {
      max: 1,
      connect_timeout: 10,
      idle_timeout: 10,
    });
    try {
      console.log(JSON.stringify(await exportFhir(sql, Deno.args[0]), null, 2));
    } finally {
      await sql.end();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  }
}
