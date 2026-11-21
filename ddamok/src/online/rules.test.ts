import { describe, expect, it } from "vitest";
import { agreedRule, normalizeRule } from "./protocol.ts";

describe("매칭 규칙", () => {
  it("같은 규칙끼리 만나고, 무작위는 히든따목·지뢰따목과 만난다(따목과는 안 만난다)", () => {
    expect(agreedRule("hidden", "hidden")).toBe("hidden");
    expect(agreedRule("mine", "mine")).toBe("mine");
    expect(agreedRule("plain", "plain")).toBe("plain");
    expect(agreedRule("random", "hidden")).toBe("hidden");
    expect(agreedRule("mine", "random")).toBe("mine");
    expect(agreedRule("hidden", "mine")).toBeNull();
    expect(agreedRule("random", "plain")).toBeNull();
  });

  it("무작위끼리면 히든따목·지뢰따목 중 하나", () => {
    expect(agreedRule("random", "random", () => 0.2)).toBe("hidden");
    expect(agreedRule("random", "random", () => 0.7)).toBe("mine");
  });

  it("매치 종류별로 쓸 수 있는 규칙으로 바로잡는다(예전 값 포함)", () => {
    expect(normalizeRule("rated", "hidden")).toBe("random");
    expect(normalizeRule("casual", "any")).toBe("random");
    expect(normalizeRule("casual", "plain")).toBe("random");
    expect(normalizeRule("casual", "mine")).toBe("mine");
    expect(normalizeRule("friend", "nohidden")).toBe("plain");
    expect(normalizeRule("friend", "any")).toBe("hidden");
    expect(normalizeRule("friend", null)).toBe("hidden");
  });
});
