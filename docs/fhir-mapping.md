# FHIR R4 mapping of the data model

Issue #38. The five Track 3 tables map to HL7 FHIR R4 resources. The mapping
lives in `supabase/functions/_shared/fhir.ts`; `scripts/export-fhir.ts` applies
it to a secure processing environment.

We chose FHIR over OMOP CDM because every column has a FHIR element that
keeps the source code system (ICD-10, ATC, LOINC, UCUM). OMOP needs
standard-concept IDs from the OHDSI vocabularies, which this project does not
ship, so most `*_concept_id` columns would be 0. FHIR is also the basis of
the EHDS European EHR exchange format.

## Code systems

| Source codes | FHIR `system` |
|---|---|
| ICD-10 (`icd10`, `primary_icd10`) | `http://hl7.org/fhir/sid/icd-10` |
| ATC (`atc`) | `http://www.whocc.no/atc` |
| LOINC (`loinc`) | `http://loinc.org` |
| Units (`unit`, already UCUM) | `http://unitsofmeasure.org` |
| Encounter class | `http://terminology.hl7.org/CodeSystem/v3-ActCode` |

## `patients` → `Patient` (+ `Organization`)

| Column | FHIR element | Notes |
|---|---|---|
| `patient_id` | `Patient.id` | Used as is; the export refuses ids FHIR does not allow. Every other resource references it as `Patient/<patient_id>`. |
| `sex` | `Patient.gender` | `male` / `female` are FHIR codes already. |
| `birth_date` | `Patient.birthDate` | |
| `region` | `Patient.address[0].state` | Austrian federal state. |
| `data_holder` | `Patient.managingOrganization` → `Organization` | One `Organization` per hospital: `id` is the slug (`klinikum-sued`), `name` the original text (`Klinikum Süd`). |
| `opted_out` | not exported | A secure environment holds only patients from `eligible_patients` (`opted_out = false`), so the value is always false. |

## `conditions` → `Condition`

| Column | FHIR element | Notes |
|---|---|---|
| `patient_id` | `Condition.subject` | |
| `icd10` | `Condition.code.coding[0].code` | system ICD-10 |
| `description` | `Condition.code.coding[0].display` and `Condition.code.text` | |
| `onset_date` | `Condition.onsetDateTime` | |
| (no id) | `Condition.id` = `cond-<patient_id>-<n>` | `n` numbers the patient's rows in a fixed sort order. |

## `medications` → `MedicationStatement`

| Column | FHIR element | Notes |
|---|---|---|
| `patient_id` | `MedicationStatement.subject` | |
| `atc` | `medicationCodeableConcept.coding[0].code` | system ATC |
| `name` | `medicationCodeableConcept.coding[0].display` and `.text` | |
| `start_date` | `effectivePeriod.start` | |
| `end_date` | `effectivePeriod.end` | Omitted when null: the prescription is open-ended. Nothing is imputed, so "active on 2025-12-31" means the same as in the engine. |
| (none) | `status` = `unknown` | Required by FHIR; the source has no status and the period carries the dates. |
| (no id) | `MedicationStatement.id` = `med-<patient_id>-<n>` | |

## `observations` → `Observation`

| Column | FHIR element | Notes |
|---|---|---|
| `patient_id` | `Observation.subject` | |
| `loinc` | `Observation.code.coding[0].code` | system LOINC |
| `name` | `Observation.code.coding[0].display` and `.text` | |
| `value` | `Observation.valueQuantity.value` | JSON number: `26.0` is written as `26`, the same value. |
| `unit` | `valueQuantity.unit` and `valueQuantity.code` | system UCUM; the source units (`%`, `kg/m2`, `mm[Hg]`, `mL/min/{1.73_m2}`) are UCUM already. |
| `date` | `Observation.effectiveDateTime` | |
| (none) | `status` = `final` | Required by FHIR; these are stored results. |
| (no id) | `Observation.id` = `obs-<patient_id>-<n>` | |

## `encounters` → `Encounter`

| Column | FHIR element | Notes |
|---|---|---|
| `encounter_id` | `Encounter.id` | |
| `patient_id` | `Encounter.subject` | |
| `data_holder` | `Encounter.serviceProvider` → `Organization` | Same organizations as for patients. |
| `type` | `Encounter.class` | `inpatient` → `IMP`, `outpatient` → `AMB`, `emergency` → `EMER` (v3 ActCode). |
| `start_date` | `Encounter.period.start` | |
| `end_date` | `Encounter.period.end` | |
| `primary_icd10` | `Encounter.diagnosis[0]` (`rank` 1) → contained `Condition` `#primary` | Kept on the encounter rather than as a top-level `Condition`, so the patient's `conditions` table is not mixed with visit diagnoses. Omitted when null. |
| (none) | `status` = `finished` when `end_date` is set, else `unknown` | Required by FHIR. |

## Export into the secure environment

```sh
deno run -A scripts/create-spe.ts supabase/fixtures/plans/R05.json R05
deno run -A scripts/export-fhir.ts R05
```

The export reads only the tables of `spe_<request id>`. It writes the resources
to `spe_<request id>.fhir_resources (resource_type, id, resource jsonb)`, with
row-level security on and `SELECT` granted to `service_role` only, like the
other SPE tables. It runs in one transaction under the same advisory lock as
`createSpe`.

**No answer changes.** The export never writes to the `public` tables the
engine reads, and the API code does not use it. With the R05 and R06
environments exported, a fingerprint of all five public tables was unchanged
and `scripts/eval.ts --local` still gave 10/10 decisions, 6/6 numbers and 0
leaks.

**Lossless.** Before it writes anything, the export maps the resources back
to rows (`fromFhir`) and aborts unless every source row comes back with
identical values. On the full eligible data (19,161 patients, 111,391
resources) the round trip has no differences.

Limits:

- No translation to other terminologies (for example ICD-10 to SNOMED CT).
- The resources follow the R4 base specification. They were not checked with
  the official HL7 validator or against a profile such as the European EHR
  exchange format.
- The output is stored per resource in Postgres, not as a FHIR server or as
  Bulk Data NDJSON files, since nothing may leave the secure environment.
