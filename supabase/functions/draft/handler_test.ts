/**
 * Tests for the free-text intake function (POST /draft).
 *
 * All tests run without a real LLM key; fetch is replaced by a fake.
 */
import { createHandler, parseDraft } from "./handler.ts";

function assert(ok: boolean, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}

const VALID = {
  purpose: "Public-health monitoring of diabetes care.",
  question: "How many patients aged 65+ had a diabetes diagnosis per region in 2025?",
  requested_as: "health data request",
  requested_format: "anonymised statistics",
  definitions: [
    "Diabetes = any condition with an ICD-10 code starting with E11",
    "Report per region: patients with Diabetes",
  ],
};

function llmReply(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function post(text: unknown) {
  return new Request("http://localhost/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

/** Run fn with OPENROUTER_API_KEY set and fetch replaced; returns the fetch bodies. */
async function withLlm(
  respond: () => Promise<Response>,
  fn: () => Promise<void>,
  key: string | null = "test-key",
): Promise<string[]> {
  const originalKey = Deno.env.get("OPENROUTER_API_KEY");
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  if (key === null) Deno.env.delete("OPENROUTER_API_KEY");
  else Deno.env.set("OPENROUTER_API_KEY", key);
  (globalThis as unknown as Record<string, unknown>)["fetch"] = (
    _url: string,
    init?: RequestInit,
  ) => {
    bodies.push(String(init?.body ?? ""));
    return respond();
  };
  try {
    await fn();
  } finally {
    (globalThis as unknown as Record<string, unknown>)["fetch"] = originalFetch;
    if (originalKey !== undefined) Deno.env.set("OPENROUTER_API_KEY", originalKey);
    else Deno.env.delete("OPENROUTER_API_KEY");
  }
  return bodies;
}

Deno.test("draft: disabled without key → 503 and no fetch", async () => {
  const bodies = await withLlm(
    () => Promise.resolve(llmReply(JSON.stringify(VALID))),
    async () => {
      const res = await createHandler()(post("some text"));
      assert(res.status === 503, `status ${res.status}`);
      const body = await res.json();
      assert(body.error === "AI drafting is not enabled");
    },
    null,
  );
  assert(bodies.length === 0, "fetch must not be called when disabled");
});

Deno.test("draft: valid JSON reply → 200 with exactly the five keys", async () => {
  await withLlm(
    () => Promise.resolve(llmReply("Here you go:\n" + JSON.stringify(VALID))),
    async () => {
      const res = await createHandler()(post("We want diabetes statistics."));
      assert(res.status === 200, `status ${res.status}`);
      const body = await res.json();
      assert(
        JSON.stringify(Object.keys(body).sort()) === JSON.stringify(
          ["definitions", "purpose", "question", "requested_as", "requested_format"],
        ),
        "unexpected keys: " + Object.keys(body).join(","),
      );
      assert(body.requested_as === VALID.requested_as);
      assert(body.definitions.length === 2);
    },
  );
});

Deno.test("draft: reply missing a key or with a bad enum → 422", async () => {
  const { question: _q, ...missingKey } = VALID;
  const badEnum = { ...VALID, requested_format: "raw records" };
  for (const reply of [missingKey, badEnum]) {
    await withLlm(
      () => Promise.resolve(llmReply(JSON.stringify(reply))),
      async () => {
        const res = await createHandler()(post("text"));
        assert(res.status === 422, `status ${res.status}`);
        const body = await res.json();
        assert(body.error === "Could not draft a request from this text");
      },
    );
  }
  assert(parseDraft("no json here") === null);
  assert(parseDraft(JSON.stringify({ ...VALID, definitions: [] })) === null);
  assert(parseDraft(JSON.stringify({ ...VALID, definitions: [""] })) === null);
});

Deno.test("draft: fetch rejects → 502", async () => {
  await withLlm(
    () => Promise.reject(new Error("network down")),
    async () => {
      const res = await createHandler()(post("text"));
      assert(res.status === 502, `status ${res.status}`);
    },
  );
});

Deno.test("draft: the body sent to fetch contains the text; bad input → 400", async () => {
  const text = "Unique marker: diabetes cohort per region 2025";
  const bodies = await withLlm(
    () => Promise.resolve(llmReply(JSON.stringify(VALID))),
    async () => {
      await createHandler()(post(text));
      const tooLong = await createHandler()(post("x".repeat(4001)));
      assert(tooLong.status === 400, `status ${tooLong.status}`);
      const empty = await createHandler()(post("  "));
      assert(empty.status === 400, `status ${empty.status}`);
    },
  );
  assert(bodies.length === 1, `fetch calls ${bodies.length}`);
  assert(bodies[0].includes(text), "LLM payload must contain the text");
  assert(bodies[0].includes("Supported definition patterns"));
});
