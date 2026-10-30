/**
 * Free-text intake: turns an applicant's own description into the structured
 * request fields (purpose, question, requested_as, requested_format,
 * definitions).  The person reviews the filled form; the normal rules decide.
 *
 * Only the submitted text goes to the model.  Nothing is stored, no SQL,
 * no patient data.  The result never carries id, applicant or submitted.
 */
import {
  chatComplete,
  isEnabled,
  SUPPORTED_PATTERNS,
} from "../_shared/llm_fallback.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TEXT = 4000;
const REQUESTED_AS = ["health data request", "health data access application"];
const REQUESTED_FORMAT = ["anonymised statistics", "pseudonymised records"];

export interface Draft {
  purpose: string;
  question: string;
  requested_as: string;
  requested_format: string;
  definitions: string[];
}

export function buildPrompt(text: string): string {
  return `You convert a free-text description of a health-data request into JSON.

Output a JSON object with exactly these keys:
- "purpose": why the data is needed (string)
- "question": the specific question the data should answer (string)
- "requested_as": one of "${REQUESTED_AS[0]}" or "${REQUESTED_AS[1]}"
- "requested_format": one of "${REQUESTED_FORMAT[0]}" or "${REQUESTED_FORMAT[1]}"
- "definitions": array of 1 to 12 strings written ONLY in the supported wording below

${SUPPORTED_PATTERNS}

Keep all numbers, codes and names from the description unchanged. Output ONLY the JSON object, no explanations.

Description:
${text}

Output (JSON object only):`;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Extract and validate the first {...} object in the model output; null when unusable. */
export function parseDraft(generated: string): Draft | null {
  const start = generated.indexOf("{");
  const end = generated.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  let value: unknown;
  try {
    value = JSON.parse(generated.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  if (!nonEmpty(d.purpose) || !nonEmpty(d.question)) return null;
  if (!REQUESTED_AS.includes(d.requested_as as string)) return null;
  if (!REQUESTED_FORMAT.includes(d.requested_format as string)) return null;
  const defs = d.definitions;
  if (
    !Array.isArray(defs) || defs.length < 1 || defs.length > 12 ||
    !defs.every(nonEmpty)
  ) return null;
  return {
    purpose: d.purpose,
    question: d.question,
    requested_as: d.requested_as as string,
    requested_format: d.requested_format as string,
    definitions: defs,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function createHandler() {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
    if (!isEnabled()) return json({ error: "AI drafting is not enabled" }, 503);
    let body: { text?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const text = body?.text;
    if (!nonEmpty(text) || text.length > MAX_TEXT) {
      return json(
        { error: `text must be a non-empty string of at most ${MAX_TEXT} characters` },
        400,
      );
    }
    let generated: string;
    try {
      generated = await chatComplete(buildPrompt(text), 600, 15000);
    } catch (error) {
      console.error("draft: LLM request failed", (error as Error)?.name);
      return json({ error: "AI drafting failed" }, 502);
    }
    const draft = parseDraft(generated);
    if (!draft) {
      return json({ error: "Could not draft a request from this text" }, 422);
    }
    return json(draft);
  };
}
