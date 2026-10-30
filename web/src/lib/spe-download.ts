import { answerRows } from "./answers";
import { downloadRequest, type Answer, type AnswerValue } from "./ehds";

export type BlockedKind = "rows" | "unsuppressed";

/**
 * Decides what may leave the secure processing environment.
 * Aggregate cells already shown in a decision can be exported.
 * Row-level records and unsuppressed extracts are refused by spe-download.
 */
export class SpeDownload {
  static readonly rowReason =
    "Download blocked: row-level data in a secure processing environment cannot be downloaded (EHDS Art. 73).";

  static readonly unsuppressedReason =
    "Download blocked: unsuppressed values cannot be downloaded from a secure processing environment (EHDS Art. 73). Suppressed aggregate results stay available.";

  static reason(kind: BlockedKind): string {
    return kind === "rows" ? SpeDownload.rowReason : SpeDownload.unsuppressedReason;
  }

  static isSafeAggregate(answer: Answer | null): boolean {
    if (!answer || Array.isArray(answer)) return false;
    const allowed = /^(?:<\s*10|suppressed|-?\d+(?:\.\d+)?)$/i;
    const visit = (node: Answer): boolean => {
      for (const [key, value] of Object.entries(node)) {
        if (/patient_id|icd10|birth_date|pseudo/i.test(key)) return false;
        if (Array.isArray(value)) return false;
        if (value !== null && typeof value === "object") {
          if (!visit(value)) return false;
        } else if (typeof value === "number") {
          if (!Number.isFinite(value)) return false;
        } else if (typeof value === "string") {
          if (!allowed.test(value.trim())) return false;
        } else {
          return false;
        }
      }
      return true;
    };
    return visit(answer);
  }

  static fileName(requestId: string): string {
    const safe = /^[A-Za-z0-9_-]+$/.test(requestId) ? requestId : "result";
    return `${safe}-suppressed-aggregate.csv`;
  }

  static csvCell(value: AnswerValue): string {
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }

  /** CSV of the aggregate already on screen. Refuses record-shaped answers. */
  static toCsv(answer: Answer | null): string {
    if (!SpeDownload.isSafeAggregate(answer)) {
      throw new Error(
        "Only suppressed aggregate results can be exported. Row-level data stays in the secure processing environment.",
      );
    }
    const rows = answerRows(answer);
    if (!rows.length) throw new Error("No aggregate result is available to export.");
    const lines = ["group,metric,value"];
    for (const row of rows) {
      const group = row.groups.join(" / ") || "(overall)";
      for (const [metric, value] of Object.entries(row.metrics)) {
        lines.push([group, metric, value].map((cell) => SpeDownload.csvCell(cell)).join(","));
      }
    }
    return lines.join("\n");
  }

  static save(filename: string, csv: string): void {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  static async attempt(
    id: string,
    kind: BlockedKind,
  ): Promise<{ status: number; message: string; reason: string }> {
    const result = await downloadRequest(id, kind);
    return { ...result, reason: SpeDownload.reason(kind) };
  }
}
