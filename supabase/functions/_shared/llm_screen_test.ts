/**
 * Tests for llm_screen.ts — purpose screening second opinion
 *
 * No real LLM key required.  Network calls are replaced by a
 * controlled fake fetch (same pattern as memo_test.ts).
 *
 * Covered:
 *   1. disabled (no LLM_SCREEN): returns null, no fetch call
 *   2. suspect reply → { suspect: true, point: "b" }
 *   3. payload sent to the LLM contains purpose + question, no applicant/patient data
 *   4. fetch rejects → null
 *   5. cache: second call for same key makes no additional fetch call
 *   6. pipeline: suspect reply holds the request; decision/articles unchanged
 */

import { _resetScreenCache, screenPurpose } from "./llm_screen.ts";

function assert(ok: boolean, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Fake fetch / env helpers
// ---------------------------------------------------------------------------

async function withFakeFetch<T>(
  responseFn: (url: string, init: RequestInit) => Promise<Response>,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  (globalThis as unknown as Record<string, unknown>)["fetch"] = (
    url: string,
    init?: RequestInit,
  ) => responseFn(url, init ?? {});
  try {
    return await fn();
  } finally {
    (globalThis as unknown as Record<string, unknown>)["fetch"] = original;
  }
}

function fakeGeneration(text: string): Promise<Response> {
  return Promise.resolve(
    new Response(
      JSON.stringify({ choices: [{ message: { content: text } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

/** Run fn with OPENROUTER_API_KEY and LLM_SCREEN set, restoring both afterwards. */
async function withScreenEnabled<T>(fn: () => Promise<T>, screen = "on"): Promise<T> {
  const originalKey = Deno.env.get("OPENROUTER_API_KEY");
  const originalScreen = Deno.env.get("LLM_SCREEN");
  Deno.env.set("OPENROUTER_API_KEY", "test-key");
  if (screen) Deno.env.set("LLM_SCREEN", screen);
  else Deno.env.delete("LLM_SCREEN");
  _resetScreenCache();
  try {
    return await fn();
  } finally {
    if (originalKey !== undefined) Deno.env.set("OPENROUTER_API_KEY", originalKey);
    else Deno.env.delete("OPENROUTER_API_KEY");
    if (originalScreen !== undefined) Deno.env.set("LLM_SCREEN", originalScreen);
    else Deno.env.delete("LLM_SCREEN");
    _resetScreenCache();
  }
}

const SUSPECT_REPLY =
  '{"suspect": true, "point": "b", "why": "Risk scoring for premiums is an insurance decision."}';
const CLEAN_REPLY = '{"suspect": false, "point": null, "why": "Public health research."}';

const PURPOSE = "Build a risk score to set health insurance premiums";
const QUESTION = "Which diabetic patients are most likely to need inpatient care?";

// ---------------------------------------------------------------------------
// 1. disabled without LLM_SCREEN: no fetch call, returns null
// ---------------------------------------------------------------------------

Deno.test("screen: disabled without LLM_SCREEN — returns null, no fetch", async () => {
  let fetchCalled = false;
  const result = await withScreenEnabled(
    () =>
      withFakeFetch(
        () => {
          fetchCalled = true;
          return fakeGeneration(SUSPECT_REPLY);
        },
        () => screenPurpose(PURPOSE, QUESTION),
      ),
    "",
  );
  assert(result === null, "screenPurpose must return null when LLM_SCREEN is off");
  assert(!fetchCalled, "fetch must never be called when disabled");
});

// ---------------------------------------------------------------------------
// 2. suspect reply → { suspect: true, point: "b" }
// ---------------------------------------------------------------------------

Deno.test("screen: suspect reply is parsed", async () => {
  const result = await withScreenEnabled(() =>
    withFakeFetch(
      () => fakeGeneration("Sure, here is my answer:\n" + SUSPECT_REPLY),
      () => screenPurpose(PURPOSE, QUESTION),
    )
  );
  assert(result !== null, "result must not be null");
  assert(result!.suspect === true, "suspect must be true");
  assert(result!.point === "b", `point must be "b", got ${result!.point}`);
  assert(result!.why.length > 0, "why must be non-empty");
  assert(typeof result!.model === "string" && result!.model.length > 0, "model must be set");
});

// ---------------------------------------------------------------------------
// 3. payload contains purpose + question, no applicant/patient data
// ---------------------------------------------------------------------------

Deno.test("screen: payload to the LLM contains only request wording", async () => {
  const bodies: string[] = [];
  await withScreenEnabled(() =>
    withFakeFetch(
      (_url, init) => {
        bodies.push(String(init.body ?? ""));
        return fakeGeneration(CLEAN_REPLY);
      },
      () => screenPurpose(PURPOSE, QUESTION),
    )
  );
  assert(bodies.length === 1, "exactly one LLM call");
  assert(bodies[0].includes(PURPOSE), "purpose must be in the payload");
  assert(bodies[0].includes(QUESTION), "question must be in the payload");
  assert(!bodies[0].includes("applicant"), "applicant must not appear in the payload");
  assert(!bodies[0].includes("patient_id"), "patient_id must not appear in the payload");
});

// ---------------------------------------------------------------------------
// 4. fetch rejects → null
// ---------------------------------------------------------------------------

Deno.test("screen: fetch failure returns null", async () => {
  const result = await withScreenEnabled(() =>
    withFakeFetch(
      () => Promise.reject(new Error("network down")),
      () => screenPurpose(PURPOSE, QUESTION),
    )
  );
  assert(result === null, "fetch failure must return null");
});

// ---------------------------------------------------------------------------
// 5. cache: second call makes no additional fetch call
// ---------------------------------------------------------------------------

Deno.test("screen: cache hit makes no additional fetch call", async () => {
  let calls = 0;
  await withScreenEnabled(async () => {
    const fake = () => {
      calls++;
      return fakeGeneration(SUSPECT_REPLY);
    };
    const r1 = await withFakeFetch(fake, () => screenPurpose(PURPOSE, QUESTION));
    assert(r1?.suspect === true, "first call must succeed");
    assert(calls === 1, "first call must use fetch");
    const r2 = await withFakeFetch(fake, () => screenPurpose(PURPOSE, QUESTION));
    assert(r2?.suspect === true, "second call must also succeed");
    assert(calls === 1, `cache hit must not call fetch (calls: ${calls})`);
  });
});

// ---------------------------------------------------------------------------
// 6. pipeline: suspect reply holds the request; decision/articles unchanged
// ---------------------------------------------------------------------------

Deno.test("screen: suspect purpose holds the request in the pipeline", async () => {
  const { answerRequest } = await import("./pipeline.ts");
  // Same shape as STAT_REQUEST in pipeline_test.ts: APPROVE_STATISTICAL, parses cleanly.
  const req = {
    id: "T-SCREEN",
    requested_as: "health data request",
    purpose: "Public health research on diabetes prevalence.",
    question: "How many adults have type 2 diabetes?",
    definitions: [
      "Adult = aged 18 or older on 31 December 2025.",
      "Type 2 diabetes = any condition with an ICD-10 code starting with E11.",
      "Report per region: adults with type 2 diabetes.",
    ],
  };

  const fakeSql = {
    unsafe: (text: string, _params: unknown[]) =>
      Promise.resolve(text.includes("eligible_patients") ? [{ n: 100 }] : []),
    begin: <T>(fn: (tx: unknown) => Promise<T>) => fn(fakeSql),
  };
  const sql = fakeSql as Parameters<typeof answerRequest>[1];

  // Baseline without screening (LLM_SCREEN off)
  const plain = await withScreenEnabled(
    () => withFakeFetch(() => fakeGeneration(CLEAN_REPLY), () => answerRequest(req, sql)),
    "",
  );
  assert(plain.status === "decided", "baseline must be decided");
  assert(plain.ai_screen === undefined, "baseline must have no ai_screen");

  const held = await withScreenEnabled(() =>
    withFakeFetch(() => fakeGeneration(SUSPECT_REPLY), () => answerRequest(req, sql))
  );
  assert(held.needs_review === true, "suspect screen must set needs_review");
  assert(held.status === "staff_review", `status must be staff_review, got ${held.status}`);
  assert(held.ai_screen?.suspect === true, "ai_screen.suspect must be true");
  assert(held.decision === plain.decision, "decision must be unchanged");
  assert(
    JSON.stringify(held.articles) === JSON.stringify(plain.articles),
    "articles must be unchanged",
  );
  assert(held.answer === null, "a flagged request withholds its numbers until a person decides");
  assert(plain.answer !== null, "the unflagged baseline keeps its numbers");

  // A staff review overrides the second opinion: no screening call, numbers returned.
  let reviewFetches = 0;
  const approved = await withScreenEnabled(() =>
    withFakeFetch(
      () => {
        reviewFetches++;
        return fakeGeneration(SUSPECT_REPLY);
      },
      () => answerRequest(req, sql, { reason: "Purpose is permitted under Article 53." }),
    )
  );
  assert(reviewFetches === 0, "screening must not run on a reviewed request");
  assert(approved.status === "decided", `reviewed request must be decided, got ${approved.status}`);
  assert(approved.ai_screen === undefined, "no ai_screen on a reviewed request");
  assert(JSON.stringify(approved.answer) === JSON.stringify(plain.answer), "reviewed request returns the numbers");
});
