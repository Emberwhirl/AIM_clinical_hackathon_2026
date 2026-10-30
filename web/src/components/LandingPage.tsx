import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { usePreferences } from "@/lib/preferences";
import { useT } from "@/lib/i18n";

export function LandingPage() {
  const t = useT();
  const { setRole } = usePreferences();
  useEffect(() => {
    document.title = t("page.title.home");
  }, [t]);

  const steps = [
    {
      title: t("landing.step1.title"),
      text: t("landing.step1.text"),
    },
    {
      title: t("landing.step2.title"),
      text: t("landing.step2.text"),
    },
    {
      title: t("landing.step3.title"),
      text: t("landing.step3.text"),
    },
  ];

  const questions = [
    {
      id: "privacy",
      title: t("landing.faq.privacy.title"),
      text: t("landing.faq.privacy.text"),
    },
    {
      id: "legal",
      title: t("landing.faq.legal.title"),
      text: t("landing.faq.legal.text"),
    },
    {
      id: "decisions",
      title: t("landing.faq.decisions.title"),
      text: t("landing.faq.decisions.text"),
    },
  ];

  return (
    <div className="min-h-screen bg-landing font-sans text-foreground">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-6xl px-5 sm:px-6">
        <section
          aria-labelledby="hero-title"
          className="grid gap-12 border-b border-border py-14 sm:py-16 lg:grid-cols-[1.45fr_1fr] lg:items-start lg:gap-16"
        >
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {t("landing.eyebrow")}
            </p>
            <h1
              id="hero-title"
              className="max-w-2xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
            >
              {t("landing.hero")}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {t("landing.heroSub")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link to="/desk" onClick={() => setRole("applicant")}>
                  {t("landing.cta.submit")} <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-11">
                <Link to="/desk" onClick={() => setRole("demo")}>
                  {t("demo.quick.heading")}
                </Link>
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Link
                to="/examples"
                className="inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4"
              >
                {t("landing.cta.examples")}
              </Link>
              <Link
                to="/how-we-decide"
                className="inline-flex min-h-10 items-center font-medium text-primary underline underline-offset-4"
              >
                {t("landing.cta.howWeDecide")}
              </Link>
              <Link
                to="/desk"
                onClick={() => setRole("staff")}
                className="inline-flex min-h-10 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("landing.cta.staff")}
              </Link>
              <Link
                to="/desk"
                onClick={() => setRole("demo")}
                className="inline-flex min-h-10 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("landing.cta.demo")}
              </Link>
            </div>
            <ul
              aria-label="Safeguards"
              className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5 text-xs font-medium text-muted-foreground"
            >
              {[
                t("landing.chip.legalBasis"),
                t("landing.chip.noPatientData"),
                t("landing.chip.sameAnswer"),
              ].map((chip) => (
                <li key={chip} className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                  {chip}
                </li>
              ))}
            </ul>
          </div>
          <aside
            aria-labelledby="outputs-title"
            className="rounded-md border border-border bg-card p-6 sm:p-7"
          >
            <h2
              id="outputs-title"
              className="border-b border-border pb-3 font-display text-lg font-semibold"
            >
              {t("landing.whatYouGet.title")}
            </h2>
            <ul className="mt-4 divide-y divide-border">
              {[
                [t("landing.whatYouGet.item1.title"), t("landing.whatYouGet.item1.text")],
                [t("landing.whatYouGet.item2.title"), t("landing.whatYouGet.item2.text")],
                [t("landing.whatYouGet.item3.title"), t("landing.whatYouGet.item3.text")],
              ].map(([title, text]) => (
                <li key={title} className="py-3.5 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section aria-labelledby="steps-title" className="border-b border-border py-12 sm:py-14">
          <h2 id="steps-title" className="font-display text-2xl font-semibold">
            {t("landing.howItWorks.title")}
          </h2>
          <ol aria-label={t("landing.steps.list")} className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map(({ title, text }, index) => (
              <li key={title} className="border-t-2 border-primary pt-4">
                <span className="font-mono text-xs font-semibold text-muted-foreground">
                  0{index + 1}
                </span>
                <h3 className="mt-1 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="proof-title"
          className="border-b border-border py-12 sm:py-14"
        >
          <div className="rounded-md border border-border bg-muted/40 p-6 sm:p-8">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {t("landing.proof.eyebrow")}
            </p>
            <h2 id="proof-title" className="mt-2 font-display text-2xl font-semibold">
              {t("landing.proof.title")}
            </h2>
            <dl className="mt-6 grid grid-cols-2 gap-6 border-t border-border pt-6 lg:grid-cols-4">
              {[
                [t("landing.proof.stat1.value"), t("landing.proof.stat1.label")],
                [t("landing.proof.stat2.value"), t("landing.proof.stat2.label")],
                [t("landing.proof.stat3.value"), t("landing.proof.stat3.label")],
                [t("landing.proof.stat4.value"), t("landing.proof.stat4.label")],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 font-mono text-3xl font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              {t("landing.proof.disclaimer")}
            </p>
          </div>
        </section>

        <section
          id="ai-disclosure"
          aria-labelledby="ai-title"
          className="grid gap-6 border-b border-border py-12 sm:py-14 md:grid-cols-[1fr_2fr] md:gap-12"
        >
          <h2 id="ai-title" className="font-display text-2xl font-semibold whitespace-pre-line">
            {t("landing.aiDisclosure.title")}
          </h2>
          <div className="space-y-4 text-sm leading-relaxed">
            <p>{t("landing.aiDisclosure.p1")}</p>
            <p className="border-l-2 border-primary pl-4 font-medium text-foreground">
              {t("landing.aiDisclosure.callout")}
            </p>
          </div>
        </section>

        <section
          id="faq"
          aria-labelledby="faq-title"
          className="grid gap-6 py-12 sm:py-14 md:grid-cols-[1fr_2fr] md:gap-12"
        >
          <h2 id="faq-title" className="font-display text-2xl font-semibold">
            {t("landing.faq.title")}
          </h2>
          <Accordion type="single" collapsible>
            {questions.map(({ id, title, text }) => (
              <AccordionItem key={id} value={id}>
                <AccordionTrigger className="min-h-12 gap-4 text-left text-sm font-semibold">
                  {title}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {text}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      </main>
      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-xs sm:px-6">
          <p className="text-muted-foreground">{t("landing.footer.credit")}</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/desk" className="underline underline-offset-4">
              {t("landing.footer.openDesk")}
            </Link>
            <a href="#faq" className="underline underline-offset-4">
              {t("landing.footer.privacy")}
            </a>
            <a href="#ai-disclosure" className="underline underline-offset-4">
              {t("landing.footer.aiDisclosure")}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
