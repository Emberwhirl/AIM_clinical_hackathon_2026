/**
 * Applicant guidance ("What to change") for rejected or held requests.
 *
 * Pure and deterministic: no LLM call, no SQL.  Returns one sentence per
 * line so the front end can translate each fixed sentence on its own
 * (see web/src/lib/i18n/translations.ts).
 */

import { ALL_RULES } from "./decision.ts";

export interface GuidanceInput {
  decision: string;
  needs_review: boolean;
  rule_id?: string;
  requested_as?: string;
  requested_format?: string;
  unreadable?: { index: number; definition: string; reason: string }[];
  ai_assist?: { rewritten: { original: string; rewritten: string }[] } | null;
}

export const ART53_HINT =
  "If your actual purpose is a permitted one under Article 53 (for example scientific research, public health or prevention), state it clearly and remove the prohibited use.";
export const PURPOSE_HINT =
  "Name a permitted purpose under Article 53 in your purpose statement, for example scientific research, public health, prevention or quality improvement, training or validating an AI model.";
export const WORDING_HINT =
  "Use the supported wording, for example: \"Adult = aged 18 or older on 31 December 2025.\", \"Type 2 diabetes = any condition with an ICD-10 code starting with E11.\" and \"Report per region: adults, adults with type 2 diabetes and the prevalence.\"";
export const SPE_HINT =
  "You asked for patient-level records but did not explain why anonymised statistics are not enough. If you need records, say why (for example: training a model needs individual-level histories; aggregates are not enough).";

/** Guidance text for a rejection, hold or downgrade; null when nothing needs to change. */
export function guidanceFor(input: GuidanceInput): string | null {
  const lines: string[] = [];
  if (input.decision === "REJECT") {
    const rule = ALL_RULES.find((r) =>
      r.id === input.rule_id && r.kind === "prohibited"
    );
    lines.push(
      rule
        ? `Your request was rejected because it names a prohibited use under Article ${rule.article_ref}(1): ${rule.label}.`
        : "Your request was rejected because it names a prohibited use under Article 54(1).",
    );
    lines.push(ART53_HINT);
    return lines.join("\n");
  }
  if (input.needs_review) {
    const unreadable = input.unreadable ?? [];
    const rewritten = input.ai_assist?.rewritten ?? [];
    if (unreadable.length === 0 && rewritten.length === 0) return PURPOSE_HINT;
    for (const u of unreadable) {
      const which = u.index >= 0 ? `Definition ${u.index + 1}` : "A definition";
      lines.push(`${which} could not be read: ${u.reason.replace(/\.$/, "")}.`);
    }
    lines.push(WORDING_HINT);
    for (const r of rewritten) lines.push(`Suggested wording: ${r.rewritten}`);
    return lines.join("\n");
  }
  if (
    input.decision === "APPROVE_STATISTICAL" &&
    (input.requested_as ?? "").toLowerCase() === "health data access application"
  ) {
    return SPE_HINT;
  }
  return null;
}
