import { useState } from "react";
import { downloadRequest, type DecisionResult } from "@/lib/ehds";
import { ResultsTable } from "./ResultsTable";

import { DecisionBadge } from "./DecisionBadge";
import { LifecycleStepper } from "./LifecycleStepper";
import { ExplanationPanel } from "./ExplanationPanel";
import { ErrorState } from "./States";
import { Button } from "./ui/button";
import { useLang, useT } from "@/lib/i18n";
import { localizeBackendText } from "@/lib/i18n/translations";
import { plainOutcome } from "@/lib/decision-letter";

export function DecisionDetails({
  result,
  staff = false,
  onDownloadAttempt,
  request,
}: {
  result: DecisionResult;
  staff?: boolean;
  onDownloadAttempt?: () => void;
  request?: { purpose?: string; question?: string } | undefined;
}) {
  const t = useT();
  const { lang } = useLang();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const cohort = result.answer?.["cohort_size"];
  async function download() {
    setBusy(true);
    try {
      setMessage((await downloadRequest(result.request_id)).message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download blocked.");
    } finally {
      setBusy(false);
      onDownloadAttempt?.();
    }
  }

  const { headline, nextSteps } = plainOutcome(result, t, lang === "de" ? "de-AT" : "en-GB");

  return (
    <div className="mt-4 space-y-5">
      <div className="space-y-2 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DecisionBadge decision={result.decision} />
          <Button asChild variant="outline" size="sm">
            <a href={`/desk/letter/${encodeURIComponent(result.request_id)}`}>
              {t("decision.viewLetter")}
            </a>
          </Button>
        </div>
        <h3 className="text-xl font-bold leading-snug">{headline}</h3>
        <p className="text-sm leading-relaxed">{localizeBackendText(result.reason, lang)}</p>
        <p className="text-xs text-muted-foreground">{nextSteps}</p>
      </div>
      {result.guidance && (
        <section
          aria-label={t("decision.whatToChange")}
          className="rounded-md border border-border bg-muted/30 p-3.5"
        >
          <h4 className="text-sm font-semibold">{t("decision.whatToChange")}</h4>
          {result.guidance.split("\n").map((line, i) => (
            <p key={i} className="mt-1 text-sm">
              {localizeBackendText(line, lang)}
            </p>
          ))}
        </section>
      )}
      <LifecycleStepper
        needsReview={!!result.needs_review}
        timeline={result.timeline}
        deadline={result.deadline}
      />
      {result.needs_review && (
        <p className="text-sm font-semibold" role="status">
          {t("decision.needsReview")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">
          {t("decision.citedArticles")}
        </span>
        {result.articles.map((a) => (
          <span
            key={a}
            className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs"
          >
            {a}
          </span>
        ))}
      </div>
      {result.explanation && (
        <ExplanationPanel
          explanation={result.explanation}
          purpose={request?.purpose}
          question={request?.question}
          approved={result.decision !== "REJECT"}
          memo={result.memo}
        />
      )}
      {result.population && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("decision.eligiblePatients")}</span>{" "}
          <span className="font-mono font-medium">{result.population.eligible_patients}</span>
        </p>
      )}
      {result.parse_errors?.length ? (
        <div className="space-y-1 text-sm">
          <p className="font-semibold">{t("decision.definitionsNeedReview")}</p>
          <ul className="list-disc space-y-1 pl-5">
            {result.parse_errors.map((error, i) => (
              <li key={i}>
                {error.definition}, {localizeBackendText(error.reason, lang)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.decision === "APPROVE_STATISTICAL" && <ResultsTable answer={result.answer} />}
      {(result.decision === "APPROVE_SPE" || staff) && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("decision.cohortSize")}</span>{" "}
          <span className="font-mono font-medium">
            {typeof cohort === "number" || typeof cohort === "string"
              ? cohort
              : t("decision.notProvided")}
          </span>
        </p>
      )}
      {staff && (
        <div className="border-t border-border pt-3 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("decision.secureEnv")}
          </p>
          {result.decision === "APPROVE_SPE" ? (
            <>
              <p className="mt-1">
                {result.spe_schema
                  ? `${t("decision.speSchema")} ${result.spe_schema}`
                  : t("decision.provisioningNotProvided")}
                , {t("decision.downloadsBlocked")}
              </p>
              <button
                onClick={download}
                disabled={busy}
                className="mt-2 rounded border border-input px-3 py-1 text-sm hover:bg-muted disabled:opacity-50"
              >
                {busy ? t("decision.checking") : t("decision.download")}
              </button>
              {message && <ErrorState>{localizeBackendText(message, lang)}</ErrorState>}
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">
              {result.decision === "REJECT"
                ? t("decision.notApplicable")
                : t("decision.notRequired")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
