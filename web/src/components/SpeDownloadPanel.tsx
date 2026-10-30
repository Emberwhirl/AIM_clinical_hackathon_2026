import { useState } from "react";
import { answerRows } from "@/lib/answers";
import type { DecisionResult } from "@/lib/ehds";
import { useLang, useT } from "@/lib/i18n";
import { localizeBackendText } from "@/lib/i18n/translations";
import { SpeDownload, type BlockedKind } from "@/lib/spe-download";
import { ErrorState } from "./States";
import { Button } from "./ui/button";

export function SpeDownloadPanel({
  result,
  onDownloadAttempt,
}: {
  result: DecisionResult;
  onDownloadAttempt?: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [busyKind, setBusyKind] = useState<BlockedKind | null>(null);
  const [block, setBlock] = useState<{ reason: string; status: number; message: string } | null>(
    null,
  );
  const [failure, setFailure] = useState("");
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState("");
  const canExport =
    SpeDownload.isSafeAggregate(result.answer) && answerRows(result.answer).length > 0;

  async function blockDownload(kind: BlockedKind) {
    setBusyKind(kind);
    setBlock(null);
    setFailure("");
    try {
      setBlock(await SpeDownload.attempt(result.request_id, kind));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t("decision.download.failed"));
    } finally {
      setBusyKind(null);
      onDownloadAttempt?.();
    }
  }

  function exportAggregate() {
    setExportError("");
    try {
      const csv = SpeDownload.toCsv(result.answer);
      SpeDownload.save(SpeDownload.fileName(result.request_id), csv);
      setExported(true);
    } catch (error) {
      setExported(false);
      setExportError(error instanceof Error ? error.message : t("decision.export.failed"));
    }
  }

  const serverMessage = block ? localizeBackendText(block.message, lang) : "";
  const reason = block ? localizeBackendText(block.reason, lang) : "";

  return (
    <section
      aria-label={t("decision.export.region")}
      aria-busy={busyKind !== null}
      className="min-w-0 space-y-4 rounded border border-border p-4"
    >
      <div>
        <p className="font-semibold">{t("decision.export.heading")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("decision.export.hint")}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 max-w-full whitespace-normal"
          disabled={!canExport}
          onClick={exportAggregate}
        >
          {t("decision.export.aggregate")}
        </Button>
        {!canExport && <p className="mt-2 text-sm">{t("decision.export.unavailable")}</p>}
        {exported && !exportError && (
          <p role="status" className="mt-2 break-words text-sm">
            {t("decision.export.done")}
          </p>
        )}
        {exportError && <ErrorState>{exportError}</ErrorState>}
      </div>
      <div>
        <p className="font-semibold">{t("decision.download.heading")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("decision.download.hint")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="max-w-full whitespace-normal"
            disabled={busyKind !== null}
            onClick={() => blockDownload("rows")}
          >
            {busyKind === "rows" ? t("decision.checking") : t("decision.download")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-w-full whitespace-normal"
            disabled={busyKind !== null}
            onClick={() => blockDownload("unsuppressed")}
          >
            {busyKind === "unsuppressed"
              ? t("decision.checking")
              : t("decision.download.unsuppressed")}
          </Button>
        </div>
        {busyKind && (
          <p role="status" className="mt-2 text-sm">
            {t("decision.checking")}
          </p>
        )}
        {failure && <ErrorState>{failure}</ErrorState>}
        {block && (
          <ErrorState>
            <p className="break-words">{reason}</p>
            <p className="mt-1">HTTP {block.status}</p>
            {serverMessage !== reason && <p className="mt-1 break-words">{serverMessage}</p>}
          </ErrorState>
        )}
      </div>
    </section>
  );
}
