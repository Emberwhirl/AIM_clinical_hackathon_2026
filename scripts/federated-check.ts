// deno run -A scripts/federated-check.ts (requires DATABASE_URL)
// Runs every Track 3 plan and every parseable jury request centrally and once
// per data holder, and fails unless both answers are identical.
import postgres from "npm:postgres";
import {
  type Answer,
  DATA_HOLDERS,
  runPlan,
  runPlanFederated,
  type SqlClient,
} from "../supabase/functions/_shared/engine.ts";
import { parseRequest } from "../supabase/functions/_shared/parser.ts";
import {
  type QueryPlan,
  validatePlan,
} from "../supabase/functions/_shared/plan.ts";

const fixtures = new URL("../supabase/fixtures/", import.meta.url);

async function plans(): Promise<QueryPlan[]> {
  const result: QueryPlan[] = [];
  for (let i = 1; i <= 10; i++) {
    const file = new URL(`plans/R${String(i).padStart(2, "0")}.json`, fixtures);
    const checked = validatePlan(JSON.parse(await Deno.readTextFile(file)));
    if (!checked.ok) {
      throw new Error(`${file}: ${JSON.stringify(checked.errors)}`);
    }
    result.push(checked.plan);
  }
  const jury = [...Deno.readDirSync(new URL("jury/", fixtures))]
    .map((e) => e.name).filter((n) => /^J\d+\.json$/.test(n)).sort();
  for (const name of jury) {
    const parsed = parseRequest(
      JSON.parse(await Deno.readTextFile(new URL(`jury/${name}`, fixtures))),
    );
    if (parsed.ok) result.push(parsed.plan);
  }
  return result;
}

async function main(sql: SqlClient): Promise<number> {
  const [unassigned] = await sql.unsafe(
    `SELECT count(*)::text AS n FROM public.eligible_patients
     WHERE data_holder IS NULL OR NOT (data_holder = ANY($1::text[]))`,
    [`{${DATA_HOLDERS.map((h) => `"${h}"`).join(",")}}`],
  );
  if (String(unassigned.n) !== "0") {
    console.error(
      `${unassigned.n} eligible patients have no known data holder`,
    );
    return 1;
  }
  let failures = 0;
  const rows = [];
  for (const plan of await plans()) {
    const central: Answer = await runPlan(plan, sql);
    const federated: Answer = await runPlanFederated(plan, sql);
    const same = JSON.stringify(central) === JSON.stringify(federated);
    if (!same) failures++;
    rows.push({ request: plan.request_id, result: same ? "equal" : "DIFFERS" });
  }
  console.table(rows);
  console.log(
    `${
      rows.length - failures
    }/${rows.length} federated answers equal the central answer`,
  );
  return failures ? 1 : 0;
}

if (import.meta.main) {
  const url = Deno.env.get("DATABASE_URL");
  if (!url) {
    console.error("DATABASE_URL is not set");
    Deno.exit(1);
  }
  const sql = postgres(url, { max: 1, connect_timeout: 10 });
  try {
    Deno.exitCode = await main(sql);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exitCode = 1;
  } finally {
    await sql.end();
  }
}
