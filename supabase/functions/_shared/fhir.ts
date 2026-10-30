/**
 * HL7 FHIR R4 mapping of the five Track 3 tables (issue #38).
 *
 * docs/fhir-mapping.md documents every table and column. fromFhir() inverts
 * toFhir(), so an export can prove that it neither drops nor alters a value.
 * Codes keep their source systems (ICD-10, ATC, LOINC, UCUM); no terminology
 * translation is attempted.
 */

/** One source row as text, the way the export reads it (`column::text`). */
export type SourceRow = Record<string, string | null>;
export const TABLES = [
  "patients",
  "conditions",
  "medications",
  "observations",
  "encounters",
] as const;
export type Table = typeof TABLES[number];
export type SourceTables = Partial<Record<Table, SourceRow[]>>;
// deno-lint-ignore no-explicit-any
export type Resource = { resourceType: string; id: string; [key: string]: any };

/** Columns the mapping understands; `opted_out` never reaches an SPE. */
export const COLUMNS: Record<Table, readonly string[]> = {
  patients: ["patient_id", "sex", "birth_date", "region", "data_holder"],
  conditions: ["patient_id", "icd10", "description", "onset_date"],
  medications: ["patient_id", "atc", "name", "start_date", "end_date"],
  observations: ["patient_id", "loinc", "name", "value", "unit", "date"],
  encounters: [
    "encounter_id",
    "patient_id",
    "data_holder",
    "type",
    "start_date",
    "end_date",
    "primary_icd10",
  ],
};

export const SYSTEMS = {
  icd10: "http://hl7.org/fhir/sid/icd-10",
  atc: "http://www.whocc.no/atc",
  loinc: "http://loinc.org",
  ucum: "http://unitsofmeasure.org",
  actCode: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
} as const;

const ENCOUNTER_CLASS: Record<string, { code: string; display: string }> = {
  inpatient: { code: "IMP", display: "inpatient encounter" },
  outpatient: { code: "AMB", display: "ambulatory" },
  emergency: { code: "EMER", display: "emergency" },
};
const GENDERS = new Set(["male", "female", "other", "unknown"]);

/** FHIR ids allow [A-Za-z0-9-.]{1,64}; refuse rather than rewrite a source id. */
function fhirId(value: string | null | undefined, what: string): string {
  if (!value || !/^[A-Za-z0-9.-]{1,64}$/.test(value)) {
    throw new Error(`${what} is not a valid FHIR id: ${JSON.stringify(value)}`);
  }
  return value;
}

/** "Klinikum Süd" → "klinikum-sued". */
export function organizationId(name: string): string {
  const id = name.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return fhirId(id, `Organization for ${name}`);
}

/** A coded concept; text alone when the code is missing, nothing when both are. */
function concept(system: string, code: string | null, display?: string | null) {
  if (code == null) return display == null ? undefined : { text: display };
  return {
    coding: [{ system, code, ...(display == null ? {} : { display }) }],
    ...(display == null ? {} : { text: display }),
  };
}
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`${what} has neither code nor name`);
  return value;
}
const period = (start: string | null, end: string | null) =>
  start == null && end == null ? undefined : compact({ start, end });

/** Put present values only; FHIR has no nulls. */
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null),
  ) as T;
}

export function toFhir(tables: SourceTables): Resource[] {
  const organizations = new Map<string, Resource>();
  const organization = (name: string | null | undefined) => {
    if (name == null) return undefined;
    const id = organizationId(name);
    const existing = organizations.get(id);
    if (existing && existing.name !== name) {
      throw new Error(`Data holders ${existing.name} and ${name} share an id`);
    }
    organizations.set(id, { resourceType: "Organization", id, name });
    return { reference: `Organization/${id}` };
  };
  const subject = (row: SourceRow) => ({
    reference: `Patient/${fhirId(row.patient_id, "patient_id")}`,
  });
  /** Rows without ids get the patient's id and a per-patient ordinal. */
  const ordinal = (prefix: string) => {
    const seen = new Map<string, number>();
    return (row: SourceRow) => {
      const k = (seen.get(row.patient_id!) ?? 0) + 1;
      seen.set(row.patient_id!, k);
      return fhirId(`${prefix}-${row.patient_id}-${k}`, `${prefix} id`);
    };
  };

  const resources: Resource[] = [];
  for (const row of tables.patients ?? []) {
    if (row.sex != null && !GENDERS.has(row.sex)) {
      throw new Error(`Unknown sex: ${row.sex}`);
    }
    resources.push(compact({
      resourceType: "Patient",
      id: fhirId(row.patient_id, "patient_id"),
      gender: row.sex,
      birthDate: row.birth_date,
      address: row.region == null ? undefined : [{ state: row.region }],
      managingOrganization: organization(row.data_holder),
    }));
  }
  const conditionId = ordinal("cond");
  for (const row of tables.conditions ?? []) {
    resources.push(compact({
      resourceType: "Condition",
      id: conditionId(row),
      subject: subject(row),
      code: concept(SYSTEMS.icd10, row.icd10, row.description),
      onsetDateTime: row.onset_date,
    }));
  }
  const medicationId = ordinal("med");
  for (const row of tables.medications ?? []) {
    resources.push(compact({
      resourceType: "MedicationStatement",
      id: medicationId(row),
      // The source has no status; the period carries the dates.
      status: "unknown",
      medicationCodeableConcept: required(
        concept(SYSTEMS.atc, row.atc, row.name),
        "medication",
      ),
      subject: subject(row),
      effectivePeriod: period(row.start_date, row.end_date),
    }));
  }
  const observationId = ordinal("obs");
  for (const row of tables.observations ?? []) {
    resources.push(compact({
      resourceType: "Observation",
      id: observationId(row),
      // Stored results; the source has no status.
      status: "final",
      code: required(
        concept(SYSTEMS.loinc, row.loinc, row.name),
        "observation",
      ),
      subject: subject(row),
      effectiveDateTime: row.date,
      valueQuantity: row.value == null && row.unit == null
        ? undefined
        : compact({
          value: row.value == null ? undefined : Number(row.value),
          unit: row.unit,
          system: row.unit == null ? undefined : SYSTEMS.ucum,
          code: row.unit,
        }),
    }));
  }
  for (const row of tables.encounters ?? []) {
    const type = ENCOUNTER_CLASS[row.type ?? ""];
    if (!type) throw new Error(`Unknown encounter type: ${row.type}`);
    resources.push(compact({
      resourceType: "Encounter",
      id: fhirId(row.encounter_id, "encounter_id"),
      // Main diagnosis, kept apart from the patient's conditions table.
      contained: row.primary_icd10 == null ? undefined : [{
        resourceType: "Condition",
        id: "primary",
        subject: subject(row),
        code: concept(SYSTEMS.icd10, row.primary_icd10),
      }],
      status: row.end_date == null ? "unknown" : "finished",
      class: { system: SYSTEMS.actCode, ...type },
      subject: subject(row),
      period: period(row.start_date, row.end_date),
      diagnosis: row.primary_icd10 == null
        ? undefined
        : [{ condition: { reference: "#primary" }, rank: 1 }],
      serviceProvider: organization(row.data_holder),
    }));
  }
  return [...organizations.values(), ...resources];
}

/** The inverse of toFhir(): rebuild the source rows from the resources. */
export function fromFhir(resources: Resource[]): Required<SourceTables> {
  const names = new Map(
    resources.filter((r) => r.resourceType === "Organization")
      .map((r) => [`Organization/${r.id}`, r.name as string]),
  );
  const holder = (ref?: { reference: string }) =>
    ref ? names.get(ref.reference) ?? null : null;
  const patient = (r: Resource) =>
    (r.subject.reference as string).slice("Patient/".length);
  const code = (c?: { coding?: { code: string }[] }) =>
    c?.coding?.[0]?.code ?? null;
  const text = (c?: { coding?: { display?: string }[]; text?: string }) =>
    c?.coding?.[0]?.display ?? c?.text ?? null;
  const tables: Required<SourceTables> = {
    patients: [],
    conditions: [],
    medications: [],
    observations: [],
    encounters: [],
  };
  const types = Object.fromEntries(
    Object.entries(ENCOUNTER_CLASS).map(([type, c]) => [c.code, type]),
  );
  for (const r of resources) {
    switch (r.resourceType) {
      case "Patient":
        tables.patients.push({
          patient_id: r.id,
          sex: r.gender ?? null,
          birth_date: r.birthDate ?? null,
          region: r.address?.[0]?.state ?? null,
          data_holder: holder(r.managingOrganization),
        });
        break;
      case "Condition":
        tables.conditions.push({
          patient_id: patient(r),
          icd10: code(r.code),
          description: text(r.code),
          onset_date: r.onsetDateTime ?? null,
        });
        break;
      case "MedicationStatement":
        tables.medications.push({
          patient_id: patient(r),
          atc: code(r.medicationCodeableConcept),
          name: text(r.medicationCodeableConcept),
          start_date: r.effectivePeriod?.start ?? null,
          end_date: r.effectivePeriod?.end ?? null,
        });
        break;
      case "Observation":
        tables.observations.push({
          patient_id: patient(r),
          loinc: code(r.code),
          name: text(r.code),
          value: r.valueQuantity?.value === undefined
            ? null
            : String(r.valueQuantity.value),
          unit: r.valueQuantity?.unit ?? null,
          date: r.effectiveDateTime ?? null,
        });
        break;
      case "Encounter":
        tables.encounters.push({
          encounter_id: r.id,
          patient_id: patient(r),
          data_holder: holder(r.serviceProvider),
          type: types[r.class.code],
          start_date: r.period?.start ?? null,
          end_date: r.period?.end ?? null,
          primary_icd10: code(r.contained?.[0]?.code),
        });
        break;
    }
  }
  return tables;
}

/**
 * Compare source rows with their round trip on the columns the source has.
 * Values compare as numbers ("26.0" and "26" are the same observation).
 * Returns the first difference, or null when the mapping is lossless.
 */
export function roundTripDifference(
  source: SourceTables,
  resources: Resource[] = toFhir(source),
): string | null {
  const back = fromFhir(resources);
  for (const table of TABLES) {
    const rows = source[table] ?? [];
    if (rows.length !== back[table].length) {
      return `${table}: ${rows.length} rows, ${
        back[table].length
      } after mapping`;
    }
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const key = (row: SourceRow) =>
      JSON.stringify(
        columns.map((c) =>
          c === "value" && row[c] != null ? Number(row[c]) : row[c] ?? null
        ),
      );
    const a = rows.map(key).sort();
    const b = back[table].map(key).sort();
    const i = a.findIndex((k, j) => k !== b[j]);
    if (i !== -1) return `${table}: ${a[i]} became ${b[i]}`;
  }
  return null;
}
