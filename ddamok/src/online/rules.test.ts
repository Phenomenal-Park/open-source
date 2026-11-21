import { describe, expect, it } from "vitest";
import { agreedRule } from "./protocol.ts";

describe("친선·친구매치 규칙 선택", () => {
  it("같은 규칙끼리, 또는 아무거나와 만난다", () => {
    expect(agreedRule("hidden", "hidden")).toBe(true);
    expect(agreedRule("nohidden", "nohidden")).toBe(false);
    expect(agreedRule("any", "hidden")).toBe(true);
    expect(agreedRule("nohidden", "any")).toBe(false);
  });
  it("둘 다 아무거나면 히든룰, 히든룰과 노히든룰은 만나지 않는다", () => {
    expect(agreedRule("any", "any")).toBe(true);
    expect(agreedRule("hidden", "nohidden")).toBeNull();
    expect(agreedRule("nohidden", "hidden")).toBeNull();
  });
});
