import { describe, expect, it } from "vitest";
import { CATALOGS, detectLang, rankLabel, translate } from "./index.ts";
import { ko } from "./ko.ts";
import { AI_LEVELS } from "../ai/levels.ts";

const keys = Object.keys(ko).sort();
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("다국어", () => {
  it("모든 언어가 같은 키를 갖고 빈 문구가 없다", () => {
    for (const [l, cat] of Object.entries(CATALOGS)) {
      expect(Object.keys(cat).sort(), l).toEqual(keys);
      for (const k of keys) expect((cat as Record<string, string>)[k].trim(), `${l} ${k}`).not.toBe("");
    }
  });

  it("값 자리({이름})와 강조(**)가 언어마다 같다", () => {
    for (const [l, cat] of Object.entries(CATALOGS)) {
      for (const k of keys) {
        const a = (ko as Record<string, string>)[k], b = (cat as Record<string, string>)[k];
        expect(vars(b), `${l} ${k}`).toEqual(vars(a));
        expect(b.split("**").length, `${l} ${k}`).toBe(a.split("**").length);
      }
    }
  });

  it("게임 이름: 따목의 신 / god of ddamok / タモクの神 — 로마자 표기는 반드시 소문자 ddamok", () => {
    expect([CATALOGS.ko, CATALOGS.en, CATALOGS.ja].map((c) => c["app.name"])).toEqual(["따목의 신", "god of ddamok", "タモクの神"]);
    for (const cat of Object.values(CATALOGS)) for (const v of Object.values(cat)) expect(v).not.toMatch(/Ddamok|DDAMOK|[Tt]tamok/);
  });

  it("급·단: 18급·1단 / 18 kyu·1 dan / 18級·初段·2段", () => {
    expect([500, 1700, 1800, 2500].map((r) => rankLabel("ko", r))).toEqual(["18급", "1단", "2단", "9단"]);
    expect([500, 1700, 1800, 2500].map((r) => rankLabel("en", r))).toEqual(["18 kyu", "1 dan", "2 dan", "9 dan"]);
    expect([500, 1605, 1700, 1800, 2500].map((r) => rankLabel("ja", r))).toEqual(["18級", "1級", "初段", "2段", "9段"]);
  });

  it("AI 이름이 모든 언어에 있다", () => {
    for (const l of AI_LEVELS) for (const cat of Object.values(CATALOGS)) expect((cat as Record<string, string>)[`ai.name.${l.id}`]).toBeTruthy();
    expect(translate("en", "ai.name.ai-6")).toBe("AI Diamond");
    expect(translate("ja", "ai.name.ai-5")).toBe("AI プラチナ");
  });

  it("언어 고르기: 저장된 선택 → 브라우저 언어 → 영어", () => {
    expect(detectLang("ja", ["ko-KR"])).toBe("ja");
    expect(detectLang(null, ["ko-KR", "en"])).toBe("ko");
    expect(detectLang(null, ["ja"])).toBe("ja");
    expect(detectLang(null, ["fr-FR", "de"])).toBe("en");
    expect(translate("ko", "points", { rating: "1500?" })).toBe("1500?점");
  });
});
