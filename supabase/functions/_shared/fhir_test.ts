import {
  fromFhir,
  organizationId,
  type Resource,
  roundTripDifference,
  type SourceTables,
  SYSTEMS,
  toFhir,
} from "./fhir.ts";

function assert(ok: boolean, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}
function equal(actual: unknown, expected: unknown): void {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );
}
function throws(fn: () => unknown, pattern: RegExp): void {
  try {
    fn();
  } catch (error) {
    assert(pattern.test(String(error)), String(error));
    return;
  }
  throw new Error("Expected an error");
}

const tables: SourceTables = {
  patients: [{
    patient_id: "p-1eb050e7",
    sex: "female",
    birth_date: "1950-02-03",
    region: "Kärnten",
    data_holder: "Klinikum Süd",
  }],
  conditions: [
    {
      patient_id: "p-1eb050e7",
      icd10: "E11.9",
      description: "Type 2 diabetes mellitus without complications",
      onset_date: "2019-01-10",
    },
    {
      patient_id: "p-1eb050e7",
      icd10: "I10",
      description: "Essential (primary) hypertension",
      onset_date: "2019-01-10",
    },
  ],
  medications: [{
    patient_id: "p-1eb050e7",
    atc: "A10BA02",
    name: "Metformin",
    start_date: "2024-06-16",
    end_date: null,
  }],
  observations: [{
    patient_id: "p-1eb050e7",
    loinc: "39156-5",
    name: "Body mass index (BMI)",
    value: "26.0",
    unit: "kg/m2",
    date: "2024-04-05",
  }],
  encounters: [
    {
      encounter_id: "e000023",
      patient_id: "p-1eb050e7",
      data_holder: "Klinikum Süd",
      type: "inpatient",
      start_date: "2023-03-03",
      end_date: "2023-03-09",
      primary_icd10: "J44.9",
    },
    {
      encounter_id: "e000024",
      patient_id: "p-1eb050e7",
      data_holder: "Klinikum Nord",
      type: "emergency",
      start_date: "2024-01-01",
      end_date: "2024-01-01",
      primary_icd10: null,
    },
  ],
};
const byType = (resources: Resource[], type: string) =>
  resources.filter((r) => r.resourceType === type);

Deno.test("toFhir maps every table to R4 resources with source code systems", () => {
  const resources = toFhir(tables);
  equal(byType(resources, "Organization"), [
    { resourceType: "Organization", id: "klinikum-sued", name: "Klinikum Süd" },
    {
      resourceType: "Organization",
      id: "klinikum-nord",
      name: "Klinikum Nord",
    },
  ]);
  equal(byType(resources, "Patient"), [{
    resourceType: "Patient",
    id: "p-1eb050e7",
    gender: "female",
    birthDate: "1950-02-03",
    address: [{ state: "Kärnten" }],
    managingOrganization: { reference: "Organization/klinikum-sued" },
  }]);
  const [condition] = byType(resources, "Condition");
  equal(condition.id, "cond-p-1eb050e7-1");
  equal(condition.subject, { reference: "Patient/p-1eb050e7" });
  equal(condition.code.coding, [{
    system: SYSTEMS.icd10,
    code: "E11.9",
    display: "Type 2 diabetes mellitus without complications",
  }]);
  equal(condition.onsetDateTime, "2019-01-10");
  const [medication] = byType(resources, "MedicationStatement");
  equal(medication.status, "unknown");
  equal(medication.medicationCodeableConcept.coding[0].system, SYSTEMS.atc);
  // An open-ended prescription keeps an open period.
  equal(medication.effectivePeriod, { start: "2024-06-16" });
  const [observation] = byType(resources, "Observation");
  equal(observation.status, "final");
  equal(observation.code.coding[0].system, SYSTEMS.loinc);
  equal(observation.valueQuantity, {
    value: 26,
    unit: "kg/m2",
    system: SYSTEMS.ucum,
    code: "kg/m2",
  });
  const [stay, visit] = byType(resources, "Encounter");
  equal(stay.status, "finished");
  equal(stay.class, {
    system: SYSTEMS.actCode,
    code: "IMP",
    display: "inpatient encounter",
  });
  equal(stay.period, { start: "2023-03-03", end: "2023-03-09" });
  equal(stay.serviceProvider, { reference: "Organization/klinikum-sued" });
  // The main diagnosis stays on the encounter, not among the conditions.
  equal(stay.contained[0].code.coding[0].code, "J44.9");
  equal(stay.diagnosis, [{ condition: { reference: "#primary" }, rank: 1 }]);
  equal(visit.class.code, "EMER");
  assert(!("contained" in visit) && !("diagnosis" in visit));
  equal(byType(resources, "Condition").length, 2);
});

Deno.test("required R4 elements are present on every resource", () => {
  for (const r of toFhir(tables)) {
    assert(/^[A-Za-z0-9.-]{1,64}$/.test(r.id), r.id);
    const required: Record<string, string[]> = {
      Patient: [],
      Organization: [],
      Condition: ["subject"],
      MedicationStatement: ["status", "medicationCodeableConcept", "subject"],
      Observation: ["status", "code"],
      Encounter: ["status", "class"],
    };
    for (const field of required[r.resourceType]) {
      assert(r[field] !== undefined, `${r.resourceType}.${field}`);
    }
    // FHIR JSON has no nulls or empty objects.
    assert(!/null|\{\}/.test(JSON.stringify(r)), JSON.stringify(r));
  }
});

Deno.test("fromFhir inverts toFhir on every column", () => {
  equal(roundTripDifference(tables), null);
  const back = fromFhir(toFhir(tables));
  equal(back.encounters[1].primary_icd10, null);
  equal(back.medications[0].end_date, null);
  // Only the decimal spelling changes; the value is the same.
  equal(back.observations[0].value, "26");
});

Deno.test("an SPE without demographics maps to bare patients", () => {
  const spe: SourceTables = {
    patients: [{ patient_id: "p-1" }],
    conditions: tables.conditions!.map((c) => ({ ...c, patient_id: "p-1" })),
  };
  const resources = toFhir(spe);
  equal(byType(resources, "Patient"), [{ resourceType: "Patient", id: "p-1" }]);
  equal(byType(resources, "Organization"), []);
  equal(roundTripDifference(spe), null);
});

Deno.test("round trip reports a dropped or altered value", () => {
  const resources = toFhir(tables);
  const observation = resources.find((r) => r.resourceType === "Observation")!;
  observation.valueQuantity.value = 27;
  assert(/observations/.test(roundTripDifference(tables, resources) ?? ""));
  assert(
    /conditions: 2 rows, 1/.test(
      roundTripDifference(
        tables,
        toFhir(tables).filter((r) => r.id !== "cond-p-1eb050e7-2"),
      ) ?? "",
    ),
  );
});

Deno.test("values that do not fit FHIR are refused, not rewritten", () => {
  throws(
    () => toFhir({ patients: [{ patient_id: "p 1" }] }),
    /not a valid FHIR id/,
  );
  throws(
    () => toFhir({ patients: [{ patient_id: "p-1", sex: "f" }] }),
    /Unknown sex/,
  );
  throws(
    () =>
      toFhir({
        encounters: [{ ...tables.encounters![0], type: "home" }],
      }),
    /Unknown encounter type/,
  );
  throws(
    () =>
      toFhir({
        medications: [{ ...tables.medications![0], atc: null, name: null }],
      }),
    /neither code nor name/,
  );
  equal(organizationId("Klinikum Süd"), "klinikum-sued");
});
