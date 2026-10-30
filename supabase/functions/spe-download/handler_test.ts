import { SpeDownload, SpeDownloadHandler, type DownloadLog } from "./handler.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message = ""): void {
  assert(
    actual === expected,
    message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function log(): { entries: { requestId: string; schema: string; userAgent: string | null }[]; closed: number; connect: () => DownloadLog } {
  const entries: { requestId: string; schema: string; userAgent: string | null }[] = [];
  let closed = 0;
  return {
    entries,
    get closed() {
      return closed;
    },
    connect: () => ({
      insert(entry) {
        entries.push(entry);
        return Promise.resolve();
      },
      end() {
        closed++;
        return Promise.resolve();
      },
    }),
  };
}

Deno.test("SPE download refuses with the Art. 73 message and logs the attempt", async () => {
  const audit = log();
  const handler = SpeDownloadHandler.serve(audit.connect);
  const response = await handler(
    new Request("https://example.com/spe-download?id=R05", {
      headers: { "user-agent": "jury-demo" },
    }),
  );
  equal(response.status, 403);
  equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  equal(
    await response.json().then((body) => JSON.stringify(body)),
    JSON.stringify({
      error: SpeDownload.defaultRefusal,
      request_id: "R05",
    }),
  );
  equal(audit.entries.length, 1);
  equal(audit.entries[0].requestId, "R05");
  equal(audit.entries[0].schema, "spe_r05");
  equal(audit.entries[0].userAgent, "jury-demo");
  equal(audit.closed, 1);
});

Deno.test("row-level and unsuppressed downloads are blocked; aggregate files are refused too", async () => {
  const cases = [
    {
      kind: "rows",
      error: SpeDownload.rowRefusal,
    },
    {
      kind: "unsuppressed",
      error: SpeDownload.unsuppressedRefusal,
    },
    {
      kind: "aggregate",
      error: SpeDownload.aggregateRefusal,
    },
  ] as const;
  for (const item of cases) {
    const audit = log();
    const handler = SpeDownloadHandler.serve(audit.connect);
    const response = await handler(
      new Request("https://example.com/spe-download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "R05",
          kind: item.kind,
          records: [{ patient_id: "secret-patient", icd10: "E11" }],
          answer: { Wien: { adults: 1 } },
        }),
      }),
    );
    equal(response.status, 403, item.kind);
    const body = await response.json();
    equal(body.error, item.error, item.kind);
    equal(body.request_id, "R05");
    const encoded = JSON.stringify(body);
    assert(!encoded.includes("secret-patient"), item.kind);
    assert(!encoded.includes("E11"), item.kind);
    assert(!encoded.includes("records"), item.kind);
    assert(!encoded.includes("patient_id"), item.kind);
    assert(audit.entries.length === 1, item.kind);
  }
});

Deno.test("a query id wins and an invalid kind stays on the default refusal", async () => {
  const audit = log();
  const handler = SpeDownloadHandler.serve(audit.connect);
  const response = await handler(
    new Request("https://example.com/spe-download?id=R08&kind=leak", {
      method: "POST",
      body: JSON.stringify({ id: "R05", kind: "nope", rows: [1, 2, 3] }),
    }),
  );
  const body = await response.json();
  equal(response.status, 403);
  equal(body.error, SpeDownload.defaultRefusal);
  equal(body.request_id, "R08");
  equal(audit.entries[0].schema, "spe_r08");
  assert(!JSON.stringify(body).includes("rows"));

  const fromBody = await handler(
    new Request("https://example.com/spe-download?id=R08", {
      method: "POST",
      body: JSON.stringify({ id: "R05", kind: "rows" }),
    }),
  );
  const chosen = await fromBody.json();
  equal(chosen.error, SpeDownload.rowRefusal);
  equal(chosen.request_id, "R08");
});

Deno.test("kind can be set on GET and a broken body still blocks", async () => {
  const audit = log();
  const handler = SpeDownloadHandler.serve(audit.connect);
  const byQuery = await handler(
    new Request("https://example.com/spe-download?id=R08&kind=unsuppressed"),
  );
  equal((await byQuery.json()).error, SpeDownload.unsuppressedRefusal);
  const broken = await handler(
    new Request("https://example.com/spe-download", {
      method: "POST",
      body: "{",
    }),
  );
  const body = await broken.json();
  equal(broken.status, 403);
  equal(body.error, SpeDownload.defaultRefusal);
  equal(body.request_id, null);
  equal(audit.entries.at(-1)?.requestId, "(unknown)");
  equal(audit.entries.at(-1)?.schema, "(unknown)");
});

Deno.test("logging failures, including a missing database, still return 403", async () => {
  const secret = "postgres://user:secret-password@db.internal/postgres";
  let ended = false;
  const handler = SpeDownloadHandler.serve(() => ({
    insert() {
      return Promise.reject(new Error(secret));
    },
    end() {
      ended = true;
      return Promise.resolve();
    },
  }));
  const logged = await handler(new Request("https://example.com/spe-download?id=R05&kind=rows"));
  equal(logged.status, 403);
  const loggedText = await logged.text();
  assert(loggedText.includes(SpeDownload.rowRefusal));
  assert(!loggedText.includes("secret-password"));
  assert(ended);

  const offline = SpeDownloadHandler.serve(() => {
    throw new Error(secret);
  });
  const response = await offline(
    new Request("https://example.com/spe-download", {
      method: "POST",
      body: JSON.stringify({ id: "R05", kind: "aggregate" }),
    }),
  );
  equal(response.status, 403);
  const text = await response.text();
  assert(text.includes(SpeDownload.aggregateRefusal));
  assert(!text.includes("secret-password"));
  assert(!text.includes(secret));
});

Deno.test("unsupported methods do not log and do not return records", async () => {
  let connects = 0;
  const handler = SpeDownloadHandler.serve(() => {
    connects++;
    return {
      insert() {
        return Promise.resolve();
      },
      end() {
        return Promise.resolve();
      },
    };
  });
  const options = await handler(
    new Request("https://example.com/spe-download", { method: "OPTIONS" }),
  );
  equal(options.status, 204);
  equal(await options.text(), "");
  for (const method of ["PUT", "DELETE", "PATCH"]) {
    const response = await handler(
      new Request("https://example.com/spe-download?id=R05", { method }),
    );
    equal(response.status, 405);
    equal((await response.json()).error, "method not allowed");
  }
  equal(connects, 0);
});

Deno.test("schema labels reject unsafe request ids", () => {
  equal(SpeDownload.schemaFor(null), "(unknown)");
  equal(SpeDownload.schemaFor("R05"), "spe_r05");
  equal(SpeDownload.schemaFor("bad id"), "(unknown)");
  equal(SpeDownload.schemaFor("spe_../public"), "(unknown)");
});
