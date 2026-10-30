import { runPlan, type SqlClient, type Statistic } from "./engine.ts";
import type { CohortFilter, Metric, QueryPlan } from "./plan.ts";
import { R01, R03, R08, R09, R10 } from "./plan_examples.ts";
import {
  inSpan,
  type Leaf,
  secondarySuppression,
} from "./secondary_suppression.ts";

function assert(ok: boolean, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}
function equal(actual: unknown, expected: unknown): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}
const count = (n: number): Statistic => ({ type: "count", n });
const sorted = (s: Set<string>) => [...s].sort();

const anticoagulant: CohortFilter = {
  type: "has_medication",
  atc_prefixes: ["B01AA"],
  active_on_ref_date: true,
};
const nested: QueryPlan = {
  request_id: "nested",
  cohort_filters: [],
  count_unit: "patient",
  dimensions: [{
    by: "age_band",
    bands: [
      { label: "65-74", min_age: 65, max_age: 74 },
      { label: "75+", min_age: 75 },
      { label: "65+", min_age: 65 },
    ],
  }],
  metrics: [{ type: "count", label: "patients" }],
};
function plan(metrics: Metric[], extra: Partial<QueryPlan> = {}): QueryPlan {
  return {
    request_id: "t",
    cohort_filters: [],
    count_unit: "patient",
    metrics,
    ...extra,
  };
}

Deno.test("inSpan: exact rational span test", () => {
  assert(inSpan([1, 0], [[1, 1], [0, 1]]));
  assert(!inSpan([1, 0], [[1, 1]]));
  assert(inSpan([0, 0], []));
  assert(!inSpan([1, 1, 0], [[1, 0, 1], [0, 1, 1]]));
  assert(inSpan([1, -1, 0], [[1, 0, 1], [0, 1, 1]]));
});

Deno.test("nested age band: total minus visible band would reveal the hidden band", () => {
  const leaves: Leaf[] = [
    { keys: ["65-74"], stats: [count(5)] },
    { keys: ["75+"], stats: [count(40)] },
    { keys: ["65+"], stats: [count(45)] },
  ];
  // Both visible values are essential; the smaller one is hidden.
  equal(sorted(secondarySuppression(nested, leaves)), ["1:0"]);
});

Deno.test("nested age band: two hidden bands already protect each other", () => {
  const plan: QueryPlan = {
    ...nested,
    dimensions: [{
      by: "age_band",
      bands: [
        { label: "65-69", min_age: 65, max_age: 69 },
        { label: "70-74", min_age: 70, max_age: 74 },
        { label: "65-74", min_age: 65, max_age: 74 },
      ],
    }],
  };
  const leaves: Leaf[] = [
    { keys: ["65-69"], stats: [count(4)] },
    { keys: ["70-74"], stats: [count(7)] },
    { keys: ["65-74"], stats: [count(11)] },
  ];
  equal(sorted(secondarySuppression(plan, leaves)), []);
});

Deno.test("nested age band: families of different regions are separate", () => {
  const plan: QueryPlan = {
    ...nested,
    dimensions: [...nested.dimensions!, { by: "region" }],
  };
  const leaves: Leaf[] = [];
  for (
    const [band, wien, tirol] of [
      ["65-74", 5, 30],
      ["75+", 40, 20],
      ["65+", 45, 50],
    ] as const
  ) {
    leaves.push({ keys: [band, "Wien"], stats: [count(wien)] });
    leaves.push({ keys: [band, "Tirol"], stats: [count(tirol)] });
  }
  equal(sorted(secondarySuppression(plan, leaves)), ["2:0"]);
});

Deno.test("complementary medication counts: with = all - without", () => {
  const p = plan([
    { type: "count", label: "all" },
    { type: "count", label: "with", filters: [anticoagulant] },
    {
      type: "count",
      label: "without",
      filters: [{ ...anticoagulant, negate: true }],
    },
  ]);
  equal(
    sorted(
      secondarySuppression(p, [{
        keys: [],
        stats: [count(50), count(44), count(6)],
      }]),
    ),
    ["0:1"],
  );
});

Deno.test("percentage of the complement reveals the hidden count; dependent percentages follow", () => {
  const p = plan([
    { type: "count", label: "all" },
    {
      type: "count",
      label: "without",
      filters: [{ ...anticoagulant, negate: true }],
    },
    {
      type: "percentage",
      label: "with_pct",
      numerator_filters: [anticoagulant],
      denominator_label: "all",
    },
    {
      type: "percentage",
      label: "without_pct",
      numerator_label: "without",
      denominator_label: "all",
    },
  ]);
  const stats: Statistic[] = [
    count(30),
    count(4),
    { type: "percentage", n: 26, denominator: 30 },
    { type: "percentage", n: 4, denominator: 30 },
  ];
  // Hiding with_pct (26) is cheapest; all = 30 stays.
  equal(sorted(secondarySuppression(p, [{ keys: [], stats }])), ["0:2"]);
});

Deno.test("a percentage follows its secondarily hidden numerator", () => {
  const p = plan([
    { type: "count", label: "all" },
    { type: "count", label: "with", filters: [anticoagulant] },
    {
      type: "count",
      label: "without",
      filters: [{ ...anticoagulant, negate: true }],
    },
    {
      type: "percentage",
      label: "with_pct",
      numerator_label: "with",
      denominator_label: "all",
    },
  ]);
  const stats: Statistic[] = [
    count(30),
    count(25),
    count(5),
    { type: "percentage", n: 25, denominator: 30 },
  ];
  // "with" (25) is cheaper than "all" (30); with_pct would rebuild it.
  equal(sorted(secondarySuppression(p, [{ keys: [], stats }])), [
    "0:1",
    "0:3",
  ]);
});

Deno.test("means over nested bands: visible sums would reveal the hidden mean", () => {
  const p: QueryPlan = {
    ...nested,
    metrics: [{
      type: "mean_observation",
      label: "mean_bmi",
      loinc: "39156-5",
      use_latest: true,
    }],
  };
  const mean = (n: number, total: string): Statistic => ({
    type: "mean_observation",
    n,
    total,
  });
  const leaves: Leaf[] = [
    { keys: ["65-74"], stats: [mean(6, "160")] },
    { keys: ["75+"], stats: [mean(30, "800")] },
    { keys: ["65+"], stats: [mean(36, "960")] },
  ];
  equal(sorted(secondarySuppression(p, leaves)), ["1:0"]);
});

Deno.test("sex is a closed domain: all = female + male", () => {
  const p = plan([
    { type: "count", label: "all" },
    {
      type: "count",
      label: "female",
      filters: [{ type: "sex", value: "female" }],
    },
    { type: "count", label: "male", filters: [{ type: "sex", value: "male" }] },
  ]);
  equal(
    sorted(
      secondarySuppression(p, [{
        keys: [],
        stats: [count(20), count(12), count(8)],
      }]),
    ),
    ["0:1"],
  );
});

Deno.test("encounter counts: all stays = inpatient + outpatient + emergency", () => {
  const type = (t: "inpatient" | "outpatient" | "emergency"): Metric => ({
    type: "count",
    label: t,
    filters: [{ type: "encounter_filter", encounter_type: t }],
  });
  const p = plan(
    [
      { type: "count", label: "all" },
      type("inpatient"),
      type("outpatient"),
      type("emergency"),
    ],
    { count_unit: "encounter" },
  );
  equal(
    sorted(
      secondarySuppression(p, [{
        keys: [],
        stats: [count(100), count(3), count(70), count(27)],
      }]),
    ),
    ["0:3"],
  );
});

Deno.test("condition prefixes: union = A + B - both; nesting alone reveals nothing", () => {
  const has = (...p: string[]): CohortFilter => ({
    type: "has_condition",
    icd10_prefixes: p,
  });
  const union = plan([
    { type: "count", label: "e10", filters: [has("E10")] },
    { type: "count", label: "e11", filters: [has("E11")] },
    { type: "count", label: "both", filters: [has("E10"), has("E11")] },
    { type: "count", label: "either", filters: [has("E10", "E11")] },
  ]);
  equal(
    sorted(
      secondarySuppression(union, [{
        keys: [],
        stats: [count(30), count(40), count(5), count(65)],
      }]),
    ),
    ["0:0"],
  );
  const nesting = plan([
    { type: "count", label: "e1", filters: [has("E1")] },
    { type: "count", label: "e11", filters: [has("E11")] },
  ]);
  equal(
    sorted(
      secondarySuppression(nesting, [{
        keys: [],
        stats: [count(40), count(5)],
      }]),
    ),
    [],
  );
});

function mock(responses: Record<string, unknown>[][]): SqlClient {
  return {
    unsafe() {
      const rows = responses.shift();
      assert(rows !== undefined, "Unexpected SQL call");
      return Promise.resolve(rows);
    },
  };
}

Deno.test("runPlan shows secondary suppression as suppressed, not <10", async () => {
  const answer = await runPlan(
    nested,
    mock([[
      { g0: "65-74", n: "5" },
      { g0: "75+", n: "40" },
      { g0: "65+", n: "45" },
    ]]),
  );
  equal(answer, {
    "65-74": { patients: "<10" },
    "75+": { patients: "suppressed" },
    "65+": { patients: 45 },
  });
});

Deno.test("Track 3 plans have no derivable hidden cells, so nothing extra is hidden", () => {
  for (const p of [R01, R03, R08, R09, R10]) {
    const leaves: Leaf[] = [];
    const dimensions = p.dimensions ?? [];
    const universes = dimensions.map((d) =>
      d.by === "age_band" ? d.bands.map((b) => b.label) : ["A", "B"]
    );
    const walk = (keys: string[]) => {
      if (keys.length < dimensions.length) {
        for (const k of universes[keys.length]) walk([...keys, k]);
        return;
      }
      // Alternate small and large values so every metric is hidden somewhere.
      const n = leaves.length % 2 ? 5 : 50;
      leaves.push({
        keys,
        stats: p.metrics.map((m): Statistic =>
          m.type === "count"
            ? count(n)
            : m.type === "percentage"
            ? { type: "percentage", n, denominator: 60 }
            : { type: "mean_observation", n, total: String(n * 25) }
        ),
      });
    };
    walk([]);
    equal(sorted(secondarySuppression(p, leaves)), []);
  }
});
