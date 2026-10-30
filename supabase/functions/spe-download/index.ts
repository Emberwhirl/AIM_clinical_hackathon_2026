/**
 * Edge function: GET|POST /spe-download
 *
 * Downloads from a Secure Processing Environment are blocked.
 * EHDS Art. 73 — row-level data and unsuppressed values cannot be downloaded.
 * Suppressed aggregates stay in the decision response; this route does not
 * release a file. Every attempt is logged to public.spe_download_log.
 * The function returns HTTP 403 regardless of authentication.
 */
import postgres from "npm:postgres";
import {
  SpeDownloadHandler,
  type DownloadLog,
  type DownloadLogEntry,
} from "./handler.ts";

class ServiceDownloadLog implements DownloadLog {
  private constructor(private readonly db: ReturnType<typeof postgres>) {}

  static connect(): ServiceDownloadLog {
    const url = Deno.env.get("SUPABASE_DB_URL");
    if (!url) throw new Error("SUPABASE_DB_URL is not set");
    return new ServiceDownloadLog(postgres(url, {
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
    }));
  }

  insert(entry: DownloadLogEntry): Promise<void> {
    return this.db`
      INSERT INTO public.spe_download_log (request_id, schema, user_agent)
      VALUES (${entry.requestId}, ${entry.schema}, ${entry.userAgent})
    `.then(() => undefined);
  }

  end(): Promise<void> {
    return this.db.end();
  }
}

Deno.serve(SpeDownloadHandler.serve(() => ServiceDownloadLog.connect()));
