/**
 * Tests for guidance.ts — one case per guidance branch.
 */

import {
  ART53_HINT,
  guidanceFor,
  PURPOSE_HINT,
  SPE_HINT,
  WORDING_HINT,
} from "./guidance.ts";

function assert(ok: boolean, message = "Assertion failed"): asserts ok {
  if (!ok) throw new Error(message);
}

Deno.test("guidance: null for an approved decided request", () => {
  assert(
    guidanceFor({
      decision: "APPROVE_STATISTICAL",
      needs_review: false,
      requested_as: "health data request",
    }) === null,
  );
  assert(
    guidanceFor({ decision: "APPROVE_SPE", needs_review: false }) === null,
  );
});

Deno.test("guidance: REJECT names the prohibited use and the Art. 54 point", () => {
  const text = guidanceFor({
    decision: "REJECT",
    needs_review: false,
    rule_id: "P01",
  });
  assert(text !== null);
  const [first, second] = text.split("\n");
  assert(first.includes("Article 54(1)"), first);
  assert(first.includes("insurance premiums / insurance decisions (Art. 54(1)(b))"), first);
  assert(second === ART53_HINT);
});

Deno.test("guidance: held without a recognised purpose asks for an Art. 53 purpose", () => {
  assert(
    guidanceFor({ decision: "APPROVE_STATISTICAL", needs_review: true }) ===
      PURPOSE_HINT,
  );
});

Deno.test("guidance: held with unreadable definitions quotes the reason, wording examples and rewrites", () => {
  const text = guidanceFor({
    decision: "APPROVE_STATISTICAL",
    needs_review: true,
    unreadable: [{ index: 1, definition: "Old = 70+", reason: "Unknown definition pattern." }],
    ai_assist: {
      rewritten: [{ original: "Old = 70+", rewritten: "Old = aged 70 or older on 31 December 2025" }],
    },
  });
  assert(text !== null);
  const lines = text.split("\n");
  assert(lines[0] === "Definition 2 could not be read: Unknown definition pattern.", lines[0]);
  assert(lines[1] === WORDING_HINT);
  assert(lines[2] === "Suggested wording: Old = aged 70 or older on 31 December 2025", lines[2]);
});

Deno.test("guidance: access application downgraded to statistics explains the Art. 66 gap", () => {
  assert(
    guidanceFor({
      decision: "APPROVE_STATISTICAL",
      needs_review: false,
      requested_as: "health data access application",
      requested_format: "pseudonymised records",
    }) === SPE_HINT,
  );
});
