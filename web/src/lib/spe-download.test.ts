import { describe, expect, it, vi } from "vitest";
import { SpeDownload } from "./spe-download";

describe("SpeDownload aggregates", () => {
  const suppressed = {
    Burgenland: { women_with_bmi: "<10", mean_bmi: "suppressed" },
    Niederösterreich: { women_with_bmi: 15, mean_bmi: 27.2 },
  };

  it("exports suppressed cells and published counts, never invented raw values", () => {
    expect(SpeDownload.isSafeAggregate(suppressed)).toBe(true);
    const csv = SpeDownload.toCsv(suppressed);
    expect(csv.split("\n")).toEqual([
      "group,metric,value",
      "Burgenland,women_with_bmi,<10",
      "Burgenland,mean_bmi,suppressed",
      "Niederösterreich,women_with_bmi,15",
      "Niederösterreich,mean_bmi,27.2",
    ]);
    expect(csv).not.toContain("patient_id");
  });

  it("exports an SPE cohort size as an aggregate", () => {
    expect(SpeDownload.toCsv({ cohort_size: 1152 })).toContain("1152");
    expect(SpeDownload.fileName("R05")).toBe("R05-suppressed-aggregate.csv");
  });

  it("refuses row-level answers", () => {
    const rows = { records: [{ patient_id: "p1", icd10: "E11" }] } as never;
    expect(SpeDownload.isSafeAggregate(rows)).toBe(false);
    expect(() => SpeDownload.toCsv(rows)).toThrow(/Row-level data stays/);
    expect(SpeDownload.isSafeAggregate(null)).toBe(false);
    expect(SpeDownload.isSafeAggregate({ note: "free text about a patient" })).toBe(false);
  });

  it("names the blocked reason for each refused kind", () => {
    expect(SpeDownload.reason("rows")).toMatch(/row-level data/);
    expect(SpeDownload.reason("rows")).toMatch(/Art\. 73/);
    expect(SpeDownload.reason("unsuppressed")).toMatch(/unsuppressed values/);
    expect(SpeDownload.reason("unsuppressed")).toMatch(
      /Suppressed aggregate results stay available/,
    );
  });
});

describe("SpeDownload.save", () => {
  it("downloads the csv under the aggregate filename", () => {
    const click = vi.fn();
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:aggregate");
    const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (tag === "a") element.click = click;
      return element;
    });
    SpeDownload.save("R08-suppressed-aggregate.csv", "group,metric,value\n");
    expect(created).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revoked).toHaveBeenCalledWith("blob:aggregate");
    created.mockRestore();
    revoked.mockRestore();
    vi.restoreAllMocks();
  });
});
