import { describe, expect, it } from "vitest";
import { isCaseStatus, parseDateQuery, parseListLimit } from "@/lib/backend/validation";

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

  it("parses valid date query and rejects invalid", () => {
    expect(parseDateQuery("2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00.000Z");
    expect(parseDateQuery("invalid-date")).toBeNull();
    expect(parseDateQuery(null)).toBeNull();
  });

  it("enforces list limit bounds", () => {
    expect(parseListLimit("999", { fallback: 50, min: 1, max: 100 })).toBe(100);
    expect(parseListLimit("0", { fallback: 50, min: 1, max: 100 })).toBe(1);
    expect(parseListLimit("abc", { fallback: 50, min: 1, max: 100 })).toBe(50);
  });
});
