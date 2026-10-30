/**
 * Secondary (complementary) suppression.
 *
 * The primary small-cell rule hides each small value on its own. A hidden
 * value can still be recomputed when other values in the same answer add up
 * to it, for example a "65+" band next to visible "65-74" and "75+" bands, or
 * "all patients" next to visible "with" and hidden "without" a medication.
 *
 * Every released value of one answer is modelled as a sum over atoms: the
 * finest groups of people (or encounters) that the plan can tell apart. A
 * hidden value can be derived exactly when its row lies in the linear span of
 * the visible rows. While that holds, the smallest visible value that
 * contributes to the derivation is suppressed as well.
 *
 * Unknown category domains (years, regions not used as a dimension) are
 * treated as closed: only the mentioned values exist. That can only add
 * relations, so it over-protects rather than miss a derivation.
 */
import type { CohortFilter, QueryPlan } from "./plan.ts";
import type { Statistic } from "./engine.ts";

/** The raw statistics of one answer cell, one per plan metric. */
export interface Leaf {
  keys: string[];
  stats: Statistic[];
}

type Literal =
  | CohortFilter
  | { type: "band"; min_age: number; max_age?: number };

interface Quantity {
  /** `${leaf}:${metric}`: the released value this quantity controls. */
  output: string;
  /** Released only while this other output is released (a denominator). */
  dependsOn?: string;
  space: string;
  literals: Literal[];
  value: bigint;
  /** A primarily hidden value that must stay underivable. */
  target: boolean;
  row: number[];
}

/** Larger models fall back to suppressing the whole cell family. */
const MAX_ATOMS = 1 << 16;
const TYPES = ["inpatient", "outpatient", "emergency"] as const;

const id = (leaf: number, metric: number) => `${leaf}:${metric}`;

function primarilyHidden(stat: Statistic): boolean {
  const n = BigInt(stat.n);
  if (n < 10n) return true;
  if (stat.type === "percentage") return BigInt(stat.denominator) < 10n;
  return stat.type === "mean_observation" && stat.total === null;
}

/**
 * Return the outputs (`${leafIndex}:${metricIndex}`) that must be shown as
 * "suppressed" in addition to the primary small-cell rule.
 */
export function secondarySuppression(
  plan: QueryPlan,
  leaves: Leaf[],
): Set<string> {
  const dimensions = plan.dimensions ?? [];
  const hidden = new Set<string>();
  leaves.forEach((leaf, l) =>
    leaf.stats.forEach((stat, m) => {
      if (primarilyHidden(stat)) hidden.add(id(l, m));
    })
  );
  const primary = new Set(hidden);

  // Cells that differ in a region or data-holder key never share people.
  const families = new Map<string, number[]>();
  leaves.forEach((leaf, l) => {
    const family = JSON.stringify(
      leaf.keys.filter((_, i) => dimensions[i].by !== "age_band"),
    );
    families.set(family, [...(families.get(family) ?? []), l]);
  });

  for (const members of families.values()) {
    const first = leaves[members[0]];
    const regionIndex = dimensions.findIndex((d) => d.by === "region");
    const region = regionIndex < 0 ? undefined : first.keys[regionIndex];
    const quantities: Quantity[] = [];
    for (const l of members) {
      const leaf = leaves[l];
      const cell: Literal[] = [...plan.cohort_filters];
      dimensions.forEach((d, i) => {
        if (d.by !== "age_band") return;
        const band = d.bands.find((b) => b.label === leaf.keys[i])!;
        cell.push({
          type: "band",
          min_age: band.min_age,
          max_age: band.max_age,
        });
      });
      plan.metrics.forEach((metric, m) => {
        const stat = leaf.stats[m];
        const output = id(l, m);
        const target = primary.has(output);
        const value = BigInt(stat.n);
        if (metric.type === "count") {
          quantities.push({
            output,
            space: "count",
            literals: [...cell, ...(metric.filters ?? [])],
            value,
            target,
            row: [],
          });
        } else if (metric.type === "percentage") {
          // A labelled numerator is its own count; an inline one is released
          // through the percentage, since percentage x denominator gives it.
          if (metric.numerator_filters === undefined) return;
          const d = plan.metrics.findIndex((x) =>
            x.label === metric.denominator_label
          );
          const denominator = plan.metrics[d];
          quantities.push({
            output,
            dependsOn: id(l, d),
            space: "count",
            literals: [
              ...cell,
              ...(denominator.type === "count"
                ? denominator.filters ?? []
                : []),
              ...metric.numerator_filters,
            ],
            value,
            // Behind a hidden denominator the percentage cannot be rebuilt.
            target: target && !primary.has(id(l, d)),
            row: [],
          });
        } else {
          // Conservatively, a visible mean reveals both its sum and its n.
          quantities.push({
            output,
            space: `mean:${metric.loinc}`,
            literals: cell,
            value,
            target,
            row: [],
          });
          if (plan.count_unit === "patient") {
            quantities.push({
              output,
              space: "count",
              literals: [...cell, {
                type: "has_observation",
                loinc: metric.loinc,
              }],
              value,
              target: false,
              row: [],
            });
          }
        }
      });
    }
    if (!quantities.some((q) => q.target)) continue;
    if (!buildRows(plan, quantities, region)) {
      // Too many atoms to analyse: protect by hiding the whole family.
      for (const q of quantities) hidden.add(q.output);
      continue;
    }
    protect(quantities, hidden);
  }

  // A percentage needs both its numerator and denominator to be released.
  const extra = new Set<string>();
  leaves.forEach((_, l) =>
    plan.metrics.forEach((metric, m) => {
      let suppressed = hidden.has(id(l, m));
      if (metric.type === "percentage") {
        const index = (label: string) =>
          plan.metrics.findIndex((x) => x.label === label);
        suppressed ||= hidden.has(id(l, index(metric.denominator_label)));
        if (metric.numerator_label !== undefined) {
          suppressed ||= hidden.has(id(l, index(metric.numerator_label)));
        }
      }
      if (suppressed && !primary.has(id(l, m))) extra.add(id(l, m));
    })
  );
  return extra;
}

/** Hide visible outputs until no target lies in the span of visible rows. */
function protect(quantities: Quantity[], hidden: Set<string>): void {
  const visible = (q: Quantity) =>
    !hidden.has(q.output) &&
    !(q.dependsOn !== undefined && hidden.has(q.dependsOn)) &&
    q.row.some((x) => x !== 0);
  for (let changed = true; changed;) {
    changed = false;
    for (const target of quantities) {
      if (!target.target || !target.row.some((x) => x !== 0)) continue;
      const known = quantities.filter((q) =>
        q.space === target.space && visible(q)
      );
      if (!inSpan(target.row, known.map((q) => q.row))) continue;
      const essential = known.filter((q) =>
        !inSpan(target.row, known.filter((k) => k !== q).map((k) => k.row))
      );
      const pool = essential.length ? essential : known;
      const cheapest = pool.reduce((a, b) => b.value < a.value ? b : a);
      hidden.add(cheapest.output);
      changed = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Atom model
// ---------------------------------------------------------------------------

interface Encounter {
  type?: string;
  year?: number;
  /** Longest mentioned primary_icd10 prefix the code starts with, or null. */
  primary?: string | null;
}
interface Atom {
  lo: number;
  hi: number; // inclusive; Infinity for the open-ended interval
  sex?: string;
  region?: string;
  encounter: Encounter;
  /** Patient-level categories present (conditions, medications, ...). */
  has: Set<string>;
}

/** Fill each quantity's row over deduplicated atoms; false if too large. */
function buildRows(
  plan: QueryPlan,
  quantities: Quantity[],
  region: string | undefined,
): boolean {
  const all: Literal[] = quantities.flatMap((q) => q.literals);
  const encounterUnit = plan.count_unit === "encounter";

  const cuts = new Set<number>([0]);
  const sexes = new Set<string>();
  const regions = new Set<string>();
  const conditions = new Set<string>();
  const medications = new Set<string>();
  const observations = new Set<string>();
  const years = new Set<number>();
  const primaries = new Set<string>();
  let typed = false;
  for (const l of all) {
    switch (l.type) {
      case "age":
      case "band":
        cuts.add(Math.ceil(l.min_age));
        if (l.max_age !== undefined) cuts.add(Math.floor(l.max_age) + 1);
        break;
      case "sex":
        sexes.add("female").add("male");
        break;
      case "region":
        regions.add(l.value);
        break;
      case "has_condition":
        l.icd10_prefixes.forEach((p) => conditions.add(p));
        break;
      case "has_medication":
        l.atc_prefixes.forEach((p) => medications.add(p));
        break;
      case "has_observation":
        observations.add(l.loinc);
        break;
      case "encounter_filter":
        if (l.encounter_type !== undefined) typed = true;
        if (l.start_year !== undefined) years.add(l.start_year);
        if (l.primary_icd10_prefix !== undefined) {
          primaries.add(l.primary_icd10_prefix);
        }
        break;
    }
  }

  const sorted = [...cuts].sort((a, b) => a - b);
  const ages = sorted.map((lo, i) => ({
    lo,
    hi: i + 1 < sorted.length ? sorted[i + 1] - 1 : Infinity,
  }));
  const encounters: Encounter[] = [];
  for (const type of typed ? TYPES : [undefined]) {
    for (const year of years.size ? [...years] : [undefined]) {
      const codes = primaries.size ? [...primaries, null] : [undefined];
      for (const primary of codes) {
        // Only inpatient stays carry a primary diagnosis.
        if (
          typed && type !== "inpatient" && primary !== null &&
          primary !== undefined
        ) {
          continue;
        }
        encounters.push({ type, year, primary });
      }
    }
  }
  // Patient-level categories: each is "has at least one such record".
  const categories = [
    ...[...conditions].map((p) => `c:${p}`),
    ...[...medications].map((p) => `m:${p}`),
    ...[...observations].map((p) => `o:${p}`),
    ...(encounterUnit ? [] : encounters.map((e) => `e:${JSON.stringify(e)}`)),
  ];
  const sexValues = sexes.size ? [...sexes] : [undefined];
  const regionValues = region !== undefined
    ? [region]
    : regions.size
    ? [...regions]
    : [undefined];
  const perPatient = encounterUnit ? encounters : [{}];
  const size = ages.length * sexValues.length * regionValues.length *
    perPatient.length * 2 ** categories.length;
  if (categories.length > 16 || size > MAX_ATOMS) return false;

  const columns = new Map<string, number>();
  const rows: number[][] = quantities.map(() => []);
  for (const age of ages) {
    for (const sex of sexValues) {
      for (const r of regionValues) {
        for (const encounter of perPatient) {
          for (let mask = 0; mask < 2 ** categories.length; mask++) {
            const has = new Set(categories.filter((_, i) => mask & (1 << i)));
            const atom: Atom = { ...age, sex, region: r, encounter, has };
            const bits = quantities.map((q) =>
              q.literals.every((l) => holds(l, atom, encounterUnit)) ? 1 : 0
            );
            // Atoms no quantity can tell apart are merged into one column.
            const key = bits.join("");
            let column = columns.get(key);
            if (column === undefined) {
              column = columns.size;
              columns.set(key, column);
              bits.forEach((b, i) => rows[i][column!] = b);
            }
          }
        }
      }
    }
  }
  quantities.forEach((q, i) => q.row = rows[i]);
  return true;
}

function matchesCategory(prefixes: string[], kind: string, atom: Atom) {
  // A category is the longest mentioned prefix a record's code starts with.
  for (const category of atom.has) {
    if (!category.startsWith(kind)) continue;
    const code = category.slice(kind.length);
    if (prefixes.some((p) => code.startsWith(p))) return true;
  }
  return false;
}

function encounterMatches(
  f: Extract<CohortFilter, { type: "encounter_filter" }>,
  e: Encounter,
): boolean {
  return (f.encounter_type === undefined || e.type === f.encounter_type) &&
    (f.start_year === undefined || e.year === f.start_year) &&
    (f.primary_icd10_prefix === undefined ||
      (typeof e.primary === "string" &&
        e.primary.startsWith(f.primary_icd10_prefix)));
}

function holds(l: Literal, atom: Atom, encounterUnit: boolean): boolean {
  switch (l.type) {
    case "age":
    case "band":
      return atom.lo >= Math.ceil(l.min_age) &&
        (l.max_age === undefined || atom.hi <= Math.floor(l.max_age));
    case "sex":
      return atom.sex === l.value;
    case "region":
      return atom.region === l.value;
    case "has_condition":
      return matchesCategory(l.icd10_prefixes, "c:", atom);
    case "has_medication":
      return matchesCategory(l.atc_prefixes, "m:", atom) !==
        (l.negate === true);
    case "has_observation":
      return atom.has.has(`o:${l.loinc}`);
    case "encounter_filter":
      if (encounterUnit) return encounterMatches(l, atom.encounter);
      for (const category of atom.has) {
        if (
          category.startsWith("e:") &&
          encounterMatches(l, JSON.parse(category.slice(2)))
        ) return true;
      }
      return false;
  }
}

// ---------------------------------------------------------------------------
// Exact linear algebra
// ---------------------------------------------------------------------------

function rank(rows: number[][]): number {
  return rankSafe(rows) ?? rankExact(rows);
}

/** Fraction-free elimination in doubles; null if any value leaves 2^53. */
function rankSafe(rows: number[][]): number | null {
  const m = rows.map((r) => [...r]);
  const width = Math.max(0, ...m.map((r) => r.length));
  let r = 0;
  for (let c = 0; c < width && r < m.length; c++) {
    const p = m.findIndex((row, i) => i >= r && row[c] !== 0);
    if (p < 0) continue;
    [m[r], m[p]] = [m[p], m[r]];
    const pivot = m[r][c];
    for (let i = r + 1; i < m.length; i++) {
      const factor = m[i][c];
      if (factor === 0) continue;
      let g = 0;
      for (let j = 0; j < width; j++) {
        const x = m[i][j] * pivot - m[r][j] * factor;
        if (
          !Number.isSafeInteger(m[i][j] * pivot) || !Number.isSafeInteger(x)
        ) {
          return null;
        }
        m[i][j] = x;
        g = gcdSafe(g, x);
      }
      if (g > 1) m[i] = m[i].map((x) => x / g);
    }
    r++;
  }
  return r;
}

function rankExact(rows: number[][]): number {
  const m = rows.map((r) => r.map((x) => BigInt(x)));
  const width = Math.max(0, ...m.map((r) => r.length));
  let r = 0;
  for (let c = 0; c < width && r < m.length; c++) {
    const p = m.findIndex((row, i) => i >= r && row[c] !== 0n);
    if (p < 0) continue;
    [m[r], m[p]] = [m[p], m[r]];
    const pivot = m[r][c];
    for (let i = r + 1; i < m.length; i++) {
      const factor = m[i][c];
      if (factor === 0n) continue;
      m[i] = m[i].map((x, j) => x * pivot - m[r][j] * factor);
      const g = m[i].reduce((a, b) => gcd(a, b), 0n);
      if (g > 1n) m[i] = m[i].map((x) => x / g);
    }
    r++;
  }
  return r;
}

function gcdSafe(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

/** True when `row` is a linear combination of `basis`. */
export function inSpan(row: number[], basis: number[][]): boolean {
  if (!row.some((x) => x)) return true;
  return rank([...basis, row]) === rank(basis);
}
