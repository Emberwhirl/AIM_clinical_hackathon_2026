import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteHeader } from "./SiteHeader";
import { useT } from "@/lib/i18n";

export function HowWeDecide() {
  const t = useT();
  useEffect(() => {
    document.title = t("page.title.howWeDecide");
  }, [t]);

  const decisionOrder = [
    { title: t("hwd.order.item1.title"), text: t("hwd.order.item1.text") },
    { title: t("hwd.order.item2.title"), text: t("hwd.order.item2.text") },
    { title: t("hwd.order.item3.title"), text: t("hwd.order.item3.text") },
    { title: t("hwd.order.item4.title"), text: t("hwd.order.item4.text") },
  ];

  return (
    <div className="min-h-screen bg-landing text-foreground">
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-4xl space-y-8 px-5 py-10 sm:px-6 sm:py-12">
        <div className="border-b border-border pb-6">
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {t("hwd.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{t("hwd.title")}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("hwd.intro")}</p>
        </div>
        <section aria-labelledby="order-title">
          <h2 id="order-title" className="font-display text-xl font-semibold">
            {t("hwd.order.title")}
          </h2>
          <ol className="mt-4 list-decimal space-y-4 pl-5 marker:font-mono marker:text-muted-foreground">
            {decisionOrder.map(({ title, text }) => (
              <li key={title} className="pl-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-5 rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {t("hwd.order.note")}
          </p>
        </section>
        <section aria-labelledby="rules-title" className="border-t border-border pt-6">
          <h2 id="rules-title" className="font-display text-xl font-semibold">
            {t("hwd.rules.title")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{t("hwd.rules.text")}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("hwd.rules.quotes")}
          </p>
        </section>
        <section aria-labelledby="statistics-title" className="border-t border-border pt-6">
          <h2 id="statistics-title" className="font-display text-xl font-semibold">
            {t("hwd.statistics.title")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{t("hwd.statistics.text")}</p>
        </section>
        <section aria-labelledby="opt-outs-title" className="border-t border-border pt-6">
          <h2 id="opt-outs-title" className="font-display text-xl font-semibold">
            {t("hwd.optouts.title")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{t("hwd.optouts.text")}</p>
        </section>
        <section aria-labelledby="secure-title" className="border-t border-border pt-6">
          <h2 id="secure-title" className="font-display text-xl font-semibold">
            {t("hwd.secure.title")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{t("hwd.secure.text")}</p>
        </section>
        <section
          aria-labelledby="testing-title"
          className="rounded-md border border-border bg-muted/40 p-5 sm:p-6"
        >
          <h2 id="testing-title" className="font-display text-xl font-semibold">
            {t("hwd.testing.title")}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">{t("hwd.testing.measured")}</p>
          <dl className="mt-4 grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold">{t("hwd.testing.sample.dt")}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{t("hwd.testing.sample.dd")}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">{t("hwd.testing.jury.dt")}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{t("hwd.testing.jury.dd")}</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            {t("hwd.testing.disclaimer")}
          </p>
        </section>
        <section aria-labelledby="ai-title" className="border-t border-border pt-6">
          <h2 id="ai-title" className="font-display text-xl font-semibold">
            {t("hwd.ai.title")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed">{t("hwd.ai.text")}</p>
        </section>
        <div className="border-t border-border pt-6">
          <Link
            to="/examples"
            className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline underline-offset-4"
          >
            {t("hwd.explore")}
          </Link>
        </div>
      </main>
    </div>
  );
}
