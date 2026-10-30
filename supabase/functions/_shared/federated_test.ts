import {
  buildQueries,
  DATA_HOLDERS,
  runPlan,
  runPlanFederated,
  type SqlClient,
} from "./engine.ts";
import type { QueryPlan } from "./plan.ts";

function assert(ok: boolean, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}
function equal(actual: unknown, expected: unknown): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}
type Row = Record<string, unknown>;

const plan: QueryPlan = {
  request_id: "federated",
  cohort_filters: [{ type: "has_condition", icd10_prefixes: ["E11"] }],
  count_unit: "patient",
  dimensions: [{ by: "region" }],
  metrics: [
    { type: "count", label: "patients" },
    {
      type: "percentage",
      label: "with_hba1c_pct",
      numerator_filters: [{ type: "has_observation", loinc: "4548-4" }],
      denominator_label: "patients",
    },
    {
      type: "mean_observation",
      label: "mean_hba1c",
      loinc: "4548-4",
      use_latest: true,
    },
  ],
};

/** Per-hospital rows for: region universe, patients, with_hba1c_pct, mean_hba1c. */
const hospitals: Record<string, Row[][]> = {
  "Klinikum Nord": [
    [{ value: "Tirol" }, { value: "Wien" }],
    [{ g0: "Tirol", n: "6" }, { g0: "Wien", n: "4" }],
    [{ g0: "Tirol", n: "5" }, { g0: "Wien", n: "2" }],
    [{ g0: "Tirol", n: "5", total: "30.25" }, {
      g0: "Wien",
      n: "2",
      total: "13",
    }],
  ],
  "Klinikum Süd": [
    [{ value: "Wien" }],
    [{ g0: "Wien", n: "3" }],
    [{ g0: "Wien", n: "3" }],
    [{ g0: "Wien", n: "3", total: "19.5" }],
  ],
  "Klinikum West": [
    [{ value: "Salzburg" }, { value: "Tirol" }],
    [{ g0: "Salzburg", n: "12" }, { g0: "Tirol", n: "5" }],
    [{ g0: "Salzburg", n: "10" }, { g0: "Tirol", n: "5" }],
    [
      { g0: "Salzburg", n: "10", total: "70.1" },
      { g0: "Tirol", n: "5", total: "31.5" },
    ],
  ],
};

/** Answers each statement from the hospital named in its parameters. */
function federated(seen: string[]): SqlClient {
  const calls: Record<string, number> = {};
  return {
    unsafe(_text, params) {
      const holders = params.filter((p) =>
        (DATA_HOLDERS as readonly unknown[]).includes(p)
      );
      assert(holders.length === 1, "Each statement names exactly one holder");
      const holder = holders[0] as string;
      seen.push(holder);
      const rows = hospitals[holder][calls[holder] = (calls[holder] ?? -1) + 1];
      assert(rows !== undefined, "Unexpected SQL call");
      return Promise.resolve(rows);
    },
  };
}

Deno.test("buildQueries scopes every statement to one data holder", () => {
  const central = buildQueries(plan);
  const scoped = buildQueries(plan, "Klinikum Süd");
  equal(central.groups[0]!.params, []);
  assert(!central.groups[0]!.text.includes("p.data_holder"));
  assert(scoped.groups[0]!.text.includes("AND p.data_holder = $1"));
  equal(scoped.groups[0]!.params, ["Klinikum Süd"]);
  scoped.metrics.forEach((q, i) => {
    assert(q!.text.includes("WHERE p.data_holder = $"));
    equal(q!.params.filter((p) => p === "Klinikum Süd").length, 1);
    // The rest of the statement is the central one.
    equal(
      q!.params.filter((p) => p !== "Klinikum Süd"),
      central.metrics[i]!.params,
    );
  });
});

Deno.test("federated run adds hospital aggregates, then applies the small-cell rule once", async () => {
  const seen: string[] = [];
  const answer = await runPlanFederated(plan, federated(seen));
  // Three hospitals, four statements each, one hospital at a time.
  equal(seen, DATA_HOLDERS.flatMap((h) => [h, h, h, h]));
  equal(answer, {
    // West only; 10/12 = 83.3 %, mean 7.01.
    Salzburg: { patients: 12, with_hba1c_pct: 83.3, mean_hba1c: 7 },
    // 6 + 5 = 11: released although each hospital alone is below 10.
    Tirol: { patients: 11, with_hba1c_pct: 90.9, mean_hba1c: 6.2 },
    // 4 + 3 = 7: still below 10 after combining.
    Wien: {
      patients: "<10",
      with_hba1c_pct: "suppressed",
      mean_hba1c: "suppressed",
    },
  });
});

Deno.test("federated answer equals the central answer over the summed data", async () => {
  // Hand-summed: Tirol 6 + 5, Wien 4 + 3, mean totals 30.25 + 31.5 and 13 + 19.5.
  const responses: Row[][] = [
    [{ value: "Salzburg" }, { value: "Tirol" }, { value: "Wien" }],
    [{ g0: "Salzburg", n: "12" }, { g0: "Tirol", n: "11" }, {
      g0: "Wien",
      n: "7",
    }],
    [{ g0: "Salzburg", n: "10" }, { g0: "Tirol", n: "10" }, {
      g0: "Wien",
      n: "5",
    }],
    [
      { g0: "Salzburg", n: "10", total: "70.1" },
      { g0: "Tirol", n: "10", total: "61.75" },
      { g0: "Wien", n: "5", total: "32.5" },
    ],
  ];
  const central = await runPlan(plan, {
    unsafe: () => Promise.resolve(responses.shift()!),
  });
  equal(await runPlanFederated(plan, federated([])), central);
});

Deno.test("grouping by data holder: each hospital reports only its own key", async () => {
  const byHolder: QueryPlan = {
    request_id: "holders",
    cohort_filters: [],
    count_unit: "encounter",
    dimensions: [{ by: "data_holder" }],
    metrics: [{ type: "count", label: "stays" }],
  };
  const answer = await runPlanFederated(byHolder, {
    unsafe(text, params) {
      const holder = String(
        params.find((p) => String(p).startsWith("Klinikum")),
      );
      return Promise.resolve(
        text.startsWith("SELECT DISTINCT")
          ? [{ value: holder }]
          : [{ g0: holder, n: holder === "Klinikum West" ? "9" : "40" }],
      );
    },
  });
  equal(answer, {
    "Klinikum Nord": { stays: 40 },
    "Klinikum Süd": { stays: 40 },
    "Klinikum West": { stays: "<10" },
  });
});
