/**
 * Purpose screening — a second opinion on the stated purpose
 *
 * screenPurpose(purpose, question) → ScreenResult | null
 *
 * Asks the configured LLM (temperature 0) whether the request wording could
 * plausibly be one of the prohibited secondary uses of Art. 54(1),
 * Regulation (EU) 2025/327, even when worded politely.
 *
 * Safety contract:
 *   - Only the purpose and question text are sent. No applicant data, no
 *     patient data, no answers.
 *   - The screen NEVER changes decision/articles/numbers. A suspect result only
 *     holds the request for staff review (enforced in pipeline.ts).
 *   - Off unless OPENROUTER_API_KEY is set AND LLM_SCREEN=on; any error,
 *     timeout or unparseable reply returns null and the app behaves as before.
 *
 * Reuses: isEnabled() / chatComplete() / llmConfig() from llm_fallback.ts
 */

import { chatComplete, isEnabled, llmConfig } from "./llm_fallback.ts";

export interface ScreenResult {
  /** True when the purpose could plausibly be a prohibited use. */
  suspect: boolean;
  /** Art. 54(1) point the LLM named, or null. */
  point: "a" | "b" | "c" | "d" | "e" | null;
  /** One short sentence from the LLM. */
  why: string;
  /** The LLM model identifier used. */
  model: string;
}

const POINTS = ["a", "b", "c", "d", "e"] as const;

function buildPrompt(purpose: string, question: string): string {
  return `You screen health data access requests under Regulation (EU) 2025/327 Article 54(1), which prohibits these secondary uses:
(a) taking decisions detrimental to a natural person based on their health data;
(b) taking decisions on insurance contracts or premiums, or on employment, credit or loans, that exclude or disadvantage people;
(c) advertising or marketing activities;
(d) developing products or services that may harm individuals or society (e.g. illicit drugs, alcohol, tobacco, nicotine, weapons, addictive products);
(e) sharing data with third parties not named in the permit.

Stated purpose:
${purpose}

Research question:
${question}

Could the stated purpose plausibly be one of these prohibited uses, even if worded politely? Answer ONLY a JSON object:
{"suspect": true|false, "point": "a"|"b"|"c"|"d"|"e"|null, "why": "<one short sentence>"}`;
}

/** Extract the first {...} object from the reply and validate its shape. */
function parseReply(text: string, model: string): ScreenResult | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj.suspect !== "boolean" || typeof obj.why !== "string") return null;
    const point = (POINTS as readonly string[]).includes(String(obj.point))
      ? obj.point as ScreenResult["point"]
      : null;
    return { suspect: obj.suspect, point, why: obj.why, model };
  } catch {
    return null;
  }
}

// In-memory cache for the process lifetime (same pattern as llm_fallback.ts).
const _screenCache = new Map<string, ScreenResult>();

async function hashKey(purpose: string, question: string): Promise<string> {
  const enc = new TextEncoder().encode(purpose + "\x00" + question);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Screen the request wording for a plausible Art. 54(1) prohibited use.
 * Returns null when disabled or on any error (the request proceeds as today).
 */
export async function screenPurpose(
  purpose: string,
  question: string,
): Promise<ScreenResult | null> {
  // One extra LLM call per decided request; it needs its own switch.
  if (!isEnabled() || Deno.env.get("LLM_SCREEN") !== "on") return null;

  const key = await hashKey(purpose, question);
  const cached = _screenCache.get(key);
  if (cached !== undefined) return cached;

  let result: ScreenResult | null;
  try {
    const reply = await chatComplete(buildPrompt(purpose, question), 120, 6000);
    result = parseReply(reply, llmConfig()!.model);
  } catch {
    // Any network/timeout error → feature is silent
    return null;
  }
  if (result) _screenCache.set(key, result);
  return result;
}

/** Exposed for testing: reset in-memory cache between test cases. */
export function _resetScreenCache(): void {
  _screenCache.clear();
}
