"use client";
import { PRICE_MAX, PRICE_MIN, PRICE_STEP, type PriceRange } from "@/lib/domain/filters";

/**
 * Two-handle price slider (₩0 – ₩20,000+, ₩1,000 steps). Built from two native range inputs so it works with
 * touch, keyboard and screen readers. Large thumbs for phones; the handles can meet but never cross.
 */
export function PriceRangeSlider({ value, onChange, minLabel, maxLabel, textOf }: {
  value: PriceRange | null; onChange: (r: PriceRange) => void; minLabel: string; maxLabel: string;
  /** localized amount, e.g. ko "3,000원" / "20,000원 이상" */
  textOf: (v: number) => string;
}) {
  const min = value?.min ?? PRICE_MIN;
  const max = value?.max ?? PRICE_MAX;
  const pct = (v: number) => ((v - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
  const text = textOf;
  return (
    <div className="range">
      <div className="range__track" aria-hidden>
        <div className="range__fill" style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }} />
      </div>
      <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={min} aria-label={minLabel} aria-valuetext={text(min)}
        // when both handles sit at the top, keep the low one grabbable
        style={{ zIndex: min >= PRICE_MAX - PRICE_STEP ? 3 : 1 }}
        onChange={(e) => onChange({ min: Math.min(Number(e.target.value), max), max })} />
      <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={max} aria-label={maxLabel} aria-valuetext={text(max)}
        style={{ zIndex: 2 }}
        onChange={(e) => onChange({ min, max: Math.max(Number(e.target.value), min) })} />
      <div className="range__scale" aria-hidden>
        <span>{textOf(PRICE_MIN)}</span><span>{textOf(PRICE_MAX)}</span>
      </div>
    </div>
  );
}
