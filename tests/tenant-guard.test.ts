import { describe, expect, it } from "vitest";

function isAllowedRole(role: string, allowed: string[]) {
  return allowed.includes(role);
}

describe("tenant role checks", () => {
  it("permits allowed role", () => {
    expect(isAllowedRole("admin", ["owner", "admin"])).toBe(true);
  });

  it("rejects disallowed role", () => {
    expect(isAllowedRole("viewer", ["owner", "admin"])).toBe(false);
  });
});
