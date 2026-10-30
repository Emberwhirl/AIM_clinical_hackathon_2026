/**
 * Tests for the free-text intake component.
 *
 * Covered:
 *   1. typing text and clicking the button calls invoke("draft", …) and onDraft gets the fields
 *   2. an error from invoke is shown
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
import { supabase } from "@/integrations/supabase/client";

import { FreeTextIntake } from "@/components/FreeTextIntake";

const FIELDS = {
  purpose: "Public-health monitoring.",
  question: "How many patients had diabetes per region?",
  requested_as: "health data request",
  requested_format: "anonymised statistics",
  definitions: ["Diabetes = any condition with an ICD-10 code starting with E11"],
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("FreeTextIntake", () => {
  it("drafts the request and hands the fields to onDraft", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: FIELDS, error: null });
    const onDraft = vi.fn();
    render(<FreeTextIntake onDraft={onDraft} />);

    const text = "We want diabetes statistics per region.";
    fireEvent.change(screen.getByLabelText("Or describe your request in your own words"), {
      target: { value: text },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft my request" }));

    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(FIELDS));
    expect(supabase.functions.invoke).toHaveBeenCalledWith("draft", { body: { text } });
    expect(screen.getByRole("status").textContent).toMatch(/review/i);
  });

  it("shows the backend error text", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { error: "Could not draft a request from this text" },
      error: null,
    });
    const onDraft = vi.fn();
    render(<FreeTextIntake onDraft={onDraft} />);

    fireEvent.change(screen.getByLabelText("Or describe your request in your own words"), {
      target: { value: "gibberish" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft my request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not draft a request from this text",
    );
    expect(onDraft).not.toHaveBeenCalled();
  });
});
