import { describe, expect, it } from "vitest";
import { isCaseStatus } from "@/lib/backend/validation";

describe("case status validation", () => {
  it("accepts valid status values", () => {
    expect(isCaseStatus("open")).toBe(true);
    expect(isCaseStatus("investigating")).toBe(true);
    expect(isCaseStatus("resolved")).toBe(true);
    expect(isCaseStatus("closed")).toBe(true);
  });

  it("rejects invalid status values", () => {
    expect(isCaseStatus("pending")).toBe(false);
    expect(isCaseStatus("")).toBe(false);
    expect(isCaseStatus(null)).toBe(false);
  });
});
