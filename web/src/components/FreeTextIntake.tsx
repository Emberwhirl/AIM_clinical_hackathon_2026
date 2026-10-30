/**
 * Free-text intake: the applicant describes the request in their own words,
 * the backend drafts the structured fields, the person reviews the filled form.
 */
import { useState } from "react";
import { draftRequest } from "@/lib/ehds";
import { useT } from "@/lib/i18n";

export type DraftFields = Awaited<ReturnType<typeof draftRequest>>;

const textareaCls =
  "block w-full rounded border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

export function FreeTextIntake({ onDraft }: { onDraft: (fields: DraftFields) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function draft() {
    setBusy(true);
    setError("");
    setStatus(t("form.freeText.drafting"));
    try {
      onDraft(await draftRequest(text));
      setStatus(t("form.freeText.done"));
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : t("form.freeText.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1 rounded border border-dashed border-input p-3">
      <label htmlFor="g-free-text" className="block text-sm font-medium">
        {t("form.freeText.label")}
      </label>
      <textarea
        id="g-free-text"
        rows={4}
        maxLength={4000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={textareaCls}
        placeholder={t("form.freeText.placeholder")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={draft}
          disabled={busy || !text.trim()}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {t("form.freeText.draft")}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {status}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
