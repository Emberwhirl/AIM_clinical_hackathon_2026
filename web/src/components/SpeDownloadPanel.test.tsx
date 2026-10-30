import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { supabase } from "@/integrations/supabase/client";
import type { DecisionResult } from "@/lib/ehds";
import { SpeDownload } from "@/lib/spe-download";
import { DecisionDetails } from "./DecisionDetails";

const invoke = vi.mocked(supabase.functions.invoke);
const blockedMessage =
  "Download blocked: data in a secure processing environment cannot be downloaded (EHDS Art. 73).";

const statistical: DecisionResult = {
  request_id: "R08",
  decision: "APPROVE_STATISTICAL",
  articles: ["Art. 53", "Art. 69"],
  reason: "Anonymised statistics are sufficient.",
  answer: {
    Burgenland: { women_with_bmi: "<10", mean_bmi: "suppressed" },
    Niederösterreich: { women_with_bmi: 15, mean_bmi: 27.2 },
  },
};

function blocked(message = blockedMessage) {
  return {
    data: null,
    error: {
      message: "Function error",
      context: new Response(JSON.stringify({ error: message }), { status: 403 }),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it("blocks a row-level download and keeps the suppressed aggregate visible and exportable", async () => {
  const save = vi.spyOn(SpeDownload, "save").mockImplementation(() => undefined);
  invoke.mockResolvedValue(blocked());
  render(<DecisionDetails result={statistical} />);

  expect(screen.getByRole("cell", { name: "<10" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "suppressed" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "15" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Export suppressed aggregate" }));
  expect(save).toHaveBeenCalledWith(
    "R08-suppressed-aggregate.csv",
    expect.stringContaining("Burgenland,women_with_bmi,<10"),
  );
  expect(save.mock.calls[0]?.[1]).toContain("mean_bmi,suppressed");
  expect(save.mock.calls[0]?.[1]).not.toContain("patient_id");
  expect(screen.getByRole("status")).toHaveTextContent("Suppressed aggregate exported");
  expect(screen.getByRole("cell", { name: "<10" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Download row-level data" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Download blocked: row-level data in a secure processing environment cannot be downloaded (EHDS Art. 73).",
  );
  expect(alert).toHaveTextContent("HTTP 403");
  expect(alert).toHaveTextContent(blockedMessage);
  expect(invoke).toHaveBeenCalledWith("spe-download", { body: { id: "R08", kind: "rows" } });
  expect(screen.getByRole("cell", { name: "<10" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "suppressed" })).toBeInTheDocument();
  expect(screen.queryByText(/patient_id|secret-patient/)).not.toBeInTheDocument();
});

it("blocks an unsuppressed download with a reason that keeps aggregates available", async () => {
  invoke.mockResolvedValue(blocked());
  render(<DecisionDetails result={statistical} />);
  fireEvent.click(screen.getByRole("button", { name: "Download unsuppressed data" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/unsuppressed values/);
  expect(alert).toHaveTextContent("Suppressed aggregate results stay available");
  expect(alert).toHaveTextContent("HTTP 403");
  expect(invoke).toHaveBeenCalledWith("spe-download", {
    body: { id: "R08", kind: "unsuppressed" },
  });
  expect(screen.getByRole("cell", { name: "27.2" })).toBeInTheDocument();
});

it("does not treat a non-403 payload as a successful download", async () => {
  invoke.mockResolvedValue({ data: { records: ["private record"] }, error: null });
  render(<DecisionDetails result={statistical} />);
  fireEvent.click(screen.getByRole("button", { name: "Download row-level data" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("required 403 refusal");
  expect(screen.queryByText("private record")).not.toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "suppressed" })).toBeInTheDocument();
});

it("shows a loading state and then the refusal for an SPE cohort", async () => {
  let resolve!: (value: ReturnType<typeof blocked>) => void;
  invoke.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <DecisionDetails
      result={{
        request_id: "R05",
        decision: "APPROVE_SPE",
        articles: ["Art. 73"],
        reason: "Secure environment",
        answer: { cohort_size: 1152 },
        spe_schema: "spe_r05",
      }}
    />,
  );
  expect(screen.getByText("1152")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Download row-level data" }));
  expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Download unsuppressed data" })).toBeDisabled();
  resolve(blocked());
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("HTTP 403"));
  expect(screen.getByText("1152")).toBeInTheDocument();
  expect(screen.queryByText("spe_r05")).not.toBeInTheDocument();
});

it("hides download controls for a rejection", () => {
  render(
    <DecisionDetails
      result={{
        request_id: "R02",
        decision: "REJECT",
        articles: ["Art. 54"],
        reason: "Prohibited",
        answer: null,
      }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Download row-level data" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Export suppressed aggregate" }),
  ).not.toBeInTheDocument();
});
