import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SAMPLE_ENTRIES, submitRequest, type Decision, type DecisionResult } from "@/lib/ehds";
import { SiteHeader } from "./SiteHeader";
import { DecisionBadge } from "./DecisionBadge";
import { DecisionDetails } from "./DecisionDetails";
import { ErrorState } from "./States";
import { Button } from "./ui/button";
import { useT } from "@/lib/i18n";
import { localizeBackendText } from "@/lib/i18n/translations";
import { useLang } from "@/lib/i18n";

const expected: Record<string, { decision: Decision; reason: string }> = {
  R01: {
    decision: "APPROVE_STATISTICAL",
    reason:
      "Your purpose is an allowed use of health data (Art. 53). Anonymised statistics are sufficient to answer the question (Art. 69).",
  },
  R02: {
    decision: "REJECT",
    reason: "Using health data to set or align insurance premiums is prohibited (Art. 54).",
  },
  R03: {
    decision: "APPROVE_STATISTICAL",
    reason:
      "Your purpose is an allowed use of health data (Art. 53). Anonymised statistics are sufficient to answer the question (Art. 69).",
  },
  R04: {
    decision: "REJECT",
    reason: "Advertising and marketing are prohibited purposes for health data (Art. 54).",
  },
  R05: {
    decision: "APPROVE_SPE",
    reason:
      "Your purpose is an allowed use of health data (Art. 53). You have explained why anonymised statistics are not sufficient; pseudonymised patient-level data is justified (Art. 66). Access is granted inside a secure processing environment under a data permit (Art. 68, 73).",
  },
  R06: {
    decision: "REJECT",
    reason:
      "Using health data for decisions about employees, or matching it with an employee list, is prohibited (Art. 54). This could re-identify individuals and harm them.",
  },
  R07: {
    decision: "APPROVE_STATISTICAL",
    reason:
      "Your purpose is an allowed use of health data (Art. 53). Anonymised statistics are sufficient to answer the question (Art. 69).",
  },
  R08: {
    decision: "APPROVE_STATISTICAL",
    reason:
      "Your purpose is an allowed use of health data (Art. 53). Anonymised statistics are sufficient to answer the question (Art. 69).",
  },
  R09: {
    decision: "APPROVE_STATISTICAL",
    reason:
      "Your purpose is an allowed use of health data (Art. 53). Anonymised statistics are sufficient to answer the question; pseudonymised records are not justified under Art. 66. Your request is approved as statistics (Art. 69).",
  },
  R10: {
    decision: "REJECT",
    reason:
      "Developing or marketing nicotine or tobacco products is a prohibited purpose for health data (Art. 54).",
  },
};

type Sample = (typeof SAMPLE_ENTRIES)[number];

export function ExamplesGallery() {
  const t = useT();
  const { lang } = useLang();
  useEffect(() => {
    document.title = t("page.title.examples");
  }, [t]);
  const [selected, setSelected] = useState<Sample | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (selected) resultHeading.current?.focus();
  }, [selected]);

  async function open(sample: Sample) {
    setSelected(sample);
    setResult(null);
    setError("");
    setBusy(true);
    try {
      setResult(await submitRequest(sample.request));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The live result could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-landing text-foreground">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-5 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="font-display text-3xl font-semibold sm:text-4xl">
              {t("examples.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t("examples.intro")}</p>
          </div>
          <Link
            to="/how-we-decide"
            className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline underline-offset-4"
          >
            {t("examples.howWeDecide")}
          </Link>
        </div>
        <ul aria-label={t("examples.ariaList")} className="mt-6 grid gap-4 md:grid-cols-2">
          {SAMPLE_ENTRIES.map((sample) => (
            <li key={sample.id} className="min-w-0">
              <button
                type="button"
                onClick={() => open(sample)}
                disabled={busy}
                aria-label={`Open ${sample.label}`}
                aria-controls="example-result"
                aria-expanded={selected?.id === sample.id}
                className="flex h-full w-full flex-col items-start gap-3 rounded-md border border-border bg-card p-5 text-left transition-colors hover:border-primary aria-expanded:border-primary aria-expanded:bg-muted/30 disabled:opacity-60"
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {sample.id}
                  </span>
                  <DecisionBadge decision={expected[sample.id]!.decision} />
                </div>
                <span className="text-base font-semibold leading-snug">
                  {sample.request.question}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("examples.applicantType")}{" "}
                  {sample.request.requested_as === "health data access application"
                    ? t("enum.requestedAs.healthDataAccessApplication")
                    : t("enum.requestedAs.healthDataRequest")}
                </span>
                <span className="sr-only">{t("examples.expectedDecision")}</span>
                <span className="text-sm text-muted-foreground">
                  {localizeBackendText(expected[sample.id]!.reason, lang)}
                </span>
                <span className="mt-auto pt-1 text-xs font-medium text-primary underline underline-offset-4">
                  {t("examples.openFull")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <section
          id="example-result"
          aria-labelledby="result-title"
          aria-busy={busy}
          className="mt-8 min-w-0 rounded-md border border-border bg-card p-5 sm:p-7"
        >
          <h2
            id="result-title"
            ref={resultHeading}
            tabIndex={-1}
            className="font-display text-xl font-semibold"
          >
            {selected
              ? `${selected.id} ${t("examples.result.liveResult")}`
              : t("examples.result.title")}
          </h2>
          <div aria-live="polite">
            {busy && (
              <p role="status" className="mt-4 text-sm">
                {t("examples.result.loading")} {selected?.id} {t("examples.result.from")}
              </p>
            )}
            {error && <ErrorState>{error}</ErrorState>}
            {!selected && (
              <p className="mt-3 text-sm text-muted-foreground">{t("examples.result.choose")}</p>
            )}
          </div>
          {error && selected && (
            <Button onClick={() => open(selected)} variant="outline">
              {t("examples.result.tryAgain")}
            </Button>
          )}
          {result && selected && (
            <>
              <p className="mt-4 font-medium">{selected.request.question}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("examples.result.purpose")} {selected.request.purpose}
              </p>
              <DecisionDetails
                key={result.request_id}
                result={result}
                request={selected.request}
              />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
