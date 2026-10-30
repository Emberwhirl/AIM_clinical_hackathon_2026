/**
 * SPE download gate. Row-level data, unsuppressed values, and file exports
 * from a secure processing environment are refused. Suppressed aggregates
 * stay in the decision response; this endpoint never returns them as a file
 * and never returns patient records.
 *
 * EHDS Art. 73.
 */
import { schemaName } from "../_shared/spe.ts";

export interface DownloadLogEntry {
  requestId: string;
  schema: string;
  userAgent: string | null;
}

export interface DownloadLog {
  insert(entry: DownloadLogEntry): Promise<void>;
  end(): Promise<void>;
}

export type DownloadKind = "rows" | "unsuppressed" | "aggregate";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export class SpeDownload {
  static readonly defaultRefusal =
    "Download blocked: data in a secure processing environment cannot be downloaded (EHDS Art. 73).";

  static readonly rowRefusal =
    "Download blocked: row-level data in a secure processing environment cannot be downloaded (EHDS Art. 73).";

  static readonly unsuppressedRefusal =
    "Download blocked: unsuppressed values cannot be downloaded from a secure processing environment (EHDS Art. 73). Suppressed aggregate results stay available.";

  static readonly aggregateRefusal =
    "Download blocked: a secure processing environment does not release a file (EHDS Art. 73). Suppressed aggregate results stay in the decision and can be exported from there.";

  static normalizeKind(value: unknown): DownloadKind | null {
    return value === "rows" || value === "unsuppressed" || value === "aggregate"
      ? value
      : null;
  }

  static refusal(kind: DownloadKind | null): string {
    switch (kind) {
      case "rows":
        return SpeDownload.rowRefusal;
      case "unsuppressed":
        return SpeDownload.unsuppressedRefusal;
      case "aggregate":
        return SpeDownload.aggregateRefusal;
      default:
        return SpeDownload.defaultRefusal;
    }
  }

  /** Schema label for the audit row. Invalid ids are stored as unknown. */
  static schemaFor(requestId: string | null): string {
    if (!requestId) return "(unknown)";
    try {
      return schemaName(requestId);
    } catch {
      return "(unknown)";
    }
  }

  static async readRequest(req: Request): Promise<{
    requestId: string | null;
    kind: DownloadKind | null;
  }> {
    const url = new URL(req.url);
    let requestId: string | null = null;
    const queryId = url.searchParams.get("id");
    if (queryId) requestId = queryId;
    let kind = SpeDownload.normalizeKind(url.searchParams.get("kind"));
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (!requestId && typeof body?.id === "string") requestId = body.id;
        if (!kind) kind = SpeDownload.normalizeKind(body?.kind);
      } catch {
        // A malformed body is still a blocked attempt.
      }
    }
    return { requestId, kind };
  }
}

export class SpeDownloadHandler {
  static json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  static serve(connect: () => DownloadLog): (req: Request) => Promise<Response> {
    return (req) => SpeDownloadHandler.handle(req, connect);
  }

  static async handle(
    req: Request,
    connect: () => DownloadLog,
  ): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== "GET" && req.method !== "POST") {
      return SpeDownloadHandler.json({ error: "method not allowed" }, 405);
    }

    const { requestId, kind } = await SpeDownload.readRequest(req);
    const schema = SpeDownload.schemaFor(requestId);
    const userAgent = req.headers.get("user-agent");
    try {
      const db = connect();
      try {
        await db.insert({
          requestId: requestId ?? "(unknown)",
          schema,
          userAgent,
        });
      } finally {
        await db.end();
      }
    } catch (err) {
      // Connection errors can include credentials. Keep the refusal and log the class only.
      const name = err instanceof Error ? err.name : "Error";
      console.error(`spe-download: failed to log attempt: ${name}`);
    }

    console.warn(
      `spe-download: blocked download attempt for request_id=${requestId} kind=${kind ?? "(default)"} schema=${schema} user_agent=${userAgent}`,
    );

    return SpeDownloadHandler.json(
      {
        error: SpeDownload.refusal(kind),
        request_id: requestId,
      },
      403,
    );
  }
}
