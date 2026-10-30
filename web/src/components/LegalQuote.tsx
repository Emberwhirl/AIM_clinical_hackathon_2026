import type { LegalArticle } from "@/lib/ehds";
import { useLang, useT } from "@/lib/i18n";
import { localizeBackendText } from "@/lib/i18n/translations";

export function LegalQuote({ article }: { article: LegalArticle }) {
  const t = useT();
  const { lang } = useLang();
  const start = article.applies ? article.quote.indexOf(article.applies) : -1;
  return (
    <figure className="min-w-0 break-words rounded-md border-l-2 border-primary bg-muted/40 p-4">
      <figcaption className="text-sm font-semibold">
        <span className="font-mono">
          {article.ref ||
            (article.number.startsWith("Art.") ? article.number : `Art. ${article.number}`)}
        </span>
        <span className="ml-2 font-normal text-foreground">
          {localizeBackendText(article.title, lang)}
        </span>
        {lang === "de" && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t("legal.officialLabel")}
          </span>
        )}
      </figcaption>
      {article.quote && (
        <blockquote className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed">
          {start >= 0 && article.applies ? (
            <>
              {article.quote.slice(0, start)}
              <strong>{article.applies}</strong>
              {article.quote.slice(start + article.applies.length)}
            </>
          ) : (
            article.quote
          )}
        </blockquote>
      )}
      {article.summary && (
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          {localizeBackendText(article.summary, lang)}
        </p>
      )}
    </figure>
  );
}
